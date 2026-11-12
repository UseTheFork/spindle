import { createHash } from "node:crypto";
import { readFileSync, realpathSync, readlinkSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import matter from "gray-matter";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitService } from "@/Git/Services/GitService";
import type { TicketChecks, ContentIdentity } from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  TicketProgress,
  FeatureLedger,
  DeliveryProgress,
  FeaturePaths,
  TicketDocument,
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
    const lockPath = `.scratch/${feature.feature}/.sdd-tickets.lock`;
    const allowed = this.workflowDeliveryRecordPaths(feature, ledger);
    return this.allGitChangePaths().filter((path) => path !== lockPath && allowed.has(path));
  }

  public workflowDeliveryRecordPaths(feature: FeaturePaths, ledger: FeatureLedger): Set<string> {
    const root = realpathSync(this.app.workspaceRoot);
    const featurePrefix = `.scratch/${feature.feature}/`;
    const paths = new Set([
      relative(root, feature.spec),
      relative(root, feature.ledger),
      ...ledger.tickets.map((ticket) => `${featurePrefix}tickets/${ticket.id}.md`),
    ]);
    const reports = join(feature.workspace, "reports");
    const addReport = (report: string | undefined) => {
      if (!report) return;
      const path = isAbsolute(report) ? resolve(report) : resolve(feature.workspace, report);
      if (isPathInside(reports, path) && /^[^/]+\.md$/.test(relative(reports, path))) {
        paths.add(relative(root, path));
      }
    };
    for (const ticket of ledger.tickets) {
      addReport(ticket.assignment?.report);
      for (const assignment of [
        ...(ticket.reviewAssignments ?? []),
        ...(ticket.reviewHistory ?? []),
      ]) {
        addReport(assignment.report);
      }
      for (const attempt of ticket.correctionAttempts ?? []) {
        addReport(attempt.assignment.report);
        addReport(attempt.priorAssignment?.report);
        for (const assignment of attempt.reviewAssignments ?? []) addReport(assignment.report);
      }
      for (const finding of ticket.findings ?? []) {
        for (const provenance of finding.provenance) addReport(provenance.report);
      }
    }
    return paths;
  }

  public worktreeContentDigest(paths: string[], workspace?: string): string {
    const records = paths.map((path) => {
      const location = join(workspace ?? this.app.workspaceRoot, path);
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

  public cleanDispatchBaseline(feature: FeaturePaths, allowPendingRecords = false): string {
    const root = realpathSync(this.app.workspaceRoot);
    if (allowPendingRecords) return this.pendingDispatchBaseline(feature, root);
    const changes = this.gitChangeSummary(feature);
    if (changes) {
      const deliveryRecords = this.deliveryRecordPaths(feature);
      if (deliveryRecords.length > 0) {
        throw new Error(
          `Cannot dispatch while uncommitted delivery records remain; inspect and confirm them before committing:\n${deliveryRecords.join("\n")}`,
        );
      }
      throw new Error(
        `Cannot dispatch from a dirty checkout; inspect and resolve staged, unstaged, and unrelated changes first:\n${changes}`,
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

  private pendingDispatchBaseline(feature: FeaturePaths, root: string): string {
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
    const ledger = this.ledgerRepository.readLedger(feature);
    const pending = ledger.tickets
      .map((ticket) => ticket.integration ?? ticket.integrationHistory?.at(-1))
      .filter((integration) => integration?.postMerge?.status === "pending");
    const head = this.headSha(root);
    if (!pending.length || pending.some((integration) => integration?.mergeSha !== head)) {
      throw new Error("Pending post-merge validation does not match the exact feature HEAD.");
    }
    const gitPath = (name: string) =>
      resolve(
        root,
        this.gitBuffer(["rev-parse", "--git-path", name], root).toString("utf8").trim(),
      );
    for (const operation of [
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
      "REBASE_HEAD",
      "rebase-merge",
      "rebase-apply",
      "sequencer",
    ]) {
      if (lstatIfPresent(gitPath(operation))) {
        throw new Error(
          `Existing Git operation ${operation} was preserved; inspect it before dispatch.`,
        );
      }
    }
    const common = realpathSync(
      this.gitBuffer(["rev-parse", "--path-format=absolute", "--git-common-dir"], root)
        .toString("utf8")
        .trim(),
    );
    if (lstatIfPresent(join(common, "spindle-record-commit", `${feature.feature}.json`))) {
      throw new Error("Pending workflow-record commit journal must be resolved before dispatch.");
    }
    const status = this.gitBuffer(
      [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        "--ignore-submodules=none",
        "--",
        ".",
      ],
      root,
    )
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    const allowed = this.workflowDeliveryRecordPaths(feature, ledger);
    const lock = `.scratch/${feature.feature}/.sdd-tickets.lock`;
    for (const entry of status) {
      const state = entry.slice(0, 2);
      const path = entry.slice(3);
      if (state[0] !== " " && state !== "??") {
        throw new Error(`Staged data was preserved; inspect it before dispatch: ${path}.`);
      }
      if (path === lock) continue;
      if (!allowed.has(path)) {
        throw new Error(`Unrelated or non-canonical changes were preserved: ${path}.`);
      }
      const file = lstatIfPresent(join(root, path));
      if (!file?.isFile() || file.isSymbolicLink()) {
        throw new Error(`Canonical workflow record is missing or unsafe: ${path}.`);
      }
    }
    if (this.headSha(root) !== head)
      throw new Error("Feature HEAD changed during ticket dispatch.");
    return head;
  }

  public contentIdentity(
    feature: FeaturePaths,
    ticket: TicketDocument,
    baseSha?: string,
    checks?: TicketChecks,
    coveredPaths?: string[],
    workspace?: string,
  ): ContentIdentity {
    const progress = this.ledgerRepository
      .readLedger(feature)
      .tickets.find((item) => item.id === ticket.id);
    const root =
      workspace ??
      (progress ? this.ticketWorkspace(progress) : undefined) ??
      realpathSync(this.app.workspaceRoot);
    const headSha = this.headSha(root);
    const changedPaths = this.changedPaths(baseSha ?? headSha, root);
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
        this.gitBuffer(["ls-files", "--stage", "-z", "--", `:(literal)${path}`], root),
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
      this.ticketRequirements(ticket.raw),
      checks?.required ?? [],
    ];
    const requirementsSnapshot = createHash("sha256")
      .update(JSON.stringify(requirementParts))
      .digest("hex");
    const snapshot = createHash("sha256")
      .update(
        JSON.stringify(
          progress?.worktree && root === progress.worktree.workspace
            ? [codeSnapshot, requirementsSnapshot, headSha]
            : [codeSnapshot, requirementsSnapshot],
        ),
      )
      .digest("hex");
    if (this.headSha(root) !== headSha) {
      throw new Error("Git HEAD changed while computing content evidence.");
    }
    if (progress?.worktree && root === progress.worktree.workspace) {
      this.ticketWorkspace(progress);
    }
    return { snapshot, codeSnapshot, requirementsSnapshot, headSha };
  }

  public deliveryIdentity(
    feature: FeaturePaths,
    ledger: FeatureLedger,
    tickets: TicketDocument[],
  ): ContentIdentity {
    if (tickets.length === 0) throw new Error("Aggregate evidence requires at least one ticket.");
    const delivery = ledger.delivery;
    delivery.baseSha ??= ledger.tickets.find((progress) => progress.baseSha)?.baseSha;
    if (!delivery.baseSha) {
      throw new Error("Aggregate evidence requires the first ticket's recorded Git baseline.");
    }
    const codeIdentity = this.contentIdentity(
      feature,
      tickets[0]!,
      delivery.baseSha,
      undefined,
      undefined,
      realpathSync(this.app.workspaceRoot),
    );
    const requirementsSnapshot = createHash("sha256")
      .update(
        JSON.stringify([
          readFileSync(feature.spec, "utf8"),
          tickets.map((ticket) => [
            ticket.id,
            ticket.title,
            ticket.reporter,
            ticket.category,
            ticket.status,
            ticket.blocked_by,
            ticket.blocker,
            this.ticketRequirements(ticket.raw),
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

  public changedPaths(baseSha: string, workspace?: string): string[] {
    const paths = new Set<string>();
    for (const args of [
      ["diff", "--name-only", "--no-renames", "-z", baseSha, "--", "."],
      ["diff", "--cached", "--name-only", "--no-renames", "-z", baseSha, "--", "."],
      ["ls-files", "--others", "--exclude-standard", "-z"],
    ]) {
      const output = this.gitBuffer(args, workspace).toString("utf8");
      for (const path of output.split("\0")) {
        if (path && path !== ".scratch" && !path.startsWith(".scratch/")) paths.add(path);
      }
    }
    this.assertStableSubmodules(baseSha, paths, workspace);
    return [...paths].sort();
  }

  public assertStableSubmodules(
    baseSha: string,
    changedPaths: Set<string>,
    workspace?: string,
  ): void {
    const gitlinks = new Map<string, string>();
    for (const record of this.gitBuffer(["ls-files", "--stage", "-z"], workspace)
      .toString("utf8")
      .split("\0")) {
      const [metadata, path] = record.split("\t", 2);
      if (!metadata || !path || path === ".scratch" || path.startsWith(".scratch/")) continue;
      const [mode, sha, stage] = metadata.split(" ");
      if (mode === "160000" && sha && stage === "0") gitlinks.set(path, sha);
    }

    const knownPaths = new Set(gitlinks.keys());
    for (const record of this.gitBuffer(["ls-tree", "-r", "-z", baseSha], workspace)
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
      const entry = lstatIfPresent(join(workspace ?? this.app.workspaceRoot, path));
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
        revision = this.gitBuffer(["-C", path, "rev-parse", "--verify", "HEAD"], workspace)
          .toString("utf8")
          .trim();
      } catch {
        throw new Error(
          `Cannot compute code identity for submodule '${path}'; its worktree is missing or uninitialized.`,
        );
      }
      const status = this.gitBuffer(
        ["-C", path, "status", "--porcelain", "--untracked-files=all", "--ignore-submodules=none"],
        workspace,
      ).toString("utf8");
      if (revision !== gitlinks.get(path) || status.length > 0) {
        throw new Error(
          `Cannot compute code identity for changed submodule '${path}'; submodule changes are unsupported.`,
        );
      }
    }
  }

  public ticketRequirements(raw: string): string {
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

  public ticketWorkspace(progress: TicketProgress): string | undefined {
    if (!progress.worktree) return undefined;
    const recorded = progress.worktree;
    const entry = lstatIfPresent(recorded.workspace);
    if (
      !entry?.isDirectory() ||
      entry.isSymbolicLink() ||
      realpathSync(recorded.workspace) !== recorded.workspace
    ) {
      throw new Error(
        `Ticket ${progress.id} worktree is missing or unsafe: ${recorded.workspace}.`,
      );
    }
    const canonical = realpathSync(this.app.workspaceRoot);
    const common = this.gitBuffer(["rev-parse", "--path-format=absolute", "--git-common-dir"])
      .toString("utf8")
      .trim();
    const ticketCommon = this.gitBuffer(
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      recorded.workspace,
    )
      .toString("utf8")
      .trim();
    const branch = this.gitBuffer(
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      recorded.workspace,
    )
      .toString("utf8")
      .trim();
    const top = this.gitBuffer(["rev-parse", "--show-toplevel"], recorded.workspace)
      .toString("utf8")
      .trim();
    const registrations = this.gitBuffer(["worktree", "list", "--porcelain", "-z"])
      .toString("utf8")
      .split("\0");
    if (
      isPathInside(canonical, recorded.workspace) ||
      realpathSync(common) !== realpathSync(ticketCommon) ||
      realpathSync(top) !== recorded.workspace ||
      !registrations.includes(`worktree ${recorded.workspace}`) ||
      branch !== recorded.branch
    ) {
      throw new Error(
        `Ticket ${progress.id} worktree no longer matches its recorded repository and branch.`,
      );
    }
    const ancestor = this.git.run(["merge-base", "--is-ancestor", recorded.baseSha, "HEAD"], {
      cwd: recorded.workspace,
      encoding: "utf8",
    });
    if (ancestor.error) throw ancestor.error;
    if (ancestor.status !== 0)
      throw new Error(`Ticket ${progress.id} no longer descends from its recorded baseline.`);
    return recorded.workspace;
  }

  public assertTicketCodeCommitted(progress: TicketProgress): void {
    const workspace = this.ticketWorkspace(progress);
    if (!workspace) return;
    const scratchDiff = this.gitBuffer(
      ["diff", "--name-only", "--no-renames", "-z", progress.baseSha!, "HEAD", "--", ".scratch"],
      workspace,
    );
    const scratchStatus = this.gitBuffer(
      ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".scratch"],
      workspace,
    );
    if (scratchDiff.length || scratchStatus.length) {
      throw new Error("Ticket worktree must not modify .scratch; use canonical feature records.");
    }
    const changed = new Set<string>();
    for (const args of [
      ["diff", "--name-only", "--no-renames", "-z", "HEAD", "--", "."],
      ["diff", "--cached", "--name-only", "--no-renames", "-z", "HEAD", "--", "."],
      ["ls-files", "--others", "--exclude-standard", "-z"],
    ]) {
      for (const path of this.gitBuffer(args, workspace).toString("utf8").split("\0")) {
        if (path && path !== ".scratch" && !path.startsWith(".scratch/")) changed.add(path);
      }
    }
    if (changed.size > 0)
      throw new Error(`Commit ticket code before review: ${[...changed].sort().join(", ")}.`);
  }

  public headSha(workspace?: string): string {
    const revision = this.git.run(["rev-parse", "--verify", "HEAD"], {
      cwd: workspace ?? realpathSync(this.app.workspaceRoot),
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    if (revision.error) throw revision.error;
    if (revision.status !== 0 || !/^[0-9a-f]{40,64}\n?$/i.test(revision.stdout)) {
      throw new Error(`Unable to identify current Git revision: ${revision.stderr.trim()}`);
    }
    return revision.stdout.trim();
  }

  public gitBuffer(args: string[], workspace?: string): Buffer {
    const result = this.git.run(args, {
      cwd: workspace ?? realpathSync(this.app.workspaceRoot),
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
    const relativeLock = relative(root, join(feature.workspace, ".sdd-tickets.lock"));
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
      throw new Error(
        `git status failed while checking dispatch readiness: ${status.stderr.trim()}`,
      );
    }
    return status.stdout.trim();
  }

  public integrationPreservesEvidence(
    progress: TicketProgress | DeliveryProgress,
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
      const workspace = this.ticketWorkspace(progress);
      return (
        progress.integration.contentDigest === accepted.contentDigest &&
        JSON.stringify(progress.integration.files) === JSON.stringify(accepted.files) &&
        JSON.stringify(this.changedPaths(progress.baseSha!, workspace)) ===
          JSON.stringify(accepted.files) &&
        this.worktreeContentDigest(accepted.files, workspace) === accepted.contentDigest
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
    const lockPath = `.scratch/${feature.feature}/.sdd-tickets.lock`;
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
