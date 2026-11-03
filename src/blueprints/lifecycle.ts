import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  assertSafeInstallPaths,
  assertSingleFileDestination,
  exists,
  installPlannedBlueprintFiles,
  preparePlannedBlueprintFiles,
  blueprintsRoot,
  type ConflictPolicy,
  type PlannedBlueprintFile,
  type PreparedBlueprintFile,
} from "../install.js";
import type { RenderContext } from "../render.js";
import { readBlueprintVersion } from "../version.js";
import {
  planBlueprintCatalog,
  readBlueprintCatalog,
  type CatalogDeletion,
  type CatalogSelection,
} from "./catalog.js";
import type { BlueprintHandler, BlueprintUpdatePlan } from "./types.js";

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
  reason: CatalogDeletion["reason"];
}

interface ReconcileCommon {
  githubDirectory: string;
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
    });

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
  deletions: PlannedBlueprintDeletion[];
  willInstall: boolean;
}

interface PlannedDeletionOperation {
  handler: BlueprintHandler;
  deletion: CatalogDeletion;
  plan: PlannedBlueprintDeletion;
}

export interface BlueprintHandlerCatalogPlan {
  handler: BlueprintHandler;
  selections: CatalogSelection[];
  catalogDeletions: CatalogDeletion[];
  deletions: PlannedBlueprintDeletion[];
}

export interface BlueprintCatalogReconciliationPlan {
  handlers: BlueprintHandlerCatalogPlan[];
  deletions: PlannedBlueprintDeletion[];
}

// Ticket-level coordinators can consume target paths and deletion reasons before applying changes.
export async function planBlueprintCatalogReconciliation(
  handlers: readonly BlueprintHandler[],
  githubDirectory: string,
  selectedStacks: string[],
): Promise<BlueprintCatalogReconciliationPlan> {
  const catalog = await readBlueprintCatalog(blueprintsRoot());
  const handlerPlans: BlueprintHandlerCatalogPlan[] = [];
  for (const handler of handlers) {
    const expansion = await planBlueprintCatalog(
      catalog,
      handler.catalogKind,
      handler.sourceDirectory(),
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
    handlerPlans.push({
      handler,
      selections: expansion.selections,
      catalogDeletions: expansion.deletions,
      deletions,
    });
  }
  return {
    handlers: handlerPlans,
    deletions: handlerPlans.flatMap((handlerPlan) => handlerPlan.deletions),
  };
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
  deletions: PlannedBlueprintDeletion[],
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
    deletions,
    willInstall,
  };
}

async function applyReconciliation(
  prepared: ReconciliationPlan,
  context: RenderContext | undefined,
  preparedFilesByName?: Map<string, PreparedBlueprintFile[]>,
): Promise<BlueprintOutcome[]> {
  const {
    handler,
    mode,
    githubDirectory,
    destinationDirectory,
    sourceFilesByName,
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
    if (replacing && handler.entryFile === undefined && !handler.fileTarget) {
      await rm(target, { recursive: true, force: true });
    }
    await mkdir(destinationDirectory, { recursive: true });
    const preparedFiles = preparedFilesByName?.get(blueprint.name);
    if (preparedFiles !== undefined) {
      await installPlannedBlueprintFiles(
        preparedFiles,
        target,
        handler.entryFile,
        replacing && (handler.entryFile !== undefined || handler.fileTarget === true),
        handler.fileTarget,
      );
    } else {
      for (const file of sourceFilesByName.get(blueprint.name)!) {
        const files = await prepareFiles([file], context!, handler, blueprint.renderedEntry);
        await installPlannedBlueprintFiles(
          files,
          target,
          handler.entryFile,
          false,
          handler.fileTarget,
        );
      }
    }
    outcomes.push({
      kind: handler.kind,
      name: blueprint.name,
      status: mode === "init" || blueprint.status === "new" ? "installed" : "updated",
    });
  }

  return outcomes;
}

