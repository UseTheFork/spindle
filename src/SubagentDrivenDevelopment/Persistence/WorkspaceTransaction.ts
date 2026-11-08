import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join, relative } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type {
  FeatureLedger,
  FeaturePaths,
  IssueDocument,
  RecoveryWrite,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import {
  lstatIfPresent,
  waitBriefly,
  LOCK_TIMEOUT_MS,
} from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { PathSafety } from "@/SubagentDrivenDevelopment/Persistence/PathSafety";
import { isRecord } from "@/utilities/records";

export class WorkspaceTransaction extends Service {
  private readonly activeWorkspaces = new Set<string>();

  public run<T>(workspace: string, operation: () => T): T {
    const release = this.acquireIssueLock(workspace);
    this.activeWorkspaces.add(workspace);
    try {
      this.recoverWrites(workspace);
      return operation();
    } finally {
      this.activeWorkspaces.delete(workspace);
      release();
    }
  }

  public constructor(
    app: Application,
    private readonly pathSafety: PathSafety,
  ) {
    super(app);
  }

  private acquireIssueLock(workspace: string): () => void {
    const lockPath = join(workspace, ".sdd-issues.lock");
    const root = realpathSync(this.app.workspaceRoot);
    const relativeLock = relative(root, lockPath);
    if (this.pathSafety.isIgnored(root, relativeLock)) {
      throw new Error(`Issue lock path is ignored: ${relativeLock}`);
    }
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (true) {
      try {
        const descriptor = openSync(lockPath, "wx", 0o600);
        try {
          writeSync(descriptor, JSON.stringify({ pid: process.pid }));
        } catch (error) {
          closeSync(descriptor);
          unlinkSync(lockPath);
          throw error;
        }
        return () => {
          try {
            closeSync(descriptor);
          } finally {
            unlinkSync(lockPath);
          }
        };
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          error.code !== "EEXIST"
        )
          throw error;
        if (this.staleLockReason(lockPath)) {
          const lockEntry = lstatIfPresent(lockPath);
          if (!lockEntry?.isFile() || lockEntry.isSymbolicLink()) {
            throw new Error(
              `Issue lock path is not a regular file and was preserved: ${lockPath}.`,
            );
          }
          unlinkSync(lockPath);
          continue;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `Timed out waiting for issue updates; inspect ${lockPath} before retrying.`,
          );
        }
        waitBriefly();
      }
    }
  }

  private recoverWrites(workspace: string): void {
    const journalPath = join(workspace, ".sdd-write-recovery.json");
    const entry = lstatIfPresent(journalPath);
    if (!entry) return;
    if (!entry.isFile() || entry.isSymbolicLink())
      throw new Error("Issue recovery journal is not a regular file.");
    const value = JSON.parse(readFileSync(journalPath, "utf8")) as unknown;
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.writes)) {
      throw new Error("Issue recovery journal has an unsupported format.");
    }
    const writes = value.writes;
    const targets = new Set<string>();
    const pending: { target: string; after: string }[] = [];
    for (const write of writes) {
      if (
        !isRecord(write) ||
        typeof write.path !== "string" ||
        !(write.before === null || typeof write.before === "string") ||
        typeof write.after !== "string" ||
        !(write.path === "sdd.json" || /^issues\/I-\d{4,}\.md$/.test(write.path))
      )
        throw new Error("Issue recovery journal contains an invalid write target.");
      if (targets.has(write.path))
        throw new Error("Issue recovery journal contains duplicate write targets.");
      targets.add(write.path);
      const target = join(workspace, write.path);
      const root = realpathSync(this.app.workspaceRoot);
      const relativeTarget = relative(root, target);
      if (this.pathSafety.isIgnored(root, relativeTarget)) {
        throw new Error(`Issue write target is ignored: ${relativeTarget}`);
      }
      if (write.path !== "sdd.json") this.pathSafety.assertIssuePath(workspace, target);
      else {
        const ledgerEntry = lstatIfPresent(target);
        if (!ledgerEntry?.isFile() || ledgerEntry.isSymbolicLink()) {
          throw new Error("Feature ledger must be a regular file during issue recovery.");
        }
      }
      const current = lstatIfPresent(target) ? readFileSync(target, "utf8") : null;
      if (current !== write.before && current !== write.after) {
        throw new Error(
          `Issue recovery found conflicting external content at ${write.path}; preserved all files.`,
        );
      }
      if (current !== write.after) pending.push({ target, after: write.after });
    }
    for (const write of pending) this.atomicWrite(write.target, write.after);
    unlinkSync(journalPath);
  }

  public applyWrites(workspace: string, writes: RecoveryWrite[]): void {
    if (!this.activeWorkspaces.has(workspace)) {
      throw new Error("Workflow writes require the workspace transaction lock.");
    }
    const journalPath = join(workspace, ".sdd-write-recovery.json");
    if (lstatIfPresent(journalPath)) {
      throw new Error("A pending issue write recovery journal must be resolved first.");
    }
    for (const write of writes) {
      if (!(write.path === "sdd.json" || /^issues\/I-\d{4,}\.md$/.test(write.path))) {
        throw new Error(`Unsafe issue write target: ${write.path}.`);
      }
      const root = realpathSync(this.app.workspaceRoot);
      const target = join(workspace, write.path);
      const relativeTarget = relative(root, target);
      if (this.pathSafety.isIgnored(root, relativeTarget)) {
        throw new Error(`Issue write target is ignored: ${relativeTarget}`);
      }
    }
    const root = realpathSync(this.app.workspaceRoot);
    const relativeJournal = relative(root, journalPath);
    if (this.pathSafety.isIgnored(root, relativeJournal)) {
      throw new Error(`Issue recovery path is ignored: ${relativeJournal}`);
    }
    this.atomicWrite(journalPath, `${JSON.stringify({ version: 1, writes }, null, 2)}\n`);
    this.recoverWrites(workspace);
  }

  private atomicWrite(path: string, contents: string): void {
    const temporary = `${path}.${randomUUID()}.tmp`;
    const existing = lstatIfPresent(path);
    const mode = existing ? existing.mode & 0o777 : 0o666 & ~process.umask();
    try {
      writeFileSync(temporary, contents, { flag: "wx", mode: mode | 0o200 });
      if ((mode | 0o200) !== mode) chmodSync(temporary, mode);
      renameSync(temporary, path);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
  }

  public writeWorkflowState(
    feature: FeaturePaths,
    issue: IssueDocument,
    issueAfter: string,
    ledger: FeatureLedger,
  ): void {
    this.applyWrites(feature.workspace, [
      {
        path: relative(feature.workspace, issue.path),
        before: issue.raw,
        after: issueAfter,
      },
      {
        path: "sdd.json",
        before: readFileSync(feature.ledger, "utf8"),
        after: `${JSON.stringify(ledger, null, 2)}\n`,
      },
    ]);
  }

  public writeLedger(feature: FeaturePaths, ledger: FeatureLedger): void {
    this.applyWrites(feature.workspace, [
      {
        path: "sdd.json",
        before: readFileSync(feature.ledger, "utf8"),
        after: `${JSON.stringify(ledger, null, 2)}\n`,
      },
    ]);
  }

  public acquireCreationLock(scratch: string): () => void {
    const lockPath = join(scratch, ".sdd-create.lock");
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (true) {
      try {
        const descriptor = openSync(lockPath, "wx", 0o600);
        try {
          writeSync(descriptor, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
        } catch (error) {
          closeSync(descriptor);
          unlinkSync(lockPath);
          throw error;
        }
        return () => {
          try {
            closeSync(descriptor);
          } finally {
            unlinkSync(lockPath);
          }
        };
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          error.code !== "EEXIST"
        ) {
          throw error;
        }
        const staleLock = this.staleLockReason(lockPath);
        if (staleLock) {
          throw new Error(
            `Stale feature creation lock at ${lockPath}: ${staleLock}. Verify its owner has stopped, then remove the lock and any abandoned .sdd-create-* staging directory before retrying.`,
          );
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `Timed out waiting for another feature workspace creation; inspect ${lockPath} and remove it only after confirming its owner stopped.`,
          );
        }
        waitBriefly();
      }
    }
  }

  public staleLockReason(lockPath: string): string | undefined {
    try {
      const entry = lstatIfPresent(lockPath);
      if (!entry) return undefined;
      if (!entry.isFile()) return "the lock path is not a regular file";
      let owner: { pid?: unknown };
      try {
        owner = JSON.parse(readFileSync(lockPath, "utf8")) as { pid?: unknown };
      } catch {
        return Date.now() - entry.mtimeMs >= LOCK_TIMEOUT_MS
          ? "the lock contents are malformed and old"
          : undefined;
      }
      if (typeof owner.pid === "number" && Number.isSafeInteger(owner.pid) && owner.pid > 0) {
        try {
          process.kill(owner.pid, 0);
          return undefined;
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "EPERM"
          ) {
            return undefined;
          }
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code !== "ESRCH"
          ) {
            return undefined;
          }
          return "the recorded owner process is no longer running";
        }
      }
      return Date.now() - entry.mtimeMs >= LOCK_TIMEOUT_MS
        ? "the lock has no live process owner"
        : undefined;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }
}
