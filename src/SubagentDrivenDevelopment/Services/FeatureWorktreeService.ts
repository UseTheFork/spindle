import { createHash, randomUUID } from "node:crypto";
import {
  accessSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitService } from "@/Git/Services/GitService";
import type { StartOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { isPathInside, lstatIfPresent } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { Records } from "@/Support/Records";

interface StartState {
  version: 1;
  id: string;
  feature: string;
  originalWorkspace: string;
  originalBranch: string;
  originalRevision: string;
  featureBranch: string;
  featureWorkspace: string;
  phase: "planned" | "committed" | "allocated" | "created";
  featureRevision?: string;
  records: { paths: string[]; digest: string };
  targetIdentity?: { device: number; inode: number };
}

export class FeatureWorktreeService extends Service {
  public constructor(
    app: Application,
    private readonly git: GitService,
    private readonly inspection: FeatureInspectionService,
    private readonly transaction: WorkspaceTransaction,
  ) {
    super(app);
  }

  public start(options: StartOptions): StartState & { stateFile: string; spec: string } {
    if (options.confirmRecords !== true) {
      throw new Error("Inspect feature records for sensitive content and pass --confirm-records.");
    }
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
        throw new Error(`Unset ${variable} before starting a feature worktree.`);
      }
    }
    const root = realpathSync(this.app.workspaceRoot);
    const feature = this.inspection.resolveFeature(options.spec);
    if (!isAbsolute(options.workspace)) {
      throw new Error("--workspace must be an absolute path to an existing external directory.");
    }
    const parentEntry = lstatIfPresent(options.workspace);
    if (!parentEntry?.isDirectory() || parentEntry.isSymbolicLink()) {
      throw new Error("--workspace must be an existing real directory, not a file or symlink.");
    }
    const parent = realpathSync(options.workspace);
    accessSync(parent, constants.W_OK | constants.X_OK);
    const common = realpathSync(
      this.run(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
    );
    if (isPathInside(root, parent) || isPathInside(common, parent)) {
      throw new Error("--workspace must be outside the original checkout and Git directory.");
    }
    const target = join(parent, feature.feature);
    const branch = `features/${feature.feature}`;
    const prefix = `.scratch/${feature.feature}/`;
    const featurePath = `.scratch/${feature.feature}`;
    const lockPath = `${prefix}.sdd-tickets.lock`;
    return this.transaction.run(feature.workspace, () => {
      const featureLedger: unknown = JSON.parse(readFileSync(feature.ledger, "utf8"));
      if (this.referencesFeaturePath(featureLedger, feature.workspace)) {
        throw new Error(
          "Feature ledger contains paths to the original feature workspace; resolve them before starting.",
        );
      }
      const branchResult = this.git.run(["symbolic-ref", "--quiet", "--short", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      });
      if (branchResult.error) throw branchResult.error;
      if (branchResult.status !== 0 || !branchResult.stdout.trim()) {
        throw new Error("Starting a feature requires an attached original branch.");
      }
      const originalBranch = branchResult.stdout.trim();
      const originalRevision = this.run(root, ["rev-parse", "--verify", "HEAD"]);
      if (!/^[0-9a-f]{40,64}$/i.test(originalRevision)) throw new Error("Invalid Git HEAD.");
      this.assertNoGitOperation(root);
      this.assertNoHooks(root);
      this.assertNoUnrelatedChanges(root, prefix, lockPath);
      this.assertFeatureRecords(root, prefix, lockPath);
      this.assertNoDivergentStagedRecords(root);
      const ignored = this.runBuffer(root, [
        "ls-files",
        "--others",
        "--ignored",
        "--exclude-standard",
        "-z",
        "--",
        `:(literal)${featurePath}`,
      ])
        .toString("utf8")
        .split("\0")
        .filter((path) => path && path !== lockPath);
      if (ignored.length) {
        throw new Error(
          `Ignored feature files must be handled before starting: ${ignored.join(", ")}.`,
        );
      }
      const stateDirectory = join(common, "spindle-feature-start");
      try {
        mkdirSync(stateDirectory, { mode: 0o700 });
      } catch (error) {
        if (!lstatIfPresent(stateDirectory)?.isDirectory()) throw error;
      }
      const directoryEntry = lstatSync(stateDirectory);
      if (!directoryEntry.isDirectory() || directoryEntry.isSymbolicLink()) {
        throw new Error("Feature start state directory must be a real directory.");
      }
      const stateFile = join(stateDirectory, `${feature.feature}.json`);
      let state: StartState;
      const stateEntry = lstatIfPresent(stateFile);
      if (stateEntry) {
        if (!stateEntry.isFile() || stateEntry.isSymbolicLink()) {
          throw new Error(`Feature startup state must be a regular file: ${stateFile}.`);
        }
        state = this.readState(stateFile, feature.feature, root, target, branch, originalBranch);
      } else {
        if (lstatIfPresent(target))
          throw new Error(`Worktree destination already exists: ${target}.`);
        if (this.branchExists(root, branch))
          throw new Error(`Feature branch already exists: ${branch}.`);
        const paths = [
          ...new Set(this.changePaths(root).filter((path) => path !== lockPath)),
        ].sort();
        state = {
          version: 1,
          id: randomUUID(),
          feature: feature.feature,
          originalWorkspace: root,
          originalBranch,
          originalRevision,
          featureBranch: branch,
          featureWorkspace: target,
          phase: "planned",
          records: { paths, digest: this.recordDigest(root, paths) },
        };
        try {
          const fd = openSync(stateFile, "wx", 0o600);
          try {
            writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`);
            fsyncSync(fd);
          } finally {
            closeSync(fd);
          }
          this.syncDirectory(stateDirectory);
        } catch (error) {
          throw new Error(
            `Unable to persist feature start state; inspect ${stateFile}. ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      try {
        if (state.phase === "planned") {
          let revision = this.run(root, ["rev-parse", "--verify", "HEAD"]);
          if (revision === state.originalRevision) {
            const changes = [
              ...new Set(this.changePaths(root).filter((path) => path !== lockPath)),
            ].sort();
            if (
              JSON.stringify(changes) !== JSON.stringify(state.records.paths) ||
              this.recordDigest(root, changes) !== state.records.digest
            ) {
              throw new Error("Feature records changed during startup recovery.");
            }
            if (changes.length > 0) {
              this.assertOriginal(root, state.originalBranch, state.originalRevision);
              this.run(root, [
                "add",
                "-A",
                "--",
                `:(literal)${featurePath}`,
                `:(exclude,literal)${lockPath}`,
              ]);
              this.assertNoUnrelatedChanges(root, prefix, lockPath);
              this.assertFeatureRecords(root, prefix, lockPath);
              this.assertNoDivergentStagedRecords(root);
              if (this.recordDigest(root, changes) !== state.records.digest) {
                throw new Error("Feature records changed while staging.");
              }
              this.assertOriginal(root, state.originalBranch, state.originalRevision);
              this.run(root, [
                "commit",
                "--only",
                "-m",
                `spindle: prepare ${feature.feature}`,
                "--",
                `:(literal)${featurePath}`,
                `:(exclude,literal)${lockPath}`,
              ]);
              revision = this.run(root, ["rev-parse", "--verify", "HEAD"]);
            }
          }
          if (revision !== state.originalRevision) {
            this.assertPreparationCommit(root, state, revision);
          } else if (state.records.paths.length > 0) {
            throw new Error("Feature preparation did not commit its recorded changes.");
          }
          this.assertOriginal(root, state.originalBranch, revision);
          this.assertClean(root, lockPath);
          state.featureRevision = revision;
          state.phase = "committed";
          this.writeState(stateFile, state);
        }
        const revision = state.featureRevision;
        if (!revision) throw new Error("Feature startup has no recorded preparation revision.");
        this.assertOriginal(root, state.originalBranch, revision);
        this.assertClean(root, lockPath);
        if (state.phase === "committed") {
          if (lstatIfPresent(target) || this.branchExists(root, branch)) {
            throw new Error("Feature destination or branch exists without a recorded allocation.");
          }
          mkdirSync(target);
          const entry = lstatSync(target);
          state.targetIdentity = { device: entry.dev, inode: entry.ino };
          state.phase = "allocated";
          this.writeState(stateFile, state);
        }
        const targetEntry = lstatIfPresent(target);
        if (
          !targetEntry?.isDirectory() ||
          targetEntry.isSymbolicLink() ||
          !state.targetIdentity ||
          targetEntry.dev !== state.targetIdentity.device ||
          targetEntry.ino !== state.targetIdentity.inode ||
          realpathSync(target) !== target
        ) {
          throw new Error("Feature worktree directory ownership cannot be verified.");
        }
        const registered = this.runBuffer(root, ["worktree", "list", "--porcelain", "-z"])
          .toString("utf8")
          .split("\0")
          .includes(`worktree ${target}`);
        if (!registered) {
          if (state.phase !== "allocated" || this.branchExists(root, branch)) {
            throw new Error("Feature branch or worktree registration changed during startup.");
          }
          this.run(root, ["worktree", "add", "-b", branch, target, revision]);
        }
        for (const directory of ["tickets", "reports"]) {
          const path = join(target, featurePath, directory);
          if (!lstatIfPresent(path)) mkdirSync(path);
          if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) {
            throw new Error(`Feature ${directory} path is not a real directory: ${path}.`);
          }
        }
        const worktreeSpec = join(target, featurePath, "spec.md");
        const specEntry = lstatIfPresent(worktreeSpec);
        if (!specEntry?.isFile() || specEntry.isSymbolicLink()) {
          throw new Error(`Created worktree has no regular feature spec: ${worktreeSpec}.`);
        }
        if (
          this.run(target, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== branch ||
          (state.phase !== "created" &&
            this.run(target, ["rev-parse", "--verify", "HEAD"]) !== revision) ||
          realpathSync(
            this.run(target, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
          ) !== common
        ) {
          throw new Error("Created worktree does not match the recorded branch and revision.");
        }
        if (state.phase !== "created") this.assertClean(target, lockPath);
        this.assertOriginal(root, state.originalBranch, revision);
        this.assertClean(root, lockPath);
        if (state.phase !== "created") {
          state.phase = "created";
          this.writeState(stateFile, state);
        }
        return { ...state, stateFile, spec: worktreeSpec };
      } catch (error) {
        throw new Error(
          `Feature start stopped; inspect and preserve ${stateFile}, branch ${branch}, and ${target} before recovery. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  private readState(
    path: string,
    feature: string,
    root: string,
    target: string,
    branch: string,
    originalBranch: string,
  ): StartState {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      !Records.isRecord(value) ||
      value.version !== 1 ||
      typeof value.id !== "string" ||
      value.feature !== feature ||
      value.originalWorkspace !== root ||
      value.originalBranch !== originalBranch ||
      typeof value.originalRevision !== "string" ||
      !/^[0-9a-f]{40,64}$/i.test(value.originalRevision) ||
      value.featureBranch !== branch ||
      value.featureWorkspace !== target ||
      (value.phase !== "planned" &&
        value.phase !== "committed" &&
        value.phase !== "allocated" &&
        value.phase !== "created") ||
      (value.featureRevision !== undefined &&
        (typeof value.featureRevision !== "string" ||
          !/^[0-9a-f]{40,64}$/i.test(value.featureRevision))) ||
      !Records.isRecord(value.records) ||
      !Array.isArray(value.records.paths) ||
      typeof value.records.digest !== "string" ||
      !/^[0-9a-f]{64}$/i.test(value.records.digest)
    ) {
      throw new Error(`Feature startup state does not match this checkout: ${path}.`);
    }
    const paths = value.records.paths.map((entry: unknown) => {
      if (
        typeof entry !== "string" ||
        !entry.startsWith(`.scratch/${feature}/`) ||
        !/^(?:spec\.md|design\.md|sdd\.json|tickets\/T-\d{4,}\.md|reports\/[^/]+\.md)$/.test(
          entry.slice(`.scratch/${feature}/`.length),
        )
      ) {
        throw new Error(`Feature startup state contains an invalid record path: ${path}.`);
      }
      return entry;
    });
    if (JSON.stringify([...new Set(paths)].sort()) !== JSON.stringify(paths)) {
      throw new Error(`Feature startup state contains duplicate or unordered paths: ${path}.`);
    }
    let targetIdentity: StartState["targetIdentity"];
    if (value.targetIdentity !== undefined) {
      if (
        !Records.isRecord(value.targetIdentity) ||
        typeof value.targetIdentity.device !== "number" ||
        typeof value.targetIdentity.inode !== "number"
      ) {
        throw new Error(`Feature startup state has invalid directory identity: ${path}.`);
      }
      targetIdentity = {
        device: value.targetIdentity.device,
        inode: value.targetIdentity.inode,
      };
    }
    return {
      version: 1,
      id: value.id,
      feature,
      originalWorkspace: root,
      originalBranch,
      originalRevision: value.originalRevision,
      featureBranch: branch,
      featureWorkspace: target,
      phase: value.phase,
      records: { paths, digest: value.records.digest },
      ...(typeof value.featureRevision === "string"
        ? { featureRevision: value.featureRevision }
        : {}),
      ...(targetIdentity ? { targetIdentity } : {}),
    };
  }

  private recordDigest(root: string, paths: string[]): string {
    const entries = paths.map((path) => {
      const entry = lstatIfPresent(join(root, path));
      if (!entry) return [path, "deleted"];
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error(`Feature record is not a regular file: ${path}.`);
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

  private assertPreparationCommit(root: string, state: StartState, revision: string): void {
    const parents = this.run(root, ["rev-list", "--parents", "-n", "1", revision]).split(" ");
    const committed = this.runBuffer(root, [
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      state.originalRevision,
      revision,
    ])
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .sort();
    if (
      parents.length !== 2 ||
      parents[1] !== state.originalRevision ||
      this.run(root, ["show", "-s", "--format=%s", revision]) !==
        `spindle: prepare ${state.feature}` ||
      JSON.stringify(committed) !== JSON.stringify(state.records.paths) ||
      this.recordDigest(root, state.records.paths) !== state.records.digest
    ) {
      throw new Error("Feature preparation commit does not match the recorded changes.");
    }
  }

  private branchExists(root: string, branch: string): boolean {
    const result = this.git.run(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`Cannot check feature branch: ${result.stderr.trim()}`);
    }
    return result.status === 0;
  }

  private assertOriginal(root: string, branch: string, revision: string): void {
    if (
      this.run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== branch ||
      this.run(root, ["rev-parse", "--verify", "HEAD"]) !== revision
    ) {
      throw new Error("Original branch or revision changed during feature startup.");
    }
  }

  private referencesFeaturePath(value: unknown, workspace: string): boolean {
    if (typeof value === "string") {
      return isAbsolute(value) && isPathInside(workspace, resolve(value));
    }
    if (Array.isArray(value)) {
      return value.some((entry) => this.referencesFeaturePath(entry, workspace));
    }
    if (typeof value === "object" && value !== null) {
      return Object.values(value).some((entry) => this.referencesFeaturePath(entry, workspace));
    }
    return false;
  }

  private assertNoHooks(root: string): void {
    for (const hook of [
      "pre-commit",
      "prepare-commit-msg",
      "commit-msg",
      "post-commit",
      "post-checkout",
    ]) {
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
      throw new Error(`Active Git hook ${path} requires manual handling before feature startup.`);
    }
  }

  private assertNoGitOperation(root: string): void {
    if (this.runBuffer(root, ["ls-files", "--unmerged", "-z"]).length > 0) {
      throw new Error("Resolve unmerged index entries before starting a feature worktree.");
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
      if (lstatIfPresent(path)) {
        throw new Error(`Complete the existing Git operation (${operation}) before starting.`);
      }
    }
  }

  private assertNoDivergentStagedRecords(root: string): void {
    const staged = this.runBuffer(root, ["diff", "--cached", "--name-only", "--no-renames", "-z"])
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    const unstaged = new Set(
      this.runBuffer(root, ["diff", "--name-only", "--no-renames", "-z"])
        .toString("utf8")
        .split("\0")
        .filter(Boolean),
    );
    const divergent = staged.filter((path) => unstaged.has(path));
    if (divergent.length) {
      throw new Error(
        `Staged feature records differ from the worktree and were preserved: ${divergent.join(", ")}.`,
      );
    }
  }

  private changePaths(root: string): string[] {
    const entries = this.runBuffer(root, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--ignore-submodules=none",
    ])
      .toString("utf8")
      .split("\0");
    const paths: string[] = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!;
      if (!entry) continue;
      if (entry.length < 4 || entry[2] !== " ") throw new Error("Unexpected Git status output.");
      paths.push(entry.slice(3));
      if (entry[0] === "R" || entry[0] === "C" || entry[1] === "R" || entry[1] === "C") {
        const previous = entries[++index];
        if (!previous) throw new Error("Incomplete Git rename status.");
        paths.push(previous);
      }
    }
    return paths;
  }

  private assertNoUnrelatedChanges(root: string, prefix: string, lockPath: string): void {
    const unrelated = this.changePaths(root).filter(
      (path) => path !== lockPath && !path.startsWith(prefix),
    );
    if (unrelated.length) {
      throw new Error(
        `Handle unrelated uncommitted changes before starting: ${unrelated.join(", ")}.`,
      );
    }
  }

  private assertClean(root: string, lockPath: string): void {
    const changes = this.changePaths(root).filter((path) => path !== lockPath);
    if (changes.length) throw new Error(`Original checkout is not clean: ${changes.join(", ")}.`);
  }

  private assertFeatureRecords(root: string, prefix: string, lockPath: string): void {
    for (const path of this.changePaths(root)) {
      if (path === lockPath || !path.startsWith(prefix)) continue;
      const name = path.slice(prefix.length);
      if (
        !/^(?:spec\.md|design\.md|sdd\.json|tickets\/T-\d{4,}\.md|reports\/[^/]+\.md)$/.test(name)
      ) {
        throw new Error(`Unexpected feature file must be handled before starting: ${path}.`);
      }
      if (lstatIfPresent(join(root, path))?.isSymbolicLink()) {
        throw new Error(`Feature records must not be symlinks: ${path}.`);
      }
    }
  }

  private writeState(path: string, state: StartState): void {
    const temporary = `${path}.${randomUUID()}.tmp`;
    const fd = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, path);
    this.syncDirectory(resolve(path, ".."));
  }

  private syncDirectory(path: string): void {
    const fd = openSync(path, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  private run(root: string, args: string[]): string {
    return this.runBuffer(root, args).toString("utf8").trim();
  }

  private runBuffer(root: string, args: string[]): Buffer {
    const result = this.git.run(args, { cwd: root, encoding: "buffer" });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`git ${args[0]} failed: ${result.stderr.toString("utf8").trim()}`);
    return result.stdout;
  }
}
