import type { ConflictPolicy } from "@spindle/BlueprintManagement/Types/Installation";

export class ConflictPolicyParser {
  public static parseConflictPolicy(policy: string | undefined): ConflictPolicy | undefined {
    if (policy !== undefined && policy !== "overwrite" && policy !== "skip") {
      throw new Error(`Invalid --on-conflict '${policy}'. Use overwrite or skip.`);
    }
    return policy;
  }
}