async function validateDeletionTarget(
  githubDirectory: string,
  operation: PlannedDeletionOperation,
): Promise<boolean> {
  const { handler, deletion, plan } = operation;
  const destinationDirectory = handler.destinationDirectory(githubDirectory);
  const targetPath = (name: string) =>
    handler.targetPath?.(destinationDirectory, name) ?? join(destinationDirectory, name);
  await assertSafeInstallPaths(githubDirectory, [deletion.path], destinationDirectory, targetPath);
  try {
    const stat = await lstat(plan.target);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to remove '${plan.target}': symbolic-link targets are unsafe.`);
    }
    if (deletion.entry.directory ? !stat.isDirectory() : !stat.isFile()) {
      const expected = deletion.entry.directory ? "a directory" : "a regular file";
      throw new Error(`Refusing to remove '${plan.target}': expected ${expected}.`);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function applyCatalogDeletions(
  githubDirectory: string,
  operations: PlannedDeletionOperation[],
): Promise<BlueprintOutcome[]> {
  const outcomes: BlueprintOutcome[] = [];
  const completed: string[] = [];
  for (const operation of operations) {
    let targetExists: boolean;
    try {
      targetExists = await validateDeletionTarget(githubDirectory, operation);
    } catch (error) {
      throw new Error(
        `Failed to validate removal of ${operation.handler.kind} '${operation.deletion.path}' at '${operation.plan.target}': ${error instanceof Error ? error.message : String(error)}${completed.length > 0 ? ` Completed removals: ${completed.join(", ")}.` : ""}`,
        { cause: error },
      );
    }
    if (!targetExists) continue;
    try {
      await rm(operation.plan.target, {
        recursive: operation.deletion.entry.directory,
      });
    } catch (error) {
      throw new Error(
        `Failed to remove ${operation.handler.kind} '${operation.deletion.path}' at '${operation.plan.target}': ${error instanceof Error ? error.message : String(error)}${completed.length > 0 ? ` Completed removals: ${completed.join(", ")}.` : ""}`,
        { cause: error },
      );
    }
    completed.push(`${operation.handler.kind} '${operation.deletion.path}'`);
    outcomes.push({
      kind: operation.handler.kind,
      name: operation.deletion.path,
      status: "removed",
    });
  }
  return outcomes;
}

export async function reconcileBlueprints(
  handlers: readonly BlueprintHandler[],
  options: ReconcileOptions,
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
  await assertSafeInstallPaths(options.githubDirectory, [], options.githubDirectory);
  const catalogPlan = await planBlueprintCatalogReconciliation(
    handlers,
    options.githubDirectory,
    stacks,
  );
  for (const handlerPlan of catalogPlan.handlers) {
    const { handler, selections, catalogDeletions } = handlerPlan;
    const destinationDirectory = handler.destinationDirectory(options.githubDirectory);
    const deletions = handlerPlan.deletions;
    catalogDeletions.forEach((deletion, index) => {
      deletionOperations.push({ handler, deletion, plan: deletions[index] });
    });
    if (deletions.length > 0) hasBlueprints = true;
    if (handler.initialize !== undefined) {
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
  for (const operation of deletionOperations) {
    await validateDeletionTarget(options.githubDirectory, operation);
  }
  if (!hasBlueprints) throw new Error("No Blueprints are available to install.");
  let resolvedContext = options.context;
  const resolveContext = async () => {
    resolvedContext ??= await options.resolveContext?.();
    return resolvedContext;
  };
  const plans: ReconciliationPlan[] = [];
  for (const { handler, names, files, deletions } of collections) {
    plans.push(await planReconciliation(handler, options, names, files, deletions, resolveContext));
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
  const hasReplacement = plans.some((plan) =>
    plan.plan.some(
      (blueprint) =>
        (blueprint.status === "conflict" || blueprint.status === "update") &&
        plan.decisions.get(blueprint.name) === "overwrite",
    ),
  );
  const preparedFilesByPlan = new Map<ReconciliationPlan, Map<string, PreparedBlueprintFile[]>>();
  if (hasReplacement) {
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
  }
  for (const plan of plans) {
    outcomes.push(...(await applyReconciliation(plan, context, preparedFilesByPlan.get(plan))));
  }
  for (const { handler, selections, deletions } of initializers) {
    const initialized = await handler.initialize!(
      options.githubDirectory,
      context ?? { stacks, variables: {} },
      selections,
      deletions,
    );
    for (const name of initialized.installed) {
      outcomes.push({ kind: handler.kind, name, status: "installed" });
    }
    for (const name of initialized.removed) {
      outcomes.push({ kind: handler.kind, name, status: "removed" });
    }
  }
  outcomes.push(
    ...(await applyCatalogDeletions(
      options.githubDirectory,
      deletionOperations.filter((operation) => operation.handler.initialize === undefined),
    )),
  );
  if (options.mode === "init") {
    await mkdir(options.githubDirectory, { recursive: true });
    await writeFile(
      join(options.githubDirectory, "spindle.json"),
      `${JSON.stringify(options.config, null, 2)}\n`,
    );
  }
  return outcomes;
}
