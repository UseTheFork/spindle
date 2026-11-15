import { createHash, randomUUID } from "node:crypto";
import {
  accessSync,
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitService } from "@/Git/Services/GitService";
import { FEATURE_DIRECTORY, type FeaturePaths } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { FileSystem } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { Records } from "@/Support/Records";

interface RecordCommitState {
  version: 1;
  feature: string;
  workspace: string;
  branch: string;
  parent: string;
  paths: string[];
  digest: string;
  tree?: string;
}

export class WorkflowRecordsCommitter extends Service {
  public constructor(
    app: Application,
    private readonly git: GitService,
  ) {
    super(app);
  }

  public commit(feature: FeaturePaths): string | undefined {
    for (const variable of [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_COMMON_DIR",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_NAMESPACE",
    ]) {
      if (process.env[variable]) {
        throw new Error(`Unset ${variable} before committing workflow records.`);
      }
    }
    const root = realpathSync(this.app.workspaceRoot);
    if (
      realpathSync(feature.workspace) !==
      realpathSync(join(root, ".spindle/features", feature.feature))
    ) {
      throw new Error("Canonical workflow records do not belong to this feature worktree.");
    }
    const branch = this.run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]).trim();
    if (branch !== `features/${feature.feature}`) {
      throw (
        this.misplacedCheckoutError(root, feature.feature, branch) ??
        new Error(
          `Canonical workflow records can only be committed on features/${feature.feature}; current branch is ${branch}.`,
        )
      );
    }
    this.assertNoGitOperation(root);
    this.assertNoHooks(root);

    const transient = new Set([
      `.spindle/features/${feature.feature}/.sdd-tickets.lock`,
      `.spindle/features/${feature.feature}/.sdd-write-recovery.json`,
    ]);
    const staged = this.paths(root, ["diff", "--cached", "--name-only", "--no-renames", "-z"]);
    const unstaged = this.paths(root, ["diff", "--name-only", "--no-renames", "-z"]);
    const untracked = this.paths(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
    const changed = [...new Set([...staged, ...unstaged, ...untracked])]
      .filter((path) => !transient.has(path))
      .sort();
    const journal = this.journalPath(root, feature.feature);
    const directory = dirname(journal);
    const journalEntry = FileSystem.lstatIfPresent(journal);
    let state: RecordCommitState;
    if (journalEntry) {
      const directoryEntry = lstatSync(directory);
      if (!directoryEntry.isDirectory() || directoryEntry.isSymbolicLink()) {
        throw new Error("Canonical record journal directory must be a real directory.");
      }
      if (!journalEntry.isFile() || journalEntry.isSymbolicLink()) {
        throw new Error(`Canonical record journal is not a regular file: ${journal}.`);
      }
      let saved: unknown;
      try {
        saved = JSON.parse(readFileSync(journal, "utf8"));
      } catch (error) {
        throw new Error(
          `Canonical record journal is unreadable; preserve and inspect ${journal}. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (
        !Records.isRecord(saved) ||
        saved.version !== 1 ||
        saved.feature !== feature.feature ||
        saved.workspace !== root ||
        saved.branch !== branch ||
        typeof saved.parent !== "string" ||
        !/^[0-9a-f]{40,64}$/i.test(saved.parent) ||
        !Array.isArray(saved.paths) ||
        saved.paths.length === 0 ||
        !saved.paths.every(
          (path) => typeof path === "string" && this.isCanonicalRecord(feature, path),
        ) ||
        typeof saved.digest !== "string" ||
        !/^[0-9a-f]{64}$/i.test(saved.digest) ||
        (saved.tree !== undefined &&
          (typeof saved.tree !== "string" || !/^[0-9a-f]{40,64}$/i.test(saved.tree)))
      ) {
        throw new Error(`Canonical record journal does not match this worktree: ${journal}.`);
      }
      const paths = saved.paths.map((path: unknown) => {
        if (typeof path !== "string") throw new Error("Invalid canonical record path.");
        return path;
      });
      if (JSON.stringify([...new Set(paths)].sort()) !== JSON.stringify(paths)) {
        throw new Error(`Canonical record journal has invalid paths: ${journal}.`);
      }
      state = {
        version: 1,
        feature: feature.feature,
        workspace: root,
        branch,
        parent: saved.parent,
        paths,
        digest: saved.digest,
        ...(typeof saved.tree === "string" ? { tree: saved.tree } : {}),
      };
    } else {
      if (staged.length > 0) {
        throw new Error(
          `Staged data was preserved; inspect and commit or unstage it before continuing: ${staged.join(", ")}`,
        );
      }
      if (changed.length === 0) return undefined;
      const invalid = changed.filter((path) => !this.isCanonicalRecord(feature, path));
      if (invalid.length > 0) {
        throw new Error(
          `Unrelated or non-canonical changes were preserved; resolve them before continuing:\n${invalid.join("\n")}`,
        );
      }
      state = {
        version: 1,
        feature: feature.feature,
        workspace: root,
        branch,
        parent: this.run(root, ["rev-parse", "--verify", "HEAD"]),
        paths: changed,
        digest: this.digest(root, changed),
      };
      try {
        mkdirSync(directory, { mode: 0o700 });
      } catch (error) {
        if (!FileSystem.lstatIfPresent(directory)?.isDirectory()) throw error;
      }
      const entry = lstatSync(directory);
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new Error("Canonical record journal directory must be a real directory.");
      }
      this.writeState(journal, state, true);
    }

    try {
      const head = this.run(root, ["rev-parse", "--verify", "HEAD"]);
      if (head !== state.parent) {
        this.assertCommitted(root, state, head);
        if (changed.length > 0 || this.digest(root, state.paths) !== state.digest) {
          throw new Error("Committed records or the worktree changed during recovery.");
        }
        this.removeState(journal);
        return head;
      }
      if (
        JSON.stringify(changed) !== JSON.stringify(state.paths) ||
        this.digest(root, state.paths) !== state.digest ||
        staged.some((path) => unstaged.includes(path))
      ) {
        throw new Error("Journalled records or staged data changed during recovery.");
      }
      this.run(root, ["add", "-A", "--", ...state.paths.map((path) => `:(literal)${path}`)]);
      const selected = this.paths(root, [
        "diff",
        "--cached",
        "--name-only",
        "--no-renames",
        "-z",
      ]).sort();
      if (JSON.stringify(selected) !== JSON.stringify(state.paths)) {
        throw new Error(
          `Staged records changed during batching; preserve and inspect the index. Expected ${state.paths.join(", ")}, found ${selected.join(", ")}.`,
        );
      }
      const remaining = [
        ...this.paths(root, ["diff", "--name-only", "-z"]),
        ...this.paths(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
      ].filter((path) => !transient.has(path));
      if (remaining.length > 0 || this.digest(root, state.paths) !== state.digest) {
        throw new Error(
          `Feature records changed during batching; preserve the index and worktree: ${remaining.join(", ")}`,
        );
      }
      const tree = this.run(root, ["write-tree"]);
      if (state.tree && state.tree !== tree) {
        throw new Error("Journalled record index changed during recovery.");
      }
      if (!state.tree) {
        state.tree = tree;
        this.writeState(journal, state);
      }
      if (this.run(root, ["rev-parse", "--verify", "HEAD"]) !== state.parent) {
        throw new Error("Feature branch advanced during canonical record batching.");
      }
      this.assertNoGitOperation(root);
      this.assertNoHooks(root);
      this.run(root, ["commit", "-m", `spindle: record ${feature.feature} workflow`]);
      const committedHead = this.run(root, ["rev-parse", "--verify", "HEAD"]);
      this.assertCommitted(root, state, committedHead);
      const after = [
        ...this.paths(root, ["diff", "--name-only", "-z"]),
        ...this.paths(root, ["diff", "--cached", "--name-only", "-z"]),
        ...this.paths(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
      ].filter((path) => !transient.has(path));
      if (after.length > 0 || this.digest(root, state.paths) !== state.digest) {
        throw new Error(
          `Canonical records were committed, but additional changes remain; preserve and inspect them: ${after.join(", ")}`,
        );
      }
      this.removeState(journal);
      return committedHead;
    } catch (error) {
      throw new Error(
        `Canonical record batching stopped; preserve ${journal}, the index, and the worktree. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  public workspaceRecords(workspace: string): FeaturePaths | undefined {
    const location = this.locate(workspace);
    return location && location.branch === `features/${location.feature}`
      ? this.featurePaths(location.feature, location.workspace)
      : undefined;
  }

  public assertWritable(workspace: string): FeaturePaths | undefined {
    const location = this.locate(workspace);
    if (!location) return undefined;
    if (location.branch === `features/${location.feature}`) {
      return this.featurePaths(location.feature, location.workspace);
    }
    const error = this.misplacedCheckoutError(location.root, location.feature, location.branch);
    if (error) throw error;
    return undefined;
  }

  public hasPendingCommit(feature: FeaturePaths): boolean {
    const root = realpathSync(this.app.workspaceRoot);
    return FileSystem.lstatIfPresent(this.journalPath(root, feature.feature)) !== undefined;
  }

  private journalPath(root: string, feature: string): string {
    return join(this.commonDirectory(root), "spindle-record-commit", `${feature}.json`);
  }

  private commonDirectory(root: string): string {
    return realpathSync(
      this.run(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
    );
  }

  private locate(
    workspace: string,
  ): { root: string; workspace: string; feature: string; branch: string } | undefined {
    const root = realpathSync(this.app.workspaceRoot);
    const featureWorkspace = realpathSync(workspace);
    const feature = basename(featureWorkspace);
    if (
      !FEATURE_DIRECTORY.test(feature) ||
      featureWorkspace !== realpathSync(join(root, ".spindle/features", feature))
    ) {
      return undefined;
    }
    const branch = this.run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    return { root, workspace: featureWorkspace, feature, branch };
  }

  private featurePaths(feature: string, workspace: string): FeaturePaths {
    return {
      feature,
      workspace,
      spec: join(workspace, "spec.md"),
      ledger: join(workspace, "sdd.json"),
    };
  }

  private misplacedCheckoutError(root: string, feature: string, branch: string): Error | undefined {
    const path = join(this.commonDirectory(root), "spindle-feature-start", `${feature}.json`);
    const entry = FileSystem.lstatIfPresent(path);
    if (!entry) return undefined;
    if (!entry.isFile() || entry.isSymbolicLink()) {
      return new Error(`Feature startup state must be a regular file: ${path}.`);
    }
    const state: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!Records.isRecord(state) || state.phase !== "created") return undefined;
    return new Error(
      `Feature ${feature} has started; run this command from its feature worktree ${String(state.featureWorkspace)} (branch features/${feature}), not ${root} (branch ${branch}).`,
    );
  }

  private digest(root: string, paths: string[]): string {
    const entries = paths.map((path) => {
      const entry = FileSystem.lstatIfPresent(join(root, path));
      if (!entry) return [path, "deleted"];
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error(`Canonical record is not a regular file: ${path}.`);
      }
      return [
        path,
        entry.mode & 0o111 ? "100755" : "100644",
        createHash("sha256")
          .update(readFileSync(join(root, path)))
          .digest("hex"),
      ];
    });
    return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
  }

  private assertCommitted(root: string, state: RecordCommitState, head: string): void {
    const ancestry = this.run(root, ["rev-list", "--parents", "-n", "1", head]).split(/\s+/);
    const committed = this.paths(root, [
      "diff",
      "--name-only",
      "-z",
      "--no-renames",
      state.parent,
      head,
    ]).sort();
    if (
      !state.tree ||
      head === state.parent ||
      ancestry.length !== 2 ||
      ancestry[1] !== state.parent ||
      this.run(root, ["show", "-s", "--format=%T", head]) !== state.tree ||
      this.run(root, ["show", "-s", "--format=%s", head]) !==
        `spindle: record ${state.feature} workflow` ||
      JSON.stringify(committed) !== JSON.stringify(state.paths)
    ) {
      throw new Error(
        "Canonical record commit failed verification; preserve and inspect Git state.",
      );
    }
  }

  private assertNoGitOperation(root: string): void {
    if (this.paths(root, ["ls-files", "--unmerged", "-z"]).length > 0) {
      throw new Error("Resolve unmerged index entries before committing workflow records.");
    }
    for (const operation of [
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
      "REBASE_HEAD",
      "rebase-merge",
      "rebase-apply",
      "sequencer",
    ]) {
      const path = resolve(root, this.run(root, ["rev-parse", "--git-path", operation]));
      if (FileSystem.lstatIfPresent(path)) {
        throw new Error(
          `Complete the existing Git operation (${operation}) before committing records.`,
        );
      }
    }
  }

  private assertNoHooks(root: string): void {
    for (const hook of ["pre-commit", "prepare-commit-msg", "commit-msg", "post-commit"]) {
      const path = resolve(root, this.run(root, ["rev-parse", "--git-path", `hooks/${hook}`]));
      try {
        accessSync(path, constants.X_OK);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error.code === "ENOENT" || error.code === "EACCES")
        ) {
          continue;
        }
        throw error;
      }
      throw new Error(
        `Active Git hook ${path} requires manual handling before committing records.`,
      );
    }
  }

  private writeState(path: string, state: RecordCommitState, create = false): void {
    const target = create ? path : `${path}.${randomUUID()}.tmp`;
    const fd = openSync(target, "wx", 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    if (!create) renameSync(target, path);
    this.syncDirectory(join(path, ".."));
  }

  private removeState(path: string): void {
    unlinkSync(path);
    this.syncDirectory(join(path, ".."));
  }

  private syncDirectory(path: string): void {
    const fd = openSync(path, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  private isCanonicalRecord(feature: FeaturePaths, path: string): boolean {
    const prefix = `.spindle/features/${feature.feature}/`;
    if (!path.startsWith(prefix)) return false;
    const relative = path.slice(prefix.length);
    return (
      relative === "spec.md" ||
      relative === "design.md" ||
      relative === "sdd.json" ||
      /^tickets\/T-\d{4,}\.md$/.test(relative) ||
      /^reports\/[^/]+\.md$/.test(relative)
    );
  }

  private paths(root: string, args: string[]): string[] {
    const result = this.git.run(args, {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    }
    const output = result.stdout;
    return output ? output.split("\0").filter(Boolean) : [];
  }

  private run(root: string, args: string[]): string {
    const result = this.git.run(args, {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    }
    return result.stdout.trim();
  }
}
