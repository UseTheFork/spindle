import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

import type { BlueprintHandler } from "@spindle/BlueprintManagement/Types/Blueprint";
import type { BlueprintOutcome } from "@spindle/BlueprintManagement/Types/Reconciliation";
import { Service } from "@spindle/Foundation/Service";
import { GitService } from "@spindle/Git/Services/GitService";
import { projectSettingsPath } from "@spindle/Settings/Services/ProjectSettingsService";

// Guard the ref update because commit hooks can stage files outside the selected paths.
const referenceGuard = `#!/usr/bin/env node
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const input = readFileSync(0, "utf8");
const config = JSON.parse(readFileSync(process.env.SPINDLE_UPDATE_GUARD, "utf8"));
if (process.argv[2] === "prepared") {
  for (const line of input.trimEnd().split("\\n")) {
    const [oldId, newId, ref] = line.split(" ");
    if (ref !== "HEAD" && ref !== config.branch) continue;
    if (oldId !== config.head) {
      console.error("Auto-commit aborted: HEAD changed during the update commit.");
      process.exit(1);
    }
    const diff = spawnSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "--no-renames", "-z", oldId, newId], { encoding: "utf8" });
    if (diff.error || diff.status !== 0) {
      console.error("Auto-commit could not verify the commit paths:", diff.error || diff.stderr);
      process.exit(1);
    }
    const extra = diff.stdout.split("\\0").filter(path => path && !config.paths.includes(path));
    if (extra.length) {
      console.error("Auto-commit aborted: Git hooks staged unrelated paths:", extra.join(", "));
      process.exit(1);
    }
  }
}
if (config.originalHook) {
  let hook = spawnSync(config.originalHook, process.argv.slice(2), { input, encoding: "utf8" });
  if (hook.error && hook.error.code === "ENOEXEC")
    hook = spawnSync("sh", [config.originalHook, ...process.argv.slice(2)], { input, encoding: "utf8" });
  if (hook.stdout) process.stdout.write(hook.stdout);
  if (hook.stderr) process.stderr.write(hook.stderr);
  if (hook.error) {
    console.error(hook.error.message);
    process.exit(1);
  }
  process.exit(hook.status === null ? 1 : hook.status);
}
`;

export interface UpdateCommitSnapshot {
  dirtyPaths: string[];
  ignoredPaths: string[];
  settings: Buffer;
}

export interface UpdateCommitResult {
  status: "committed" | "skipped" | "failed";
  level: "info" | "warning";
  message: string;
}

export class UpdateAutoCommitService extends Service {
  public async snapshot(): Promise<UpdateCommitSnapshot> {
    const git = await this.app.make(GitService);
    return {
      dirtyPaths: this.changedPaths(git),
      ignoredPaths: this.ignoredPaths(git),
      settings: readFileSync(this.app.workspacePath(projectSettingsPath)),
    };
  }

