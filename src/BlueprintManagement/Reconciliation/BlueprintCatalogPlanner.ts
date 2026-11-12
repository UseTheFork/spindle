import { lstat, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import {
  planBlueprintCatalog,
  blueprintCatalog,
  validateBlueprintCatalog,
  type CatalogDeletion,
  type CatalogSelection,
} from "@/BlueprintManagement/Catalog/BlueprintCatalog";
import { assertSafeInstallPaths } from "@/BlueprintManagement/Support/BlueprintFiles";
import type { BlueprintHandler } from "@/BlueprintManagement/Types/Blueprint";
import type { PlannedBlueprintDeletion } from "@/BlueprintManagement/Types/Reconciliation";
import { readInstalledBlueprintMetadata } from "@/BlueprintManagement/Versioning/InstalledBlueprintMetadata";

export interface BlueprintHandlerCatalogPlan {
  handler: BlueprintHandler;
  selections: CatalogSelection[];
  catalogDeletions: CatalogDeletion[];
  deletions: PlannedBlueprintDeletion[];
  membershipCleanup: PlannedBlueprintDeletion[];
  managed: Set<string>;
}

async function scanManagedBlueprints(handler: BlueprintHandler, directory: string) {
  const managed = new Set<string>();
  const visit = async (current: string) => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Refusing to scan symbolic link '${path}'.`);
      }
      if (handler.catalogKind === "skills") {
        if (!entry.isDirectory()) continue;
        const entryFile = join(path, "SKILL.md");
        try {
          if ((await lstat(entryFile)).isSymbolicLink()) {
            throw new Error(`Refusing to scan symbolic link '${entryFile}'.`);
          }
          if ((await readInstalledBlueprintMetadata(entryFile)).managed) {
            managed.add(relative(directory, path).split(sep).join("/"));
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          await visit(path);
        }
      } else if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        if ((await readInstalledBlueprintMetadata(path)).managed) {
          managed.add(relative(directory, path).split(sep).join("/"));
        }
      }
    }
  };
  await visit(directory);
  return managed;
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

export async function planBlueprintCatalogReconciliation(
  handlers: readonly BlueprintHandler[],
  githubDirectory: string,
  blueprintSourceRoot: string,
  selectedStacks: string[],
  mode: "init" | "update",
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
    await assertSafeInstallPaths(githubDirectory, [], destinationDirectory);
    const managed =
      mode === "update"
        ? await scanManagedBlueprints(handler, destinationDirectory)
        : new Set<string>();
    const selectedNames = new Set(expansion.selections.map((selection) => selection.name));
    const catalogDeletions = mode === "init" ? expansion.deletions : [];
    const deletions: PlannedBlueprintDeletion[] = catalogDeletions.map((deletion) => ({
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
    if (mode === "update") {
      for (const name of managed) {
        if (selectedNames.has(name)) continue;
        deletions.push({
          kind: handler.kind,
          catalogKind: handler.catalogKind,
          key: name,
          path: name,
          target: join(destinationDirectory, name),
          directory: handler.catalogKind === "skills",
          reason: "obsolete",
        });
      }
    }
    const membershipCleanup: PlannedBlueprintDeletion[] = [];
    for (const directory of expansion.directories) {
      if (mode === "update" && handler.catalogKind === "skills" && !managed.has(directory.path)) {
        continue;
      }
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
        if (mode === "update" && handler.catalogKind !== "skills" && !managed.has(path)) continue;
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
      catalogDeletions,
      deletions,
      membershipCleanup,
      managed,
    });
  }
  return handlerPlans;
}
