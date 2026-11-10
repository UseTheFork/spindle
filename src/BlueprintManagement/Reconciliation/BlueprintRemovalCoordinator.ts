import { lstat, rm } from "node:fs/promises";
import { join } from "node:path";

import type { CatalogDeletion } from "@/BlueprintManagement/Catalog/BlueprintCatalog";
import { assertSafeInstallPaths } from "@/BlueprintManagement/Support/BlueprintFiles";
import type { BlueprintHandler } from "@/BlueprintManagement/Types/Blueprint";
import type { PlannedBlueprintDeletion } from "@/BlueprintManagement/Types/Reconciliation";
import type { BlueprintOutcome } from "@/BlueprintManagement/Types/Reconciliation";

export interface PlannedDeletionOperation {
  handler: BlueprintHandler;
  deletion: CatalogDeletion;
  plan: PlannedBlueprintDeletion;
}

export interface PlannedMembershipCleanupOperation {
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

export async function validateRemovalTarget(
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

export function catalogRemovalOperation(operation: PlannedDeletionOperation): RemovalOperation {
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

export function membershipRemovalOperation(
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

export async function applyRemovalOperations(
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
