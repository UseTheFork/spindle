import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import matter from "gray-matter";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitService } from "@/Git/Services/GitService";
import type { CommitIdentity } from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  TicketProgress,
  FeatureLedger,
  FeaturePaths,
  TicketDocument,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
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

  public commitIdentity(
    feature: FeaturePaths,
    ticket: TicketDocument,
    baseSha?: string,
    workspace?: string,
  ): CommitIdentity {
    const progress = this.ledgerRepository
      .readLedger(feature)
      .tickets.find((item) => item.id === ticket.id);
    const root =
      workspace ??
      (progress ? this.ticketWorkspace(progress) : undefined) ??
      realpathSync(this.app.workspaceRoot);
    const headSha = this.headSha(root);
    if (baseSha && this.headSha(root) !== headSha) {
      throw new Error("Git HEAD changed while reading commit evidence.");
    }
    if (progress?.worktree && root === progress.worktree.workspace) {
      this.ticketWorkspace(progress);
    }
    return { headSha };
  }

  public deliveryCommitIdentity(
    feature: FeaturePaths,
    ledger: FeatureLedger,
    tickets: TicketDocument[],
  ): CommitIdentity {
    if (tickets.length === 0) throw new Error("Aggregate evidence requires at least one ticket.");
    const delivery = ledger.delivery;
    delivery.baseSha ??= ledger.tickets.find((progress) => progress.baseSha)?.baseSha;
    if (!delivery.baseSha) {
      throw new Error("Aggregate evidence requires the first ticket's recorded Git baseline.");
    }
    const root = realpathSync(this.app.workspaceRoot);
    this.assertCommittedCode(root);
    const headSha = this.headSha(root);
    this.assertCommittedRequirements(feature, tickets, headSha);
    return { headSha };
  }

  public assertCommittedRequirements(
    feature: FeaturePaths,
    tickets: Pick<TicketDocument, "id" | "path">[],
    commitSha: string,
  ): void {
    const root = realpathSync(this.app.workspaceRoot);
    const specPath = relative(root, feature.spec);
    const canonicalSpec = this.gitBuffer(["show", `${commitSha}:${specPath}`], root).toString(
      "utf8",
    );
    if (canonicalSpec !== readFileSync(feature.spec, "utf8")) {
      throw new Error(
        "The feature spec has uncommitted changes; commit requirements before review.",
      );
    }
    for (const ticket of tickets) {
      const path = relative(root, ticket.path);
      const committed = this.gitBuffer(["show", `${commitSha}:${path}`], root).toString("utf8");
      if (
        this.ticketRequirements(committed) !==
        this.ticketRequirements(readFileSync(ticket.path, "utf8"))
      ) {
        throw new Error(
          `Ticket ${ticket.id} requirements have uncommitted changes; commit them before review.`,
        );
      }
    }
  }

  public assertTicketRequirementsCurrent(
    feature: FeaturePaths,
    ticket: Pick<TicketDocument, "id" | "path">,
    ticketCommit: string,
    ticketWorkspace: string,
  ): void {
    const featureHead = this.headSha(realpathSync(this.app.workspaceRoot));
    const root = realpathSync(this.app.workspaceRoot);
    const featureSpecPath = relative(root, feature.spec);
    const ticketPath = relative(root, ticket.path);
    const canonicalSpec = this.gitBuffer(
      ["show", `${featureHead}:${featureSpecPath}`],
      root,
    ).toString("utf8");
    const ticketSpec = this.gitBuffer(
      ["show", `${ticketCommit}:${featureSpecPath}`],
      ticketWorkspace,
    ).toString("utf8");
    const canonicalTicket = this.gitBuffer(["show", `${featureHead}:${ticketPath}`], root).toString(
      "utf8",
    );
    const branchTicket = this.gitBuffer(
      ["show", `${ticketCommit}:${ticketPath}`],
      ticketWorkspace,
    ).toString("utf8");
    if (
      canonicalSpec !== ticketSpec ||
      this.ticketRequirements(canonicalTicket) !== this.ticketRequirements(branchTicket)
    ) {
      throw new Error(
        `Ticket ${ticket.id} does not contain the current committed requirements; update and commit the requirements before review.`,
      );
    }
  }

  public commitPreservesInputs(
    feature: FeaturePaths,
    ticket: Pick<TicketDocument, "id" | "path">,
    fromSha: string,
    toSha: string,
    workspace: string,
  ): boolean {
    if (fromSha === toSha) return true;
    const ancestor = this.git.run(["merge-base", "--is-ancestor", fromSha, toSha], {
      cwd: workspace,
      encoding: "utf8",
    });
    if (ancestor.error) throw ancestor.error;
    if (ancestor.status === 1) return false;
    if (ancestor.status !== 0) {
      throw new Error(`Cannot validate commit ancestry: ${ancestor.stderr.trim()}`);
    }
    const changes = this.changedPathsBetween(fromSha, toSha, workspace);
    if (changes.length > 0) return false;
    return this.requirementsMatchAtCommits(feature, ticket, fromSha, toSha, workspace);
  }

  public changedPathsBetween(fromSha: string, toSha: string, workspace: string): string[] {
    return this.gitBuffer(
      ["diff", "--name-only", "-z", "--no-renames", fromSha, toSha, "--", "."],
      workspace,
    )
      .toString("utf8")
      .split("\0")
      .filter((path) => path && path !== ".scratch" && !path.startsWith(".scratch/"));
  }

  public requirementsMatchAtCommits(
    feature: FeaturePaths,
    ticket: Pick<TicketDocument, "id" | "path">,
    fromSha: string,
    toSha: string,
    workspace: string,
  ): boolean {
    const root = realpathSync(this.app.workspaceRoot);
    const specPath = relative(root, feature.spec);
    const ticketPath = relative(root, ticket.path);
    const requirementsAt = (sha: string) => [
      this.gitBuffer(["show", `${sha}:${specPath}`], workspace).toString("utf8"),
      this.ticketRequirements(
        this.gitBuffer(["show", `${sha}:${ticketPath}`], workspace).toString("utf8"),
      ),
    ];
    return JSON.stringify(requirementsAt(fromSha)) === JSON.stringify(requirementsAt(toSha));
  }

  public deliveryInputsPreserved(
    feature: FeaturePaths,
    fromSha: string,
    toSha: string,
    workspace: string,
  ): boolean {
    if (fromSha === toSha) return true;
    const ancestor = this.git.run(["merge-base", "--is-ancestor", fromSha, toSha], {
      cwd: workspace,
      encoding: "utf8",
    });
    if (ancestor.error) throw ancestor.error;
    if (ancestor.status === 1) return false;
    if (ancestor.status !== 0) {
      throw new Error(`Cannot validate commit ancestry: ${ancestor.stderr.trim()}`);
    }
    if (this.changedPathsBetween(fromSha, toSha, workspace).length) {
      return false;
    }
    return this.deliveryRequirementsMatchAtCommits(feature, fromSha, toSha, workspace);
  }

  public deliveryRequirementsMatchAtCommits(
    feature: FeaturePaths,
    fromSha: string,
    toSha: string,
    workspace: string,
  ): boolean {
    const root = realpathSync(this.app.workspaceRoot);
    const specPath = relative(root, feature.spec);
    const ticketPaths = readdirSync(join(feature.workspace, "tickets"))
      .filter((path) => path.endsWith(".md"))
      .sort()
      .map((path) => relative(root, join(feature.workspace, "tickets", path)));
    const inputsAt = (sha: string) => [
      this.gitBuffer(["show", `${sha}:${specPath}`], workspace).toString("utf8"),
      ...ticketPaths.map((path) =>
        this.ticketRequirements(
          this.gitBuffer(["show", `${sha}:${path}`], workspace).toString("utf8"),
        ),
      ),
    ];
    return JSON.stringify(inputsAt(fromSha)) === JSON.stringify(inputsAt(toSha));
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
    const scratchStatus = this.gitBuffer(
      ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".scratch"],
      workspace,
    );
    if (scratchStatus.length) {
      throw new Error("Commit ticket requirements and keep workflow records clean before review.");
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

  public assertCommittedCode(workspace: string): void {
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
      throw new Error(
        `Commit code changes before checks or review: ${[...changed].sort().join(", ")}.`,
      );
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
