import { constants, copyFileSync, lstatSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { App, Service } from "../../app.js";

export interface SetupProjectInput {
  workspacePath: string;
}

export interface SetupProjectResult {
  workspace: string;
  created: string[];
  preserved: string[];
}

const templates = fileURLToPath(new URL("../../setup-project/templates/", import.meta.url));

export class SetupProjectCommand extends Service {
  constructor(app: App) {
    super(app);
  }

  run({ workspacePath }: SetupProjectInput): SetupProjectResult {
    if (!isAbsolute(workspacePath)) {
      throw new Error("Workspace must be an absolute project directory.");
    }

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

    for (const [source, relative] of [
      ["domain.md", "docs/agents/domain.md"],
      ["issue-tracker-local.md", "docs/agents/issue-tracker.md"],
      ["triage-labels.md", "docs/agents/triage-labels.md"],
      ["tooling.md", "docs/agents/tooling.md"],
    ]) {
      const target = join(workspace, relative);
      const entry = lstatSync(target, { throwIfNoEntry: false });
      if (entry) {
        if (!entry.isFile()) {
          throw new Error(`${relative} must be a regular file, not a directory or symlink.`);
        }
        preserved.push(relative);
      } else {
        copyFileSync(join(templates, source), target, constants.COPYFILE_EXCL);
        created.push(relative);
      }
    }

    return { workspace, created, preserved };
  }
}