  public async commit(
    snapshot: UpdateCommitSnapshot,
    outcomes: readonly BlueprintOutcome[],
    handlers: readonly BlueprintHandler[],
    lifecycleChanges: readonly string[],
    message: string,
  ): Promise<UpdateCommitResult> {
    const git = await this.app.make(GitService);
    const workspace = this.app.workspacePath();
    const scopes = new Set<string>();
    for (const outcome of outcomes) {
      if (!["installed", "updated", "removed"].includes(outcome.status)) continue;
      const handler = handlers.find((candidate) => candidate.kind === outcome.kind);
      if (!handler) throw new Error(`Unknown Blueprint kind '${outcome.kind}'.`);
      const destination = handler.destinationDirectory(this.app.workspacePath(".github"));
      const target =
        handler.targetPath?.(destination, outcome.name) ?? join(destination, outcome.name);
      scopes.add(relative(workspace, target).split(sep).join("/"));
    }
    for (const path of lifecycleChanges) {
      const fullPath = resolve(workspace, path);
      if (lstatSync(fullPath, { throwIfNoEntry: false })?.isFile()) {
        scopes.add(relative(workspace, fullPath).split(sep).join("/"));
      }
    }
    if (!snapshot.settings.equals(readFileSync(this.app.workspacePath(projectSettingsPath)))) {
      scopes.add(projectSettingsPath);
    } else {
      scopes.delete(projectSettingsPath);
    }

    const withinScope = (path: string) =>
      [...scopes].some((scope) => path === scope || path.startsWith(`${scope}/`));
    const ignoredWithinScope = (path: string) =>
      withinScope(path.replace(/\/$/, "")) ||
      (path.endsWith("/") && [...scopes].some((scope) => scope.startsWith(path)));
    const dirty = [
      ...snapshot.dirtyPaths.filter(withinScope),
      ...snapshot.ignoredPaths.filter(ignoredWithinScope),
    ];
    if (dirty.length > 0) {
      return {
        status: "skipped",
        level: "warning",
        message: `Auto-commit skipped: update paths had uncommitted changes before the update: ${dirty.join(", ")}. Commit the changes manually.`,
      };
    }
    const ignored = this.ignoredPaths(git).filter(ignoredWithinScope);
    if (ignored.length > 0) {
      return {
        status: "skipped",
        level: "warning",
        message: `Auto-commit skipped: update paths are ignored by Git: ${ignored.join(", ")}. Commit the changes manually.`,
      };
    }
    const paths = this.changedPaths(git).filter(withinScope);
    if (paths.length === 0) {
      return {
        status: "skipped",
        level: "info",
        message: "Auto-commit skipped: no update changes to commit.",
      };
    }
    const operationPaths = git.gitPaths(workspace, [
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
      "rebase-apply",
      "rebase-merge",
      "sequencer",
    ]);
    if (operationPaths.some((path) => existsSync(resolve(workspace, path)))) {
      throw new Error("Finish the ongoing Git operation before committing the update.");
    }
    const version = /^git version (\d+)\.(\d+)/.exec(this.git(git, ["--version"]));
    if (
      !version ||
      Number(version[1]) < 2 ||
      (Number(version[1]) === 2 && Number(version[2]) < 29)
    ) {
      throw new Error("Auto-commit requires Git 2.29 or newer to verify commit paths.");
    }

    const pathspecs = paths.map((path) => `:(literal)${path}`);
    const staged = git.run(["diff", "--cached", "--quiet", "--", ...pathspecs], {
      cwd: workspace,
      encoding: "utf8",
    });
    if (staged.error) throw staged.error;
    if (staged.status === 1) {
      return {
        status: "skipped",
        level: "warning",
        message:
          "Auto-commit skipped: an update path was staged during the update. Commit the changes manually.",
      };
    }
    if (staged.status !== 0) throw new Error(`git diff failed: ${staged.stderr.trim()}`);
    const originalIndex = this.git(git, ["ls-files", "--stage", "-z", "--", ...pathspecs]);
    const directory = mkdtempSync(join(tmpdir(), "spindle-update-index-"));
    const index = join(directory, "index");
    const environment = { ...process.env, GIT_INDEX_FILE: index };
    let result: UpdateCommitResult | undefined;
    let failure: unknown;
    try {
      const head = this.git(git, ["rev-parse", "--verify", "HEAD"]).trim();
      const branchResult = git.run(["symbolic-ref", "-q", "HEAD"], {
        cwd: workspace,
        encoding: "utf8",
      });
      if (branchResult.error) throw branchResult.error;
      if (branchResult.status !== 0 && branchResult.status !== 1) {
        throw new Error(`git symbolic-ref failed: ${branchResult.stderr.trim()}`);
      }
      const hooksPath = resolve(
        workspace,
        this.git(git, ["rev-parse", "--git-path", "hooks"]).trim(),
      );
      const hooksDirectory = join(directory, "hooks");
      mkdirSync(hooksDirectory);
      if (statSync(hooksPath, { throwIfNoEntry: false })?.isDirectory()) {
        for (const entry of readdirSync(hooksPath)) {
          if (entry !== "reference-transaction") {
            symlinkSync(join(hooksPath, entry), join(hooksDirectory, entry));
          }
        }
      }
      const originalHook = join(hooksPath, "reference-transaction");
      let executableHook: string | undefined;
      if (existsSync(originalHook)) {
        try {
          accessSync(originalHook, constants.X_OK);
          executableHook = originalHook;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EACCES") throw error;
        }
      }
      const guardPath = join(directory, "guard.json");
      writeFileSync(
        guardPath,
        JSON.stringify({
          head,
          branch: branchResult.stdout.trim(),
          paths,
          originalHook: executableHook,
        }),
      );
      writeFileSync(join(hooksDirectory, "reference-transaction"), referenceGuard, { mode: 0o755 });
      this.git(git, ["read-tree", head], environment);
      this.git(git, ["add", "-A", "--", ...pathspecs], environment);
      this.git(
        git,
        [
          "-c",
          `core.hooksPath=${hooksDirectory}`,
          "commit",
          "--only",
          "-m",
          message,
          "--",
          ...pathspecs,
        ],
        { ...environment, SPINDLE_UPDATE_GUARD: guardPath },
      );
      try {
        if (this.git(git, ["ls-files", "--stage", "-z", "--", ...pathspecs]) !== originalIndex) {
          throw new Error("The index changed during the commit.");
        }
        this.git(git, ["reset", "-q", "HEAD", "--", ...pathspecs]);
      } catch (error) {
        result = {
          status: "committed",
          level: "warning",
          message: `Update committed, but the Git index could not be synchronized: ${error instanceof Error ? error.message : String(error)}. Check the index before continuing.`,
        };
      }
      result ??= { status: "committed", level: "info", message: `Committed update: ${message}` };
    } catch (error) {
      failure = error;
    } finally {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch (error) {
        const detail = `Could not remove temporary Git index '${directory}': ${error instanceof Error ? error.message : String(error)}`;
        if (result) {
          result = { ...result, level: "warning", message: `${result.message} ${detail}` };
        } else {
          failure = new Error(
            `${failure instanceof Error ? failure.message : String(failure)}. ${detail}`,
            { cause: failure },
          );
        }
      }
    }
    if (failure) throw failure;
    if (!result) throw new Error("Git commit did not produce a result.");
    return result;
  }

  private changedPaths(git: GitService): string[] {
    return git.changedPaths(this.app.workspacePath());
  }

  private ignoredPaths(git: GitService): string[] {
    const ignored = this.git(git, [
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--directory",
      "-z",
    ]);
    return ignored.split("\0").filter(Boolean);
  }

  private git(git: GitService, args: string[], env?: NodeJS.ProcessEnv): string {
    const result = git.run(args, {
      cwd: this.app.workspacePath(),
      encoding: "utf8",
      ...(env === undefined ? {} : { env }),
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `git ${args[0]} failed: ${result.stderr.trim() || `exit status ${result.status}`}`,
      );
    }
    return result.stdout;
  }
}
