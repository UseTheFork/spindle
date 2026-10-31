import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  assertSafeInstallPaths,
  exists,
  installDirectory,
  type ConflictPolicy,
} from "../install.js";
import type { RenderContext } from "../render.js";
import type { BlueprintHandler } from "./types.js";

export interface BlueprintOutcome {
  name: string;
  status: "installed" | "updated" | "skipped" | "up-to-date";
  warning?: string;
}

interface ReconcileCommon {
  githubDirectory: string;
  context?: RenderContext;
  resolveContext?: () => Promise<RenderContext>;
  conflictPolicy?: ConflictPolicy;
  chooseNew?: (skills: string[]) => Promise<string[]>;
  chooseConflict?: (
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
      config: { stacks: string[]; variables: Record<string, string> };
      includeNew?: boolean;
    });

interface PlannedBlueprint {
  name: string;
  status: "install" | "new" | "conflict" | "update" | "warning" | "up-to-date";
  warning?: string;
  installedVersion?: string;
  availableVersion?: string;
}

async function reconcileBlueprint(
  handler: BlueprintHandler,
  options: ReconcileOptions,
): Promise<BlueprintOutcome[]> {
  const { mode, githubDirectory } = options;
  const destinationDirectory = handler.destinationDirectory(githubDirectory);
  const sourceDirectory = handler.sourceDirectory();
  const blueprintNames = (await readdir(sourceDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (blueprintNames.length === 0) {
    throw new Error(`No ${handler.kind.toLowerCase()} Blueprints are available to install.`);
  }
  await assertSafeInstallPaths(githubDirectory, blueprintNames, destinationDirectory);

  const plan: PlannedBlueprint[] = [];
  let resolvedContext = options.context;
  const resolveContext = async () => {
    resolvedContext ??= await options.resolveContext?.();
    return resolvedContext;
  };
  for (const name of blueprintNames) {
    const target = join(destinationDirectory, name);
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
            source: join(sourceDirectory, name),
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
          ? await options.chooseNew(newBlueprints)
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

  const willInstall = plan.some(
    (blueprint) =>
      blueprint.status === "install" ||
      (blueprint.status === "new" && selectedNewBlueprints.has(blueprint.name)) ||
      ((blueprint.status === "conflict" || blueprint.status === "update") &&
        decisions.get(blueprint.name) === "overwrite"),
  );
  const context = willInstall
    ? (resolvedContext ?? (await options.resolveContext?.()) ?? options.context)
    : options.context;
  if (willInstall && !context) {
    throw new Error(`Cannot install ${handler.kind}s without resolved Variables.`);
  }

  const outcomes: BlueprintOutcome[] = [];
  for (const blueprint of plan) {
    if (blueprint.status === "warning") {
      outcomes.push({ name: blueprint.name, status: "skipped", warning: blueprint.warning });
      continue;
    }
    if (blueprint.status === "up-to-date") {
      outcomes.push({ name: blueprint.name, status: "up-to-date" });
      continue;
    }
    if (blueprint.status === "new" && !selectedNewBlueprints.has(blueprint.name)) {
      outcomes.push({ name: blueprint.name, status: "skipped" });
      continue;
    }
    if (
      (blueprint.status === "conflict" || blueprint.status === "update") &&
      decisions.get(blueprint.name) === "skip"
    ) {
      outcomes.push({ name: blueprint.name, status: "skipped" });
      continue;
    }

    const target = join(destinationDirectory, blueprint.name);
    if (blueprint.status === "conflict" || blueprint.status === "update") {
      await rm(target, { recursive: true, force: true });
    }
    await mkdir(destinationDirectory, { recursive: true });
    await installDirectory(
      join(sourceDirectory, blueprint.name),
      target,
      context!,
      handler.validateMetadata,
    );
    outcomes.push({
      name: blueprint.name,
      status: mode === "init" || blueprint.status === "new" ? "installed" : "updated",
    });
  }

  return outcomes;
}

export async function reconcileBlueprints(
  handlers: readonly BlueprintHandler[],
  options: ReconcileOptions,
): Promise<BlueprintOutcome[]> {
  const outcomes: BlueprintOutcome[] = [];
  for (const handler of handlers) {
    outcomes.push(...(await reconcileBlueprint(handler, options)));
  }
  if (options.mode === "init") {
    await writeFile(
      join(options.githubDirectory, "spindle.json"),
      `${JSON.stringify(options.config, null, 2)}\n`,
    );
  }
  return outcomes;
}
