import { lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import {
  planBlueprintCatalog,
  blueprintCatalog,
  validateBlueprintCatalog,
  type CatalogDeletion,
  type CatalogSelection,
} from "@/blueprints/catalog";
import type {
  BlueprintHandler,
  BlueprintUpdatePlan,
  PreparedBlueprintInitialization,
} from "@/blueprints/types";
import { ComputedContextService } from "@/computed/computed-context";
import type { Application } from "@/Foundation/Application";
import { InstallationService } from "@/installation/installation-service";
import type {
  ConflictPolicy,
  PlannedBlueprintFile,
  PreparedBlueprintFile,
} from "@/installation/types";
import type { RenderContext } from "@/render";
import { Service } from "@/Foundation/Service";
import {
  assertSafeInstallPaths,
  assertSingleFileDestination,
  exists,
  preparePlannedBlueprintFiles,
} from "@/utilities/blueprint-files";
import { readBlueprintVersion } from "@/version";

export interface BlueprintOutcome {
  kind: string;
  name: string;
  status: "installed" | "updated" | "skipped" | "up-to-date" | "removed";
  warning?: string;
}

export interface PlannedBlueprintDeletion {
  kind: string;
  catalogKind: string;
  key: string;
  path: string;
  target: string;
  directory: boolean;
  reason: CatalogDeletion["reason"] | "directory-membership";
}

interface ReconcileCommon {
  app: Application;
  githubDirectory: string;
  blueprintSourceRoot: string;
  context?: RenderContext;
  resolveContext?: () => Promise<RenderContext>;
  conflictPolicy?: ConflictPolicy;
  chooseNew?: (kind: string, names: string[]) => Promise<string[]>;
  chooseConflict?: (
    kind: string,
    name: string,
    installedVersion?: string,
    availableVersion?: string,
  ) => Promise<ConflictPolicy>;
}

interface PlannedConfigWrite {
  path: string;
  content: string;
}

type ReconcileOptions =
  | (ReconcileCommon & {
      mode: "init";
      context: RenderContext;
      config: { stacks: string[]; variables: Record<string, string> };
    })
  | (ReconcileCommon & {
      mode: "update";
      config?: { stacks: string[]; variables: Record<string, string> };
      includeNew?: boolean;
      prepareConfigWrite?: () => PlannedConfigWrite | undefined;
    });

type WithoutApplicationRoots<T> = T extends unknown
  ? Omit<T, "app" | "githubDirectory" | "blueprintSourceRoot">
  : never;

export type BlueprintReconciliationOptions = WithoutApplicationRoots<ReconcileOptions>;

interface PlannedBlueprint {
  name: string;
  status: "install" | "new" | "conflict" | "update" | "warning" | "up-to-date";
  warning?: string;
  installedVersion?: string;
  availableVersion?: string;
  versionedEntry?: BlueprintUpdatePlan["versionedEntry"];
  renderedEntry?: BlueprintUpdatePlan["renderedEntry"];
}

interface ReconciliationPlan {
  handler: BlueprintHandler;
  mode: ReconcileOptions["mode"];
  githubDirectory: string;
  destinationDirectory: string;
  sourceFilesByName: Map<string, PlannedBlueprintFile[]>;
  plan: PlannedBlueprint[];
  selectedNewBlueprints: Set<string>;
  decisions: Map<string, ConflictPolicy>;
  willInstall: boolean;
}

interface PlannedDeletionOperation {
  handler: BlueprintHandler;
  deletion: CatalogDeletion;
  plan: PlannedBlueprintDeletion;
}

interface PlannedMembershipCleanupOperation {
  handler: BlueprintHandler;
  plan: PlannedBlueprintDeletion;
}

interface RemovalTargetValidation {
  handler: BlueprintHandler;
  plan: PlannedBlueprintDeletion;
  expectedTarget: "file" | "directory";
}

interface RemovalOperation extends RemovalTargetValidation {
  recursive: boolean;
  validationDescription: string;
  removalDescription: string;
  completedName: string;
}

export interface BlueprintHandlerCatalogPlan {
  handler: BlueprintHandler;
  selections: CatalogSelection[];
  catalogDeletions: CatalogDeletion[];
  deletions: PlannedBlueprintDeletion[];
  membershipCleanup: PlannedBlueprintDeletion[];
}

async function collectDestinationFiles(directory: string, result: string[] = []) {
  let directoryStat;
  try {
    directoryStat = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return result;
    throw error;
  }
  if (directoryStat.isSymbolicLink()) {
    throw new Error(
      `Refusing to reconcile selected directory '${directory}': symbolic-link traversal is unsafe.`,
    );
  }
  if (!directoryStat.isDirectory()) {
    throw new Error(
      `Refusing to reconcile selected directory '${directory}': expected a directory.`,
    );
  }

  for (const entry of (await readdir(directory)).sort()) {
    const path = join(directory, entry);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Refusing to reconcile selected directory '${directory}': symbolic link '${path}' is unsafe.`,
      );
    }
    if (stat.isDirectory()) {
      await collectDestinationFiles(path, result);
    } else if (stat.isFile()) {
      result.push(path);
    } else {
      throw new Error(
        `Refusing to reconcile selected directory '${directory}': '${path}' is not a regular file or directory.`,
      );
    }
  }
  return result;
}

// Ticket-level coordinators can consume target paths and deletion reasons before applying changes.
async function planBlueprintCatalogReconciliation(
  handlers: readonly BlueprintHandler[],
  githubDirectory: string,
  blueprintSourceRoot: string,
  selectedStacks: string[],
): Promise<BlueprintHandlerCatalogPlan[]> {
  const catalog = validateBlueprintCatalog(blueprintCatalog);
  const handlerPlans: BlueprintHandlerCatalogPlan[] = [];
  for (const handler of handlers) {
    const expansion = await planBlueprintCatalog(
      catalog,
      handler.catalogKind,
      handler.sourceDirectory(blueprintSourceRoot),
      selectedStacks,
    );
    const destinationDirectory = handler.destinationDirectory(githubDirectory);
    const deletions = expansion.deletions.map((deletion) => ({
      kind: handler.kind,
      catalogKind: handler.catalogKind,
      key: deletion.entry.key,
      path: deletion.path,
      target:
        handler.targetPath?.(destinationDirectory, deletion.path) ??
        join(destinationDirectory, deletion.path),
      directory: deletion.entry.directory,
      reason: deletion.reason,
    }));
    const membershipCleanup: PlannedBlueprintDeletion[] = [];
    for (const directory of expansion.directories) {
      const directoryTarget =
        handler.targetPath?.(destinationDirectory, directory.path) ??
        join(destinationDirectory, directory.path);
      await assertSafeInstallPaths(
        githubDirectory,
        [directory.path],
        destinationDirectory,
        (name) =>
          handler.targetPath?.(destinationDirectory, name) ?? join(destinationDirectory, name),
      );
      const sourceFiles = new Set(directory.sourceFiles);
      const installedFiles = await collectDestinationFiles(directoryTarget);
      for (const installedFile of installedFiles) {
        const relativePath = relative(directoryTarget, installedFile).split(sep).join("/");
        if (sourceFiles.has(relativePath)) continue;
        const path = `${directory.path}/${relativePath}`;
        membershipCleanup.push({
          kind: handler.kind,
          catalogKind: handler.catalogKind,
          key: directory.entry.key,
          path,
          target:
            handler.targetPath?.(destinationDirectory, path) ?? join(destinationDirectory, path),
          directory: false,
          reason: "directory-membership",
        });
      }
    }
    handlerPlans.push({
      handler,
      selections: expansion.selections,
      catalogDeletions: expansion.deletions,
      deletions,
      membershipCleanup,
    });
  }
  return handlerPlans;
}

function willInstallBlueprint(
  blueprint: PlannedBlueprint,
  selectedNewBlueprints: Set<string>,
  decisions: Map<string, ConflictPolicy>,
) {
  return (
    blueprint.status === "install" ||
    (blueprint.status === "new" && selectedNewBlueprints.has(blueprint.name)) ||
    ((blueprint.status === "conflict" || blueprint.status === "update") &&
      decisions.get(blueprint.name) === "overwrite")
  );
}

async function prepareFiles(
  files: PlannedBlueprintFile[],
  context: RenderContext,
  handler: BlueprintHandler,
  renderedEntry?: BlueprintUpdatePlan["renderedEntry"],
): Promise<PreparedBlueprintFile[]> {
  const requireText =
    handler.entryFile !== undefined
      ? true
      : handler.fileTarget
        ? (file: PlannedBlueprintFile) => file.outputPath.toLowerCase().endsWith(".md")
        : false;
  if (renderedEntry === undefined) {
    return preparePlannedBlueprintFiles(files, context, handler.validateMetadata, requireText);
  }
  const prepared: PreparedBlueprintFile[] = [];
  for (const file of files) {
    if (
      file.sourcePath !== renderedEntry.sourcePath ||
      file.outputPath !== renderedEntry.outputPath
    ) {
      prepared.push(
        ...(await preparePlannedBlueprintFiles(
          [file],
          context,
          handler.validateMetadata,
          requireText,
        )),
      );
      continue;
    }

    const bytes = await readFile(file.sourcePath);
    if (!Buffer.from(renderedEntry.sourceText, "utf8").equals(bytes)) {
      throw new Error(`Blueprint entry '${file.outputPath}' changed while planning; run again.`);
    }
    if (bytes.includes(0)) {
      prepared.push(
        ...(await preparePlannedBlueprintFiles(
          [file],
          context,
          handler.validateMetadata,
          requireText,
        )),
      );
      continue;
    }
    handler.validateMetadata?.(file.outputPath, renderedEntry.renderedText);
    prepared.push({ ...file, renderedText: renderedEntry.renderedText });
  }
  return prepared;
}

async function planReconciliation(
  handler: BlueprintHandler,
  options: ReconcileOptions,
  blueprintNames: string[],
  sourceFilesByName: Map<string, PlannedBlueprintFile[]>,
  resolveContext: () => Promise<RenderContext | undefined>,
): Promise<ReconciliationPlan> {
  const { mode, githubDirectory } = options;
  const destinationDirectory = handler.destinationDirectory(githubDirectory);
  const targetPath = (name: string) =>
    handler.targetPath?.(destinationDirectory, name) ?? join(destinationDirectory, name);

  const plan: PlannedBlueprint[] = [];
  for (const name of blueprintNames) {
    const target = targetPath(name);
    const installed = await exists(target);

    if (mode === "init") {
      plan.push({ name, status: installed ? "conflict" : "install" });
      continue;
    }

    plan.push({
      name,
      ...(handler.planUpdate
        ? await handler.planUpdate({
            name,
            sourceFiles: sourceFilesByName.get(name)!,
            target,
            installed,
            resolveContext,
          })
        : { status: installed ? "conflict" : "new" }),
    });
  }

  const newBlueprints = plan.filter((blueprint) => blueprint.status === "new").map((b) => b.name);
  const selectedNewBlueprints = new Set(
    options.mode === "update"
      ? options.includeNew
        ? newBlueprints
        : options.chooseNew && newBlueprints.length > 0
          ? await options.chooseNew(handler.kind, newBlueprints)
          : []
      : [],
  );

  const decisions = new Map<string, ConflictPolicy>();
  for (const blueprint of plan) {
    if (blueprint.status !== "conflict" && blueprint.status !== "update") continue;
    if (options.conflictPolicy !== undefined) {
      decisions.set(blueprint.name, options.conflictPolicy);
    } else if (options.chooseConflict) {
      decisions.set(
        blueprint.name,
        await options.chooseConflict(
          handler.kind,
          blueprint.name,
          blueprint.installedVersion,
          blueprint.availableVersion,
        ),
      );
    } else if (blueprint.status === "conflict") {
      throw new Error(
        `${handler.kind} '${blueprint.name}' already exists; pass --on-conflict <overwrite|skip> to choose what to do in non-interactive runs.`,
      );
    } else {
      throw new Error(
        `${handler.kind} '${blueprint.name}' is outdated (${blueprint.installedVersion} -> ${blueprint.availableVersion}); pass --on-conflict <overwrite|skip> to choose what to do in non-interactive runs.`,
      );
    }
  }

  const willInstall = plan.some((blueprint) =>
    willInstallBlueprint(blueprint, selectedNewBlueprints, decisions),
  );
  return {
    handler,
    mode,
    githubDirectory,
    destinationDirectory,
    sourceFilesByName,
    plan,
    selectedNewBlueprints,
    decisions,
    willInstall,
  };
}

async function applyReconciliation(
  prepared: ReconciliationPlan,
  preparedFilesByName: Map<string, PreparedBlueprintFile[]>,
  membershipCleanupOperations: PlannedMembershipCleanupOperation[],
  installationService: InstallationService,
  recordAppliedChange: (description: string) => void,
): Promise<BlueprintOutcome[]> {
  const {
    handler,
    mode,
    githubDirectory,
    destinationDirectory,
    plan,
    selectedNewBlueprints,
    decisions,
  } = prepared;
  const targetPath = (name: string) =>
    handler.targetPath?.(destinationDirectory, name) ?? join(destinationDirectory, name);
  const outcomes: BlueprintOutcome[] = [];
  for (const blueprint of plan) {
    if (blueprint.status === "warning") {
      outcomes.push({
        kind: handler.kind,
        name: blueprint.name,
        status: "skipped",
        warning: blueprint.warning,
      });
      continue;
    }
    if (blueprint.status === "up-to-date") {
      outcomes.push({ kind: handler.kind, name: blueprint.name, status: "up-to-date" });
      continue;
    }
    if (blueprint.status === "new" && !selectedNewBlueprints.has(blueprint.name)) {
      outcomes.push({ kind: handler.kind, name: blueprint.name, status: "skipped" });
      continue;
    }
    if (
      (blueprint.status === "conflict" || blueprint.status === "update") &&
      decisions.get(blueprint.name) === "skip"
    ) {
      outcomes.push({ kind: handler.kind, name: blueprint.name, status: "skipped" });
      continue;
    }

    const target = targetPath(blueprint.name);
    await assertSafeInstallPaths(
      githubDirectory,
      [blueprint.name],
      destinationDirectory,
      targetPath,
    );
    const replacing = blueprint.status === "conflict" || blueprint.status === "update";
    const replacedMembershipPaths: PlannedBlueprintDeletion[] = [];
    try {
      if (replacing && handler.entryFile === undefined && !handler.fileTarget) {
        for (const operation of membershipCleanupOperations) {
          if (operation.handler !== handler) continue;
          const pathWithinTarget = relative(target, operation.plan.target);
          if (
            pathWithinTarget === "" ||
            pathWithinTarget === ".." ||
            pathWithinTarget.startsWith(`..${sep}`)
          ) {
            continue;
          }
          if (
            await validateRemovalTarget(githubDirectory, {
              ...operation,
              expectedTarget: "file",
            })
          ) {
            replacedMembershipPaths.push(operation.plan);
          }
        }
        await rm(target, { recursive: true, force: true });
        recordAppliedChange(
          `removed existing ${handler.kind} '${blueprint.name}' before replacement`,
        );
        for (const removed of replacedMembershipPaths) {
          recordAppliedChange(`removed destination-only ${handler.kind} file '${removed.path}'`);
        }
      }
      outcomes.push(
        ...replacedMembershipPaths.map((removed) => ({
          kind: handler.kind,
          name: removed.path,
          status: "removed" as const,
        })),
      );
      await mkdir(destinationDirectory, { recursive: true });
      const preparedFiles = preparedFilesByName.get(blueprint.name);
      if (preparedFiles === undefined) {
        throw new Error(`No prepared files are available for ${handler.kind} '${blueprint.name}'.`);
      }
      await installationService.installPreparedFiles(
        preparedFiles,
        target,
        handler.entryFile,
        replacing && (handler.entryFile !== undefined || handler.fileTarget === true),
        handler.fileTarget,
        (file) => {
          if (handler.kind === "Skill") {
            recordAppliedChange(`applied Skill file '${blueprint.name}/${file.outputPath}'`);
          }
        },
      );
      const status = mode === "init" || blueprint.status === "new" ? "installed" : "updated";
      recordAppliedChange(`${status} ${handler.kind} '${blueprint.name}'`);
    } catch (error) {
      throw new Error(
        `Failed to apply ${handler.kind} '${blueprint.name}': ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    outcomes.push({
      kind: handler.kind,
      name: blueprint.name,
      status: mode === "init" || blueprint.status === "new" ? "installed" : "updated",
    });
  }

  return outcomes;
}

async function validateRemovalTarget(
  githubDirectory: string,
  operation: RemovalTargetValidation,
): Promise<boolean> {
  const { handler, plan, expectedTarget } = operation;
  const destinationDirectory = handler.destinationDirectory(githubDirectory);
  const targetPath = (name: string) =>
    handler.targetPath?.(destinationDirectory, name) ?? join(destinationDirectory, name);
  await assertSafeInstallPaths(githubDirectory, [plan.path], destinationDirectory, targetPath);
  try {
    const stat = await lstat(plan.target);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to remove '${plan.target}': symbolic-link targets are unsafe.`);
    }
    if (expectedTarget === "directory" ? !stat.isDirectory() : !stat.isFile()) {
      const expected = expectedTarget === "directory" ? "a directory" : "a regular file";
      throw new Error(`Refusing to remove '${plan.target}': expected ${expected}.`);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function catalogRemovalOperation(operation: PlannedDeletionOperation): RemovalOperation {
  const { handler, deletion, plan } = operation;
  const name = `${handler.kind} '${deletion.path}'`;
  return {
    handler,
    plan,
    expectedTarget: deletion.entry.directory ? "directory" : "file",
    recursive: deletion.entry.directory,
    validationDescription: `removal of ${name}`,
    removalDescription: name,
    completedName: name,
  };
}

function membershipRemovalOperation(
  operation: PlannedMembershipCleanupOperation,
): RemovalOperation {
  const { handler, plan } = operation;
  const name = `${handler.kind} '${plan.path}'`;
  return {
    handler,
    plan,
    expectedTarget: "file",
    recursive: false,
    validationDescription: `directory-membership cleanup of ${name}`,
    removalDescription: `destination-only ${handler.kind} file '${plan.path}'`,
    completedName: name,
  };
}

async function applyRemovalOperations(
  githubDirectory: string,
  operations: RemovalOperation[],
  recordAppliedChange: (description: string) => void,
): Promise<BlueprintOutcome[]> {
  const outcomes: BlueprintOutcome[] = [];
  for (const operation of operations) {
    let targetExists: boolean;
    try {
      targetExists = await validateRemovalTarget(githubDirectory, operation);
    } catch (error) {
      throw new Error(
        `Failed to validate ${operation.validationDescription} at '${operation.plan.target}': ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    if (!targetExists) continue;
    try {
      await rm(operation.plan.target, { recursive: operation.recursive });
    } catch (error) {
      throw new Error(
        `Failed to remove ${operation.removalDescription} at '${operation.plan.target}': ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    recordAppliedChange(`removed ${operation.completedName}`);
    outcomes.push({
      kind: operation.handler.kind,
      name: operation.plan.path,
      status: "removed",
    });
  }
  return outcomes;
}

async function performReconciliation(
  handlers: readonly BlueprintHandler[],
  options: ReconcileOptions,
  installationService: InstallationService,
): Promise<BlueprintOutcome[]> {
  const outcomes: BlueprintOutcome[] = [];
  let hasBlueprints = false;
  const stacks = options.config?.stacks ?? options.context?.stacks ?? [];
  const collections: {
    handler: BlueprintHandler;
    names: string[];
    files: Map<string, PlannedBlueprintFile[]>;
    deletions: PlannedBlueprintDeletion[];
  }[] = [];
  const initializers: {
    handler: BlueprintHandler;
    selections: CatalogSelection[];
    deletions: CatalogDeletion[];
  }[] = [];
  const deletionOperations: PlannedDeletionOperation[] = [];
  const membershipCleanupOperations: PlannedMembershipCleanupOperation[] = [];
  await assertSafeInstallPaths(options.githubDirectory, [], options.githubDirectory);
  const handlerPlans = await planBlueprintCatalogReconciliation(
    handlers,
    options.githubDirectory,
    options.blueprintSourceRoot,
    stacks,
  );
  for (const handlerPlan of handlerPlans) {
    const { handler, selections, catalogDeletions } = handlerPlan;
    const destinationDirectory = handler.destinationDirectory(options.githubDirectory);
    const deletions = handlerPlan.deletions;
    membershipCleanupOperations.push(
      ...handlerPlan.membershipCleanup.map((plan) => ({ handler, plan })),
    );
    catalogDeletions.forEach((deletion, index) => {
      deletionOperations.push({ handler, deletion, plan: deletions[index] });
    });
    if (deletions.length > 0 || handlerPlan.membershipCleanup.length > 0) hasBlueprints = true;
    if (handler.prepareInitialize !== undefined) {
      if (selections.length > 0 || catalogDeletions.length > 0) {
        hasBlueprints = true;
        initializers.push({ handler, selections, deletions: catalogDeletions });
      }
      continue;
    }
    const files = new Map<string, PlannedBlueprintFile[]>();
    for (const selection of selections) {
      files.set(selection.name, selection.files);
    }
    const names = [...files.keys()];
    if (names.length === 0) continue;
    hasBlueprints = true;
    const targetPath = (name: string) =>
      handler.targetPath?.(destinationDirectory, name) ?? join(destinationDirectory, name);
    await assertSafeInstallPaths(options.githubDirectory, names, destinationDirectory, targetPath);
    if (handler.entryFile !== undefined || handler.fileTarget) {
      for (const name of names) await assertSingleFileDestination(targetPath(name));
    }
    collections.push({ handler, names, files, deletions });
  }
  const plannedRemovals = [
    ...deletionOperations.map(catalogRemovalOperation),
    ...membershipCleanupOperations.map(membershipRemovalOperation),
  ];
  for (const operation of plannedRemovals) {
    await validateRemovalTarget(options.githubDirectory, operation);
  }
  if (!hasBlueprints) throw new Error("No Blueprints are available to install.");
  let contextService: Promise<ComputedContextService> | undefined;
  const resolveContext = async () => {
    contextService ??= options.app.make(ComputedContextService);
    return (await contextService).resolve(
      async () => options.context ?? (await options.resolveContext?.()),
    );
  };
  const plans: ReconciliationPlan[] = [];
  for (const { handler, names, files } of collections) {
    plans.push(await planReconciliation(handler, options, names, files, resolveContext));
  }
  const installing = plans.find((plan) => plan.willInstall);
  const needsContext =
    installing !== undefined ||
    initializers.some((initializer) => initializer.selections.length > 0);
  const context = needsContext ? await resolveContext() : options.context;
  if (needsContext && !context) {
    throw new Error("Cannot install Blueprints without resolved Variables.");
  }
  for (const plan of plans) {
    const targetPath = (name: string) =>
      plan.handler.targetPath?.(plan.destinationDirectory, name) ??
      join(plan.destinationDirectory, name);
    await assertSafeInstallPaths(
      plan.githubDirectory,
      plan.plan.map((blueprint) => blueprint.name),
      plan.destinationDirectory,
      targetPath,
    );
    for (const blueprint of plan.plan) {
      if (plan.handler.entryFile !== undefined || plan.handler.fileTarget) {
        await assertSingleFileDestination(targetPath(blueprint.name));
      }
      const selectedNew =
        blueprint.status === "install" ||
        (blueprint.status === "new" && plan.selectedNewBlueprints.has(blueprint.name));
      if (selectedNew && (await exists(targetPath(blueprint.name)))) {
        throw new Error(
          `${plan.handler.kind} '${blueprint.name}' already exists; it appeared while planning. Run the command again to resolve the conflict.`,
        );
      }
    }
  }
  const preparedFilesByPlan = new Map<ReconciliationPlan, Map<string, PreparedBlueprintFile[]>>();
  // Capture every selected versioned entry before any supporting template can
  // mutate the shared context, and confirm the planned version still matches.
  for (const plan of plans) {
    for (const blueprint of plan.plan) {
      if (
        blueprint.status !== "update" ||
        !willInstallBlueprint(blueprint, plan.selectedNewBlueprints, plan.decisions) ||
        blueprint.renderedEntry !== undefined ||
        blueprint.versionedEntry === undefined
      ) {
        continue;
      }
      const { sourcePath, outputPath } = blueprint.versionedEntry;
      let renderedEntry: BlueprintUpdatePlan["renderedEntry"];
      const actual = await readBlueprintVersion(sourcePath, context!, {
        onRendered: (sourceText, renderedText) => {
          renderedEntry = { sourcePath, outputPath, sourceText, renderedText };
        },
      });
      if (actual !== blueprint.availableVersion || renderedEntry === undefined) {
        throw new Error(
          `${plan.handler.kind} '${blueprint.name}' version changed while planning; run again.`,
        );
      }
      blueprint.renderedEntry = renderedEntry;
    }
  }
  for (const plan of plans) {
    const preparedFilesByName = new Map<string, PreparedBlueprintFile[]>();
    for (const blueprint of plan.plan) {
      if (!willInstallBlueprint(blueprint, plan.selectedNewBlueprints, plan.decisions)) continue;
      preparedFilesByName.set(
        blueprint.name,
        await prepareFiles(
          plan.sourceFilesByName.get(blueprint.name)!,
          context!,
          plan.handler,
          blueprint.renderedEntry,
        ),
      );
    }
    preparedFilesByPlan.set(plan, preparedFilesByName);
  }
  const configWrite =
    options.mode === "init"
      ? {
          path: join(options.githubDirectory, "spindle.json"),
          content: `${JSON.stringify(options.config, null, 2)}\n`,
        }
      : options.prepareConfigWrite?.();
  const preparedInitializers: {
    handler: BlueprintHandler;
    initialization: PreparedBlueprintInitialization;
  }[] = [];
  try {
    for (const { handler, selections, deletions } of initializers) {
      preparedInitializers.push({
        handler,
        initialization: await handler.prepareInitialize!(
          options.githubDirectory,
          context ?? { stacks, variables: {} },
          selections,
          deletions,
        ),
      });
    }
  } catch (error) {
    await Promise.all(
      preparedInitializers.map(({ initialization }) =>
        initialization.dispose().catch(() => undefined),
      ),
    );
    throw error;
  }

  const completedChanges: string[] = [];
  const recordAppliedChange = (description: string) => completedChanges.push(description);
  try {
    for (const plan of plans) {
      outcomes.push(
        ...(await applyReconciliation(
          plan,
          preparedFilesByPlan.get(plan)!,
          membershipCleanupOperations,
          installationService,
          recordAppliedChange,
        )),
      );
    }
    for (const { handler, initialization } of preparedInitializers) {
      const initialized = await initialization.apply(recordAppliedChange);
      for (const name of initialized.installed) {
        outcomes.push({ kind: handler.kind, name, status: "installed" });
      }
      for (const name of initialized.removed) {
        outcomes.push({ kind: handler.kind, name, status: "removed" });
      }
    }
    outcomes.push(
      ...(await applyRemovalOperations(
        options.githubDirectory,
        deletionOperations
          .filter((operation) => operation.handler.prepareInitialize === undefined)
          .map(catalogRemovalOperation),
        recordAppliedChange,
      )),
    );
    outcomes.push(
      ...(await applyRemovalOperations(
        options.githubDirectory,
        membershipCleanupOperations.map(membershipRemovalOperation),
        recordAppliedChange,
      )),
    );
    if (configWrite !== undefined) {
      try {
        await mkdir(options.githubDirectory, { recursive: true });
        await writeFile(configWrite.path, configWrite.content);
        recordAppliedChange("wrote Config '.github/spindle.json'");
      } catch (error) {
        throw new Error(
          `Failed to write Config '${configWrite.path}': ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const progress =
      completedChanges.length > 0 ? ` Completed changes: ${completedChanges.join(", ")}.` : "";
    throw new Error(`${message}${progress} Application stopped; rollback was not attempted.`, {
      cause: error,
    });
  } finally {
    await Promise.all(
      preparedInitializers.map(({ initialization }) =>
        initialization.dispose().catch(() => undefined),
      ),
    );
  }
  return outcomes;
}

export class BlueprintReconciliationService extends Service {
  private installationService!: InstallationService;

  public constructor(app: Application) {
    super(app);
  }

  public override async boot(): Promise<void> {
    this.installationService = await this.app.make(InstallationService);
  }

  public async reconcile(
    handlers: readonly BlueprintHandler[],
    options: BlueprintReconciliationOptions,
  ): Promise<BlueprintOutcome[]> {
    return performReconciliation(
      handlers,
      {
        ...options,
        app: this.app,
        githubDirectory: join(this.app.workspaceRoot, ".github"),
        blueprintSourceRoot: this.app.blueprintSourceRoot,
      },
      this.installationService,
    );
  }
}
