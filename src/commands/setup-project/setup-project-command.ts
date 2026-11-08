import { constants, copyFileSync, lstatSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Command } from "commander";

import { once } from "@/commands/shared-options";
import type { Application } from "@/foundation/Application";
import { Service } from "@/services/Service";

export interface SetupProjectInput {
  workspacePath: string;
}

export interface SetupProjectResult {
  workspace: string;
  created: string[];
  preserved: string[];
}

const templates = fileURLToPath(new URL("../../setup-project/templates/", import.meta.url));

function validateWorkspacePath(workspacePath: string): void {
  if (!isAbsolute(workspacePath)) {
    throw new Error("Workspace must be an absolute project directory.");
  }
}

export class SetupProjectCommand extends Service {
  public static register(program: Command, createApp: () => Promise<Application>): void {
    program
      .command("setup-project")
      .description("Create project documentation directories and missing Spindle defaults.")
      .requiredOption(
        "--workspace <path>",
        "Existing absolute target directory (may be outside Git)",
        once("--workspace"),
      )
      .allowExcessArguments(false)
      .action(async (options: { workspace: string }) => {
        validateWorkspacePath(options.workspace);
        const command = await (await createApp()).make(SetupProjectCommand);
        console.log(JSON.stringify(command.run({ workspacePath: options.workspace }), null, 2));
      });
  }

  public constructor(app: Application) {
    super(app);
  }

  public run({ workspacePath }: SetupProjectInput): SetupProjectResult {
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
