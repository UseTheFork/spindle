import { createHash } from "node:crypto";
import { readFileSync, realpathSync, readlinkSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import matter from "gray-matter";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitService } from "@/Git/Services/GitService";
import type { IssueChecks, ContentIdentity } from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  IssueProgress,
  FeatureLedger,
  DeliveryProgress,
  FeaturePaths,
  IssueDocument,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import { isSafeCoveragePath } from "@/SubagentDrivenDevelopment/Persistence/CheckSchema";
import { lstatIfPresent, isPathInside } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";

export class GitEvidence extends Service {
  public constructor(
    app: Application,
    private readonly git: GitService,
    private readonly ledgerRepository: LedgerRepository,
  ) {
    super(app);
  }

  public allGitChangePaths(): string[] {
    const paths = new Set<string>();
    for (const args of [
      ["diff", "--name-only", "-z", "--no-renames", "HEAD", "--", "."],
      ["diff", "--cached", "--name-only", "-z", "--no-renames", "HEAD", "--", "."],
      ["ls-files", "--others", "--exclude-standard", "-z"],
    ]) {
      for (const path of this.gitBuffer(args).toString("utf8").split("\0")) {
        if (path) paths.add(path);
      }
    }
    return [...paths].sort();
  }

  public deliveryRecordPaths(
    feature: FeaturePaths,
    ledger = this.ledgerRepository.readLedger(feature),
  ): string[] {
    const lockPath = `.scratch/${feature.feature}/.sdd-issues.lock`;
    const allowed = this.workflowDeliveryRecordPaths(feature, ledger);
    return this.allGitChangePaths().filter((path) => path !== lockPath && allowed.has(path));
  }

  public workflowDeliveryRecordPaths(feature: FeaturePaths, ledger: FeatureLedger): Set<string> {
    const root = realpathSync(this.app.workspaceRoot);
    const featurePrefix = `.scratch/${feature.feature}/`;
    const paths = new Set([
      relative(root, feature.spec),
      relative(root, feature.ledger),
      ...ledger.issues.map((issue) => `${featurePrefix}issues/${issue.id}.md`),
    ]);
    const reports = join(feature.workspace, "reports");
    const addReport = (report: string | undefined) => {
      if (!report) return;
      const path = isAbsolute(report) ? resolve(report) : resolve(feature.workspace, report);
      if (isPathInside(reports, path) && /^[^/]+\.md$/.test(relative(reports, path))) {
        paths.add(relative(root, path));
      }
    };
    for (const issue of ledger.issues) {
      addReport(issue.assignment?.report);
      for (const assignment of [
        ...(issue.reviewAssignments ?? []),
        ...(issue.reviewHistory ?? []),
      ]) {
        addReport(assignment.report);
      }
      for (const attempt of issue.correctionAttempts ?? []) {
        addReport(attempt.assignment.report);
        addReport(attempt.priorAssignment?.report);
        for (const assignment of attempt.reviewAssignments ?? []) addReport(assignment.report);
      }
      for (const finding of issue.findings ?? []) {
        for (const provenance of finding.provenance) addReport(provenance.report);
      }
    }
    return paths;
  }

  public worktreeContentDigest(paths: string[]): string {
    const records = paths.map((path) => {
      const location = join(this.app.workspaceRoot, path);
      const entry = lstatIfPresent(location);
      if (!entry) return [path, "deleted", ""];
      if (entry.isSymbolicLink()) {
        return [path, "120000", readlinkSync(location)];
      }
      if (!entry.isFile()) {
        throw new Error(`Accepted path '${path}' is not a regular file or symlink.`);
      }
      const mode = entry.mode & 0o111 ? "100755" : "100644";
      return [path, mode, readFileSync(location).toString("base64")];
    });
    return createHash("sha256").update(JSON.stringify(records)).digest("hex");
  }

  public gitTreeContentDigest(commitSha: string, paths: string[]): string {
    const records = paths.map((path) => {
      const entries = this.gitBuffer(["ls-tree", "-z", commitSha, "--", `:(literal)${path}`])
        .toString("utf8")
        .split("\0")
        .filter(Boolean);
      const exact = entries
        .map((entry) => {
          const [metadata, treePath] = entry.split("\t", 2);
          const [mode, type, object] = (metadata ?? "").split(" ");
          return treePath === path && mode && type === "blob" && object
            ? { mode, object }
            : undefined;
        })
        .find((entry) => entry !== undefined);
      if (!exact) return [path, "deleted", ""];
      const content = this.gitBuffer(["cat-file", "blob", exact.object]).toString("base64");
      return [path, exact.mode, content];
    });
    return createHash("sha256").update(JSON.stringify(records)).digest("hex");
  }

