import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveBlueprintSourceRoot(workspaceRoot: string): string {
  if (process.env.SPINDLE_BLUEPRINTS_DIR) {
    return resolve(workspaceRoot, process.env.SPINDLE_BLUEPRINTS_DIR);
  }
  const adjacent = fileURLToPath(new URL("../blueprints/", import.meta.url));
  if (existsSync(join(adjacent, "skills"))) return adjacent;
  return fileURLToPath(new URL("../../src/blueprints/", import.meta.url));
}
