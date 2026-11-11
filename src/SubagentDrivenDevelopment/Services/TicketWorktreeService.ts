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
  renameSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitService } from "@/Git/Services/GitService";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import type { FeaturePaths, TicketProgress } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { isPathInside, lstatIfPresent } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { Records } from "@/Support/Records";

interface TicketStartState {
  version: 2;
  id: string;
  feature: string;
  ticket: string;
  owner: string;
  featureWorkspace: string;
  workspace: string;
  branch: string;
  baseSha: string;
  directory?: { device: number; inode: number };
}

export class TicketWorktreeService extends Service {
  public constructor(
    app: Application,
    private readonly git: GitService,
    private readonly gitEvidence: GitEvidence,
  ) {
    super(app);
  }

  public create(
    feature: FeaturePaths,
    progress: TicketProgress,
    directory: string | undefined,
    requiredAncestors: string[],
    allowPendingRecords = false,
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
    if (this.run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== state.featureBranch) {
      throw new Error("Ticket worktrees must start from the canonical feature branch.");
    }
    const currentSha = this.run(root, ["rev-parse", "--verify", "HEAD"]);
    const lockPath = `.scratch/${feature.feature}/.sdd-tickets.lock`;
    if (allowPendingRecords) {
      if (this.gitEvidence.cleanDispatchBaseline(feature, true) !== currentSha) {
        throw new Error("Feature HEAD changed during ticket dispatch.");
      }
    } else {
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
    }
    const hook = this.run(root, ["rev-parse", "--git-path", "hooks/post-checkout"]);
    let activeHook = false;
    try {
      accessSync(isAbsolute(hook) ? hook : join(root, hook), constants.X_OK);
      activeHook = true;
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        (error.code !== "ENOENT" && error.code !== "EACCES")
      ) {
        throw error;
      }
    }
    if (activeHook) {
      throw new Error(
        "Active Git post-checkout hook requires manual handling before ticket dispatch.",
      );
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
    if (!progress.owner) throw new Error("Ticket startup requires a recorded controller.");
    let stateRecord: TicketStartState;
    const journalEntry = lstatIfPresent(journal);
    if (journalEntry) {
      if (!journalEntry.isFile() || journalEntry.isSymbolicLink()) {
        throw new Error(`Ticket startup journal is not a regular file: ${journal}.`);
      }
      const saved: unknown = JSON.parse(readFileSync(journal, "utf8"));
      if (
        !Records.isRecord(saved) ||
        saved.version !== 2 ||
        typeof saved.id !== "string" ||
        saved.feature !== feature.feature ||
        saved.ticket !== progress.id ||
        saved.owner !== progress.owner ||
        saved.featureWorkspace !== root ||
        saved.workspace !== workspace ||
        saved.branch !== branch ||
        typeof saved.baseSha !== "string" ||
        !/^[0-9a-f]{40,64}$/i.test(saved.baseSha) ||
        (saved.directory !== undefined && !Records.isRecord(saved.directory))
      ) {
        throw new Error(
          `Ticket startup journal does not match the current assignment: ${journal}.`,
        );
      }
      const directoryState = saved.directory;
      let directoryIdentity: TicketStartState["directory"];
      if (directoryState !== undefined) {
        if (
          !Records.isRecord(directoryState) ||
          typeof directoryState.device !== "number" ||
          typeof directoryState.inode !== "number"
        ) {
          throw new Error(
            `Ticket startup journal contains invalid directory identity: ${journal}.`,
          );
        }
        directoryIdentity = { device: directoryState.device, inode: directoryState.inode };
      }
      stateRecord = {
        version: 2,
        id: saved.id,
        feature: feature.feature,
        ticket: progress.id,
        owner: progress.owner,
        featureWorkspace: root,
        workspace,
        branch,
        baseSha: saved.baseSha,
        ...(directoryIdentity ? { directory: directoryIdentity } : {}),
      };
    } else {
      if (lstatIfPresent(workspace)) {
        throw new Error(`Ticket worktree destination already exists: ${workspace}.`);
      }
      if (this.branchExists(root, branch))
        throw new Error(`Ticket branch already exists: ${branch}.`);
      if (requiredAncestors.some((ancestor) => !this.isAncestor(root, ancestor, currentSha))) {
        throw new Error("Feature branch does not contain every validated prerequisite.");
      }
      stateRecord = {
        version: 2,
        id: randomUUID(),
        feature: feature.feature,
        ticket: progress.id,
        owner: progress.owner,
        featureWorkspace: root,
        workspace,
        branch,
        baseSha: currentSha,
      };
      try {
        this.writeState(journal, stateRecord, true);
      } catch (error) {
        throw new Error(
          `Ticket startup state could not be created; inspect ${journal}. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (
      !this.isAncestor(root, stateRecord.baseSha, currentSha) ||
      requiredAncestors.some((ancestor) => !this.isAncestor(root, ancestor, stateRecord.baseSha))
    ) {
      throw new Error(
        "Ticket startup baseline does not include the current prerequisite integrations; preserve the recorded worktree and inspect it before continuing.",
      );
    }
    try {
      const registered = this.run(root, ["worktree", "list", "--porcelain", "-z"])
        .split("\0")
        .includes(`worktree ${workspace}`);
      if (!registered) {
        if (this.branchExists(root, branch)) {
          throw new Error(`Ticket branch exists without its recorded worktree: ${branch}.`);
        }
        let directoryEntry = lstatIfPresent(workspace);
        if (!directoryEntry) {
          if (stateRecord.directory) throw new Error("Recorded ticket directory is missing.");
          mkdirSync(workspace);
          directoryEntry = lstatSync(workspace);
          stateRecord.directory = { device: directoryEntry.dev, inode: directoryEntry.ino };
          this.writeState(journal, stateRecord);
        }
        if (
          !directoryEntry.isDirectory() ||
          directoryEntry.isSymbolicLink() ||
          !stateRecord.directory ||
          directoryEntry.dev !== stateRecord.directory.device ||
          directoryEntry.ino !== stateRecord.directory.inode
        ) {
          throw new Error(`Ticket worktree directory ownership cannot be verified: ${workspace}.`);
        }
      }
      if (
        this.run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== state.featureBranch ||
        this.run(root, ["rev-parse", "--verify", "HEAD"]) !== currentSha
      ) {
        throw new Error("Feature branch advanced during ticket worktree creation.");
      }
      if (!registered) {
        this.run(root, ["worktree", "add", "-b", branch, workspace, stateRecord.baseSha]);
      }
      const directoryEntry = lstatSync(workspace);
      if (
        !stateRecord.directory ||
        !directoryEntry.isDirectory() ||
        directoryEntry.isSymbolicLink() ||
        directoryEntry.dev !== stateRecord.directory.device ||
        directoryEntry.ino !== stateRecord.directory.inode ||
        realpathSync(workspace) !== workspace ||
        realpathSync(this.run(workspace, ["rev-parse", "--show-toplevel"])) !== workspace ||
        realpathSync(
          this.run(workspace, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
        ) !== common ||
        this.run(workspace, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== branch ||
        this.run(workspace, ["rev-parse", "--verify", "HEAD"]) !== stateRecord.baseSha ||
        this.run(workspace, ["status", "--porcelain=v1", "--untracked-files=all"]) !== ""
      ) {
        throw new Error("Created ticket worktree failed verification.");
      }
      const finalStatus = allowPendingRecords
        ? this.gitEvidence.cleanDispatchBaseline(feature, true) === currentSha
        : this.run(root, [
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
            "--ignore-submodules=none",
            "--",
            ".",
            `:(exclude,literal)${lockPath}`,
          ]) === "";
      if (
        this.run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== state.featureBranch ||
        this.run(root, ["rev-parse", "--verify", "HEAD"]) !== currentSha ||
        !finalStatus
      ) {
        throw new Error("Feature branch or checkout changed during ticket worktree creation.");
      }
      return { workspace, branch, baseSha: stateRecord.baseSha, journal };
    } catch (error) {
      throw new Error(
        `Ticket worktree startup stopped; preserve and inspect ${journal}, ${branch}, and ${workspace}. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private branchExists(root: string, branch: string): boolean {
    const result = this.git.run(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`Cannot check ticket branch: ${result.stderr.trim()}`);
    }
    return result.status === 0;
  }

  private isAncestor(root: string, ancestor: string, descendant: string): boolean {
    const result = this.git.run(["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`Cannot verify ticket startup ancestry: ${result.stderr.trim()}`);
    }
    return result.status === 0;
  }

  private writeState(path: string, state: TicketStartState, create = false): void {
    const target = create ? path : `${path}.${randomUUID()}.tmp`;
    const fd = openSync(target, "wx", 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (!create) renameSync(target, path);
    const directory = openSync(join(path, ".."), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }

  private run(root: string, args: string[]): string {
    const result = this.git.run(args, { cwd: root, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    return result.stdout.trim();
  }
}