  public gitIndexContentDigest(paths: string[]): string {
    const records = paths.map((path) => {
      const entries = this.gitBuffer(["ls-files", "--stage", "-z", "--", `:(literal)${path}`])
        .toString("utf8")
        .split("\0")
        .filter(Boolean);
      if (entries.length !== 1) return [path, "invalid-index-entry", ""];
      const separator = entries[0]!.indexOf("\t");
      if (separator < 0 || entries[0]!.slice(separator + 1) !== path) {
        return [path, "invalid-index-entry", ""];
      }
      const [mode, object, stage] = entries[0]!.slice(0, separator).split(" ");
      if (
        stage !== "0" ||
        !object ||
        (mode !== "100644" && mode !== "100755" && mode !== "120000")
      ) {
        return [path, "invalid-index-entry", ""];
      }
      const content = this.gitBuffer(["cat-file", "blob", object]).toString("base64");
      return [path, mode, content];
    });
    return createHash("sha256").update(JSON.stringify(records)).digest("hex");
  }

  public cleanGitBaseline(feature: FeaturePaths): string {
    const root = realpathSync(this.app.workspaceRoot);
    const changes = this.gitChangeSummary(feature);
    if (changes) {
      const deliveryRecords = this.deliveryRecordPaths(feature);
      if (deliveryRecords.length > 0) {
        throw new Error(
          `Cannot claim while uncommitted delivery records remain; the caller must commit them first:\n${deliveryRecords.join("\n")}`,
        );
      }
      throw new Error(
        `Cannot claim from a dirty checkout; commit or otherwise resolve staged, unstaged, and untracked changes first:\n${changes}`,
      );
    }
    const revision = this.git.run(["rev-parse", "--verify", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    if (revision.error) throw revision.error;
    if (revision.status !== 0 || !/^[0-9a-f]{40,64}\n?$/i.test(revision.stdout)) {
      throw new Error(
        `Unable to record the clean checkout's starting commit: ${revision.stderr.trim()}`,
      );
    }
    return revision.stdout.trim();
  }

  public contentIdentity(
    feature: FeaturePaths,
    issue: IssueDocument,
    baseSha = this.headSha(),
    checks?: IssueChecks,
    coveredPaths?: string[],
  ): ContentIdentity {
    const root = realpathSync(this.app.workspaceRoot);
    const headSha = this.headSha();
    const changedPaths = this.changedPaths(baseSha);
    const paths = new Set(coveredPaths ?? changedPaths);
    if (coveredPaths) {
      for (const path of paths) {
        if (!isSafeCoveragePath(path) || !isPathInside(root, resolve(root, path))) {
          throw new Error(`Unsafe path in content identity scope: ${path}.`);
        }
      }
    }
    const code = createHash("sha256");
    code.update("spindle-code-snapshot-v2\0");
    const field = (tag: string, value: Buffer | string) => {
      const tagBytes = Buffer.from(tag);
      const valueBytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const tagLength = Buffer.alloc(4);
      tagLength.writeUInt32BE(tagBytes.length);
      const valueLength = Buffer.alloc(8);
      valueLength.writeBigUInt64BE(BigInt(valueBytes.length));
      code.update(tagLength);
      code.update(tagBytes);
      code.update(valueLength);
      code.update(valueBytes);
    };
    for (const path of [...paths].sort()) {
      field("record", "path");
      field("path", path);
      field(
        "index-stage",
        this.gitBuffer(["ls-files", "--stage", "-z", "--", `:(literal)${path}`]),
      );
      const indexed = this.git.run(["show", `:${path}`], {
        cwd: root,
        encoding: "buffer",
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      });
      if (indexed.error) throw indexed.error;
      field("index-state", indexed.status === 0 ? "present" : "absent");
      if (indexed.status === 0) field("index-content", indexed.stdout);
      const pathOnDisk = join(root, path);
      const entry = lstatIfPresent(pathOnDisk);
      if (!entry) {
        field("worktree-state", "deleted");
      } else {
        field("worktree-mode", String(entry.mode & 0o777));
        if (entry.isSymbolicLink()) {
          field("worktree-type", "symlink");
          field("worktree-target", readlinkSync(pathOnDisk));
        } else if (entry.isFile()) {
          field("worktree-type", "file");
          field("worktree-content", readFileSync(pathOnDisk));
        } else if (entry.isDirectory()) {
          throw new Error(
            `Cannot compute code identity for nested repository or worktree '${path}'; directory worktrees are unsupported.`,
          );
        } else {
          throw new Error(
            `Cannot compute code identity for unsupported non-file worktree path '${path}'.`,
          );
        }
      }
    }
    const codeSnapshot = code.digest("hex");
    const requirementParts = [
      readFileSync(feature.spec, "utf8"),
      this.issueRequirements(issue.raw),
      checks?.required ?? [],
    ];
    const requirementsSnapshot = createHash("sha256")
      .update(JSON.stringify(requirementParts))
      .digest("hex");
    const snapshot = createHash("sha256")
      .update(JSON.stringify([codeSnapshot, requirementsSnapshot]))
      .digest("hex");
    return { snapshot, codeSnapshot, requirementsSnapshot, headSha };
  }

  public deliveryIdentity(
    feature: FeaturePaths,
    ledger: FeatureLedger,
    issues: IssueDocument[],
  ): ContentIdentity {
    if (issues.length === 0) throw new Error("Aggregate evidence requires at least one issue.");
    const delivery = ledger.delivery;
    delivery.baseSha ??= ledger.issues.find((progress) => progress.baseSha)?.baseSha;
    if (!delivery.baseSha) {
      throw new Error("Aggregate evidence requires the first issue's recorded Git baseline.");
    }
    const codeIdentity = this.contentIdentity(feature, issues[0]!, delivery.baseSha);
    const requirementsSnapshot = createHash("sha256")
      .update(
        JSON.stringify([
          readFileSync(feature.spec, "utf8"),
          issues.map((issue) => [
            issue.id,
            issue.title,
            issue.reporter,
            issue.category,
            issue.status,
            issue.blocked_by,
            issue.blocker,
            this.issueRequirements(issue.raw),
          ]),
          (delivery.checks?.required ?? []).filter((requirement) => !requirement.removedAt),
        ]),
      )
      .digest("hex");
    const snapshot = createHash("sha256")
      .update(JSON.stringify([codeIdentity.codeSnapshot, requirementsSnapshot]))
      .digest("hex");
    return {
      snapshot,
      codeSnapshot: codeIdentity.codeSnapshot,
      requirementsSnapshot,
      headSha: codeIdentity.headSha,
    };
  }

  public changedPaths(baseSha: string): string[] {
    const paths = new Set<string>();
    for (const args of [
      ["diff", "--name-only", "-z", baseSha, "--", "."],
      ["diff", "--cached", "--name-only", "-z", baseSha, "--", "."],
      ["ls-files", "--others", "--exclude-standard", "-z"],
    ]) {
      const output = this.gitBuffer(args).toString("utf8");
      for (const path of output.split("\0")) {
        if (path && path !== ".scratch" && !path.startsWith(".scratch/")) paths.add(path);
      }
    }
    this.assertStableSubmodules(baseSha, paths);
    return [...paths].sort();
  }

  public assertStableSubmodules(baseSha: string, changedPaths: Set<string>): void {
    const gitlinks = new Map<string, string>();
    for (const record of this.gitBuffer(["ls-files", "--stage", "-z"])
      .toString("utf8")
      .split("\0")) {
      const [metadata, path] = record.split("\t", 2);
      if (!metadata || !path || path === ".scratch" || path.startsWith(".scratch/")) continue;
      const [mode, sha, stage] = metadata.split(" ");
      if (mode === "160000" && sha && stage === "0") gitlinks.set(path, sha);
    }

    const knownPaths = new Set(gitlinks.keys());
    for (const record of this.gitBuffer(["ls-tree", "-r", "-z", baseSha])
      .toString("utf8")
      .split("\0")) {
      const [metadata, path] = record.split("\t", 2);
      if (
        metadata?.startsWith("160000 commit ") &&
        path &&
        path !== ".scratch" &&
        !path.startsWith(".scratch/")
      ) {
        knownPaths.add(path);
      }
    }

    for (const path of knownPaths) {
      const entry = lstatIfPresent(join(this.app.workspaceRoot, path));
      if (!entry) {
        throw new Error(
          `Cannot compute code identity for submodule '${path}'; its worktree is missing or uninitialized.`,
        );
      }
      if (!entry.isDirectory()) {
        throw new Error(
          `Cannot compute code identity for submodule '${path}'; its worktree state is unsupported.`,
        );
      }

      if (changedPaths.has(path)) {
        throw new Error(
          `Cannot compute code identity for changed submodule '${path}'; submodule changes are unsupported.`,
        );
      }

      if (!gitlinks.has(path)) continue;

      let revision: string;
      try {
        revision = this.gitBuffer(["-C", path, "rev-parse", "--verify", "HEAD"])
          .toString("utf8")
          .trim();
      } catch {
        throw new Error(
          `Cannot compute code identity for submodule '${path}'; its worktree is missing or uninitialized.`,
        );
      }
      const status = this.gitBuffer([
        "-C",
        path,
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--ignore-submodules=none",
      ]).toString("utf8");
      if (revision !== gitlinks.get(path) || status.length > 0) {
        throw new Error(
          `Cannot compute code identity for changed submodule '${path}'; submodule changes are unsupported.`,
        );
      }
    }
  }

  public issueRequirements(raw: string): string {
    const body = matter(raw).content;
    const sections = new Map<string, string>();
    const headings = [...body.matchAll(/^##[ \t]+(.+?)[ \t]*\r?$/gm)];
    for (let index = 0; index < headings.length; index++) {
      const heading = headings[index]!;
      const title = heading[1]!.trim().toLowerCase();
      const start = heading.index! + heading[0].length;
      const end = headings[index + 1]?.index ?? body.length;
      if (title === "requirements" || title === "acceptance criteria") {
        sections.set(title, body.slice(start, end).trim());
      }
      if (title === "comments") {
        const decisions = body
          .slice(start, end)
          .split(/\n[ \t]*\n/)
          .filter(
            (entry) =>
              !entry.startsWith("[SDD-SCOPE-RULING ") && /\brequirements? decision\b/i.test(entry),
          )
          .map((entry) => entry.trim());
        sections.set("requirements decisions", decisions.join("\n\n"));
      }
    }
    return JSON.stringify(
      [...sections.entries()].sort(([left], [right]) => left.localeCompare(right)),
    );
  }

  public headSha(): string {
    const revision = this.git.run(["rev-parse", "--verify", "HEAD"], {
      cwd: realpathSync(this.app.workspaceRoot),
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    if (revision.error) throw revision.error;
    if (revision.status !== 0 || !/^[0-9a-f]{40,64}\n?$/i.test(revision.stdout)) {
      throw new Error(`Unable to identify current Git revision: ${revision.stderr.trim()}`);
    }
    return revision.stdout.trim();
  }

  public gitBuffer(args: string[]): Buffer {
    const result = this.git.run(args, {
      cwd: realpathSync(this.app.workspaceRoot),
      encoding: "buffer",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`git ${args[0]} failed: ${result.stderr.toString("utf8").trim()}`);
    }
    return result.stdout;
  }

  public gitChangeSummary(feature: FeaturePaths): string {
    const root = realpathSync(this.app.workspaceRoot);
    const relativeLock = relative(root, join(feature.workspace, ".sdd-issues.lock"));
    const status = this.git.run(
      [
        "--no-pager",
        "-c",
        "color.ui=false",
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        ".",
        `:(exclude)${relativeLock}`,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      },
    );
    if (status.error) throw status.error;
    if (status.status !== 0) {
      throw new Error(`git status failed while checking claim readiness: ${status.stderr.trim()}`);
    }
    return status.stdout.trim();
  }

  public integrationPreservesEvidence(
    progress: IssueProgress | DeliveryProgress,
    identity: ContentIdentity,
  ): boolean {
    if (!("id" in progress)) return false;
    const accepted = progress.acceptedEvidence;
    if (
      progress.execution !== "integrated" ||
      !progress.integration ||
      !accepted ||
      !progress.baseSha ||
      identity.requirementsSnapshot !== accepted.requirementsSnapshot
    ) {
      return false;
    }
    try {
      return (
        progress.integration.contentDigest === accepted.contentDigest &&
        JSON.stringify(progress.integration.files) === JSON.stringify(accepted.files) &&
        JSON.stringify(this.changedPaths(progress.baseSha!)) === JSON.stringify(accepted.files) &&
        this.worktreeContentDigest(accepted.files) === accepted.contentDigest
      );
    } catch {
      return false;
    }
  }

  public assertSafeIntegrationChanges(
    feature: FeaturePaths,
    acceptedFiles: string[],
    ledger: FeatureLedger,
  ): void {
    const allowed = new Set(acceptedFiles);
    for (const path of this.workflowDeliveryRecordPaths(feature, ledger)) allowed.add(path);
    const lockPath = `.scratch/${feature.feature}/.sdd-issues.lock`;
    const unrelated = this.allGitChangePaths().filter(
      (path) => path !== lockPath && !allowed.has(path),
    );
    if (unrelated.length > 0) {
      throw new Error(
        `Unsafe unrelated pending changes prevent integration: ${JSON.stringify(unrelated)}.`,
      );
    }
  }
}
