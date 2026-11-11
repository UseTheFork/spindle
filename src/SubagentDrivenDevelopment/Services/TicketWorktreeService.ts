import { randomUUID } from "node:crypto";
import {
  accessSync,
  constants,
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitService } from "@/Git/Services/GitService";
import type { FeaturePaths, TicketProgress } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { isPathInside, lstatIfPresent } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { Records } from "@/Support/Records";

export class TicketWorktreeService extends Service {
  public constructor(
    app: Application,
    private readonly git: GitService,
  ) {
    super(app);
  }

  public create(
    feature: FeaturePaths,
    progress: TicketProgress,
    directory: string | undefined,
  ): { workspace: string; branch: string; baseSha: string; journal: string } {
    for (const variable of [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_COMMON_DIR",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_NAMESPACE",
    ]) {
      if (process.env[variable]) throw new Error(`Unset ${variable} before ticket dispatch.`);
    }
    if (!directory || !isAbsolute(directory)) {
      throw new Error("--workspace must be an absolute existing external directory.");
    }
    const root = realpathSync(this.app.workspaceRoot);
    const entry = lstatIfPresent(directory);
    if (!entry?.isDirectory() || entry.isSymbolicLink()) {
      throw new Error("--workspace must be an existing real directory.");
    }
    const parent = realpathSync(directory);
    accessSync(parent, constants.W_OK | constants.X_OK);
    const common = realpathSync(
      this.run(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
    );
    const statePath = join(common, "spindle-feature-start", `${feature.feature}.json`);
    const stateEntry = lstatIfPresent(statePath);
    if (!stateEntry?.isFile() || stateEntry.isSymbolicLink()) {
      throw new Error(`Feature startup state is missing or unsafe: ${statePath}.`);
    }
    const state: unknown = JSON.parse(readFileSync(statePath, "utf8"));
    if (
      !Records.isRecord(state) ||
      state.version !== 1 ||
      state.phase !== "created" ||
      state.feature !== feature.feature ||
      state.featureBranch !== `features/${feature.feature}` ||
      state.featureWorkspace !== root ||
      typeof state.originalWorkspace !== "string" ||
      !isAbsolute(state.originalWorkspace)
    ) {
      throw new Error("Feature startup state does not identify this canonical feature worktree.");
    }
    const original = realpathSync(state.originalWorkspace);
    if (
      realpathSync(this.run(original, ["rev-parse", "--show-toplevel"])) !== original ||
      realpathSync(
        this.run(original, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
      ) !== common
    ) {
      throw new Error("Recorded original checkout no longer matches the feature repository.");
    }
    if (
      isPathInside(original, parent) ||
      isPathInside(root, parent) ||
      isPathInside(common, parent)
    ) {
      throw new Error(
        "--workspace must be outside the original and feature checkouts and Git directory.",
      );
    }
    const branch = `tickets/${feature.feature}/${progress.id}`;
    const workspace = join(parent, `${feature.feature}-${progress.id}`);
    if (lstatIfPresent(workspace)) {
      throw new Error(`Ticket worktree destination already exists: ${workspace}.`);
    }
    if (this.run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== state.featureBranch) {
      throw new Error("Ticket worktrees must start from the canonical feature branch.");
    }
    const baseSha = this.run(root, ["rev-parse", "--verify", "HEAD"]);
    const branchResult = this.git.run(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd: root,
      encoding: "utf8",
    });
    if (branchResult.error) throw branchResult.error;
    if (branchResult.status === 0) throw new Error(`Ticket branch already exists: ${branch}.`);
    if (branchResult.status !== 1)
      throw new Error(`Cannot check ticket branch: ${branchResult.stderr.trim()}`);
    const lockPath = `.scratch/${feature.feature}/.sdd-tickets.lock`;
    const status = this.run(root, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--ignore-submodules=none",
      "--",
      ".",
      `:(exclude,literal)${lockPath}`,
    ]);
    if (status) {
      throw new Error(
        `Commit canonical workflow records and resolve other changes before ticket dispatch:\n${status}`,
      );
    }
    const hook = this.run(root, ["rev-parse", "--git-path", "hooks/post-checkout"]);
    try {
      accessSync(isAbsolute(hook) ? hook : join(root, hook), constants.X_OK);
      throw new Error(
        "Active Git post-checkout hook requires manual handling before ticket dispatch.",
      );
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Active Git")) throw error;
    }
    const journals = join(common, "spindle-ticket-start");
    try {
      mkdirSync(journals, { mode: 0o700 });
    } catch (error) {
      if (!lstatIfPresent(journals)?.isDirectory()) throw error;
    }
    if (!lstatSync(journals).isDirectory() || lstatSync(journals).isSymbolicLink()) {
      throw new Error("Ticket startup state directory must be a real directory.");
    }
    const journal = join(journals, `${feature.feature}-${progress.id}.json`);
    const stateRecord = {
      version: 1,
      id: randomUUID(),
      feature: feature.feature,
      ticket: progress.id,
      owner: progress.owner,
      featureWorkspace: root,
      workspace,
      branch,
      baseSha,
    };
    try {
      const fd = openSync(journal, "wx", 0o600);
      try {
        writeFileSync(fd, `${JSON.stringify(stateRecord, null, 2)}\n`);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      const directoryFd = openSync(journals, "r");
      try {
        fsyncSync(directoryFd);
      } finally {
        closeSync(directoryFd);
      }
    } catch (error) {
      throw new Error(
        `Ticket startup state could not be created; inspect ${journal}. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      mkdirSync(workspace);
      if (
        this.run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== state.featureBranch ||
        this.run(root, ["rev-parse", "--verify", "HEAD"]) !== baseSha
      ) {
        throw new Error("Feature branch advanced during ticket worktree creation.");
      }
      this.run(root, ["worktree", "add", "-b", branch, workspace, baseSha]);
      if (
        this.run(workspace, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== branch ||
        this.run(workspace, ["rev-parse", "--verify", "HEAD"]) !== baseSha ||
        this.run(workspace, ["status", "--porcelain=v1", "--untracked-files=all"]) !== ""
      ) {
        throw new Error("Created ticket worktree failed verification.");
      }
      if (
        this.run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== state.featureBranch ||
        this.run(root, ["rev-parse", "--verify", "HEAD"]) !== baseSha ||
        this.run(root, [
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
          "--ignore-submodules=none",
          "--",
          ".",
          `:(exclude,literal)${lockPath}`,
        ]) !== ""
      ) {
        throw new Error("Feature branch or checkout changed during ticket worktree creation.");
      }
      return { workspace, branch, baseSha, journal };
    } catch (error) {
      throw new Error(
        `Ticket worktree startup stopped; preserve and inspect ${journal}, ${branch}, and ${workspace}. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private run(root: string, args: string[]): string {
    const result = this.git.run(args, { cwd: root, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    return result.stdout.trim();
  }
}
