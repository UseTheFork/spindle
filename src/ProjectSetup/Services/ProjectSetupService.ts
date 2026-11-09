import { constants, copyFileSync, lstatSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { setupProjectCatalog } from "@/Assets/SetupProject/Catalog";
import { Service } from "@/Foundation/Service";

export interface SetupProjectInput {
  workspacePath: string;
}

export interface SetupProjectResult {
  workspace: string;
  created: string[];
  preserved: string[];
}

const assets = fileURLToPath(new URL("../../Assets/SetupProject/", import.meta.url));

function validateWorkspacePath(workspacePath: string): void {
  if (!isAbsolute(workspacePath)) {
    throw new Error("Workspace must be an absolute project directory.");
  }
}

export class ProjectSetupService extends Service {
  public setup({ workspacePath }: SetupProjectInput): SetupProjectResult {
    validateWorkspacePath(workspacePath);

    const workspace = realpathSync(workspacePath);
    if (!statSync(workspace).isDirectory()) {
      throw new Error("Workspace must be a directory.");
    }

    const created: string[] = [];
    const preserved: string[] = [];

    for (const relative of ["docs", "docs/adr", ".scratch", "docs/agents"]) {
      const target = join(workspace, relative);
      const entry = lstatSync(target, { throwIfNoEntry: false });
      if (entry) {
        if (!entry.isDirectory()) {
          throw new Error(`${relative} must be a real directory, not a file or symlink.`);
        }
        preserved.push(relative);
      } else {
        mkdirSync(target);
        created.push(relative);
      }
    }

    for (const [source, relative] of setupProjectCatalog) {
      const target = join(workspace, relative);
      const entry = lstatSync(target, { throwIfNoEntry: false });
      if (entry) {
        if (!entry.isFile()) {
          throw new Error(`${relative} must be a regular file, not a directory or symlink.`);
        }
        preserved.push(relative);
      } else {
        copyFileSync(join(assets, source), target, constants.COPYFILE_EXCL);
        created.push(relative);
      }
    }

    return { workspace, created, preserved };
  }
}
