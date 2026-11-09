import type { ConflictPolicy } from "@/BlueprintManagement/Types/Installation";

export function parseConflictPolicy(policy: string | undefined): ConflictPolicy | undefined {
  if (policy !== undefined && policy !== "overwrite" && policy !== "skip") {
    throw new Error(`Invalid --on-conflict '${policy}'. Use overwrite or skip.`);
  }
  return policy;
}
