import { randomUUID } from "node:crypto";
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
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import matter from "gray-matter";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitService } from "@/Git/Services/GitService";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type {
  AcceptedEvidence,
  ContentIdentity,
} from "@/SubagentDrivenDevelopment/Models/Evidence";
import type { IntegrateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import type { FeaturePaths, TicketProgress } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { lstatIfPresent } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { AcceptancePolicy } from "@/SubagentDrivenDevelopment/Policies/AcceptancePolicy";
import {
  validateAuthor,
  validateTicketId,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { WorkflowRecordsCommitter } from "@/SubagentDrivenDevelopment/Services/WorkflowRecordsCommitter";
import { Records } from "@/Support/Records";

interface MergeJournal {
  version: 1;
  id: string;
  feature: string;
  ticket: string;
  featureHead: string;
  ticketHead: string;
  snapshot: string;
  files: string[];
  contentDigest: string;
}

export class TicketIntegrationService extends Service {
  public constructor(
    app: Application,
    private readonly git: GitService,
    private readonly gitEvidence: GitEvidence,
    private readonly reports: ReportEvidence,
    private readonly tickets: TicketRepository,
    private readonly ledgers: LedgerRepository,
    private readonly transaction: WorkspaceTransaction,
    private readonly acceptance: AcceptancePolicy,
    private readonly workflow: WorkflowPolicy,
    private readonly inspection: FeatureInspectionService,
    private readonly workflowRecordsCommitter: WorkflowRecordsCommitter,
  ) {
    super(app);
  }

  public integrate(options: IntegrateOptions): {
    ticket: string;
    ticketCommit: string;
    mergeCommit: string;
    postMerge: "pending";
    journal: string;
    idempotent?: true;
  } {
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    for (const variable of [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_COMMON_DIR",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_NAMESPACE",
    ]) {
      if (process.env[variable]) throw new Error(`Unset ${variable} before ticket integration.`);
    }
    const root = realpathSync(this.app.workspaceRoot);
    const feature = this.inspection.resolveFeature(options.spec);
    return this.transaction.run(feature.workspace, () => {
      const ledger = this.ledgers.readLedger(feature);
      const ticket = this.tickets.requireTicket(
        this.tickets.readTickets(feature.workspace),
        options.ticket,
      );
      const progress = this.workflow.requireProgress(ledger, options.ticket);
      if (!progress.worktree || !progress.baseSha) {
        throw new Error("Ticket integration requires an isolated ticket worktree.");
      }
      if (
        progress.execution !== "reviewing" &&
        progress.execution !== "changes-requested" &&
        progress.execution !== "integrated"
      ) {
        throw new Error(`Ticket ${options.ticket} must have current review before integration.`);
      }
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the ticket controller may integrate this ticket.");
      }
      this.assertCanonical(root, feature);
      const identity = this.gitEvidence.contentIdentity(
        feature,
        ticket,
        progress.baseSha,
        progress.checks,
      );
      const outstandingPostMerge = ledger.tickets.filter((candidate) => {
        const integration = candidate.integration ?? candidate.integrationHistory?.at(-1);
        return integration?.postMerge?.status === "pending";
      });
      const alreadyIntegrated =
        progress.execution === "integrated" &&
        progress.integration?.commitSha === identity.headSha &&
        !!progress.integration?.mergeSha;
      const idempotentPendingValidation =
        alreadyIntegrated && String(progress.integration?.postMerge?.status) === "pending";
      const previousIntegration = progress.integrationHistory?.at(-1);
      const correction = progress.correctionAttempts?.at(-1);
      const failedCommand = correction?.checkFailure;
      const previousFailure = failedCommand
        ? previousIntegration?.postMerge?.checks?.records
            .filter((record) => record.command === failedCommand)
            .at(-1)
        : undefined;
      const failedCorrection =
        outstandingPostMerge.length === 1 &&
        outstandingPostMerge[0]?.id === options.ticket &&
        !progress.integration &&
        !!previousIntegration?.mergeSha &&
        previousIntegration.postMerge?.status === "pending" &&
        previousFailure?.result === "failed" &&
        previousFailure.headSha === previousIntegration.mergeSha &&
        progress.assignment?.action === "correct" &&
        progress.assignment.attempt === correction?.number;
      if (outstandingPostMerge.length > 0 && !idempotentPendingValidation && !failedCorrection) {
        throw new Error(
          `Ticket integration is blocked while post-merge validation is pending or failed for: ${outstandingPostMerge.map((item) => item.id).join(", ")}.`,
        );
      }
      if (failedCorrection && previousIntegration?.mergeSha) {
        this.assertAncestor(
          root,
          previousIntegration.mergeSha,
          progress.baseSha,
          "Correction baseline must descend from the failed feature merge.",
        );
        this.assertAncestor(
          root,
          progress.baseSha,
          identity.headSha,
          "Correction must descend from its reviewed feature baseline.",
        );
        this.assertAncestor(
          root,
          progress.baseSha,
          "HEAD",
          "The reviewed correction baseline is no longer on the feature branch.",
        );
        const allowed = this.gitEvidence.workflowDeliveryRecordPaths(feature, ledger);
        const changed = this.buffer(root, [
          "diff",
          "--name-only",
          "-z",
          "--no-renames",
          progress.baseSha,
          "HEAD",
          "--",
          ".",
        ])
          .toString("utf8")
          .split("\0")
          .filter((path) => path && !allowed.has(path));
        if (changed.length)
          throw new Error(
            `Feature code changed since the reviewed correction baseline; rebase and re-review before integration: ${changed.join(", ")}.`,
          );
      }
      const blockers = this.acceptance.acceptBlockers(feature, ledger, ticket, progress, identity);
      if (blockers.length)
        throw new Error(`Ticket review or checks are not current:\n${blockers.join("\n")}`);
      const accepted = this.acceptedEvidence(feature, progress, identity);
      if (
        alreadyIntegrated &&
        (identity.snapshot !== accepted.snapshot ||
          identity.codeSnapshot !== accepted.codeSnapshot ||
          identity.requirementsSnapshot !== accepted.requirementsSnapshot)
      ) {
        throw new Error("Ticket review evidence is stale; fresh review is required.");
      }
      this.reports.assertAcceptedReportsCurrent(feature, progress);
      const workspace = this.gitEvidence.ticketWorkspace(progress)!;
      this.gitEvidence.assertTicketCodeCommitted(progress);
      if (
        JSON.stringify(this.gitEvidence.changedPaths(progress.baseSha, workspace)) !==
          JSON.stringify(accepted.files) ||
        this.gitEvidence.worktreeContentDigest(accepted.files, workspace) !== accepted.contentDigest
      ) {
        throw new Error("Ticket inventory or content differs from its current review.");
      }
      if (!alreadyIntegrated) {
        this.assertNoOperation(root);
        this.assertNoHooks(root);
        this.workflowRecordsCommitter.commit(feature, options.confirmRecords === true);
      }
      const common = realpathSync(
        this.run(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
      );
      const directory = join(common, "spindle-ticket-integration");
      try {
        mkdirSync(directory, { mode: 0o700 });
      } catch (error) {
        if (!lstatIfPresent(directory)?.isDirectory()) throw error;
      }
      if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) {
        throw new Error("Integration journal directory must be a real directory.");
      }
      const journalPath = join(
        directory,
        `${feature.feature}-${options.ticket}-${identity.headSha}.json`,
      );
      let journal: MergeJournal;
      if (lstatIfPresent(journalPath)) {
        journal = this.readJournal(journalPath, feature, progress, identity.headSha, accepted);
      } else {
        if (progress.execution === "integrated") {
          throw new Error(`Integration journal is missing: ${journalPath}.`);
        }
        this.assertNoOperation(root);
        this.assertNoHooks(root);
        this.assertClean(root, feature);
        const featureHead = this.run(root, ["rev-parse", "--verify", "HEAD"]);
        this.assertAncestor(
          root,
          progress.baseSha,
          featureHead,
          "Ticket baseline is no longer on the feature branch.",
        );
        if (this.isAncestor(root, identity.headSha, featureHead)) {
          throw new Error(
            "Ticket commit is already in feature history; refusing an unverified integration.",
          );
        }
        this.assertMergePreflight(root, featureHead, identity.headSha, accepted.files, workspace);
        journal = {
          version: 1,
          id: randomUUID(),
          feature: feature.feature,
          ticket: options.ticket,
          featureHead,
          ticketHead: identity.headSha,
          snapshot: identity.snapshot,
          files: accepted.files,
          contentDigest: accepted.contentDigest,
        };
        this.createJournal(journalPath, journal);
      }

      if (alreadyIntegrated) {
        const mergeSha = progress.integration?.mergeSha;
        if (
          !mergeSha ||
          progress.integration?.postMerge?.status !== "pending" ||
          progress.integration.postMerge.mergeSha !== mergeSha ||
          progress.integration.commitSha !== journal.ticketHead ||
          progress.integration.contentDigest !== journal.contentDigest ||
          JSON.stringify(progress.integration.files) !== JSON.stringify(journal.files)
        ) {
          throw new Error("Ticket integration has no valid pending post-merge record.");
        }
        this.assertMergeCommit(root, journal, mergeSha);
        this.assertAncestor(
          root,
          mergeSha,
          "HEAD",
          "Recorded merge is no longer on the feature branch.",
        );
        return {
          ticket: options.ticket,
          ticketCommit: journal.ticketHead,
          mergeCommit: mergeSha,
          postMerge: "pending",
          journal: journalPath,
          idempotent: true,
        };
      }

      try {
        const currentHead = this.run(root, ["rev-parse", "--verify", "HEAD"]);
        let mergeSha: string;
        if (currentHead === journal.featureHead) {
          this.assertNoOperation(root);
          this.assertNoHooks(root);
          this.assertClean(root, feature);
          this.assertNoIgnoredCollisions(root, journal);
          this.run(root, [
            "-c",
            "merge.autostash=false",
            "merge",
            "--no-ff",
            "--no-commit",
            "--no-autostash",
            "--no-overwrite-ignore",
            journal.ticketHead,
          ]);
          const mergeHead = this.run(root, ["rev-parse", "--verify", "MERGE_HEAD"]);
          if (mergeHead !== journal.ticketHead)
            throw new Error("Unexpected merge input was preserved.");
          this.assertIndexMatchesReview(root, journal);
          const confirmed = this.gitEvidence.contentIdentity(
            feature,
            ticket,
            progress.baseSha,
            progress.checks,
          );
          if (confirmed.snapshot !== journal.snapshot || confirmed.headSha !== journal.ticketHead) {
            throw new Error("Ticket evidence changed during merge; re-review is required.");
          }
          const confirmedBlockers = this.acceptance.acceptBlockers(
            feature,
            ledger,
            ticket,
            progress,
            confirmed,
          );
          if (confirmedBlockers.length)
            throw new Error(`Ticket review changed during merge:\n${confirmedBlockers.join("\n")}`);
          this.reports.assertAcceptedReportsCurrent(feature, progress);
          if (this.run(root, ["rev-parse", "--verify", "HEAD"]) !== journal.featureHead) {
            throw new Error("Feature branch changed during merge.");
          }
          this.run(root, ["commit", "-m", this.message(journal)]);
          mergeSha = this.run(root, ["rev-parse", "--verify", "HEAD"]);
        } else {
          mergeSha = currentHead;
        }
        this.assertMergeCommit(root, journal, mergeSha);
        this.assertClean(root, feature);
        progress.execution = "integrated";
        const carriedChecks = failedCorrection ? previousIntegration?.postMerge?.checks : undefined;
        progress.integration = {
          commitSha: journal.ticketHead,
          mergeSha,
          postMerge: {
            status: "pending",
            mergeSha,
            ...(carriedChecks
              ? {
                  checks: {
                    required: carriedChecks.required.map((requirement) => ({ ...requirement })),
                    records: [],
                  },
                }
              : {}),
          },
          integratedAt: new Date().toISOString(),
          integratedBy: options.author.trim(),
          files: accepted.files,
          contentDigest: accepted.contentDigest,
        };
        const afterTicket = matter.stringify(
          this.tickets.appendAudit(
            ticket.body,
            options.author,
            `Reviewed ticket commit ${journal.ticketHead} merged as ${mergeSha}; post-merge checks are pending.`,
          ),
          this.tickets.metadata(ticket),
        );
        progress.acceptedEvidence = accepted;
        this.transaction.writeWorkflowState(feature, ticket, afterTicket, ledger);
        return {
          ticket: options.ticket,
          ticketCommit: journal.ticketHead,
          mergeCommit: mergeSha,
          postMerge: "pending",
          journal: journalPath,
        };
      } catch (error) {
        throw new Error(
          `Ticket integration stopped; preserve the feature checkout and inspect ${journalPath}. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  private assertCanonical(root: string, feature: FeaturePaths): void {
    const common = realpathSync(
      this.run(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
    );
    const path = join(common, "spindle-feature-start", `${feature.feature}.json`);
    const entry = lstatIfPresent(path);
    if (!entry?.isFile() || entry.isSymbolicLink())
      throw new Error("Canonical feature startup state is missing or unsafe.");
    const state: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      !Records.isRecord(state) ||
      state.version !== 1 ||
      state.phase !== "created" ||
      state.feature !== feature.feature ||
      state.featureWorkspace !== root ||
      state.featureBranch !== `features/${feature.feature}` ||
      this.run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== state.featureBranch
    ) {
      throw new Error("Integration must run in the recorded canonical feature worktree.");
    }
  }

  private acceptedEvidence(
    feature: FeaturePaths,
    progress: TicketProgress,
    identity: ContentIdentity,
  ): AcceptedEvidence {
    if (
      progress.execution === "integrated" &&
      progress.integration?.commitSha === identity.headSha &&
      progress.acceptedEvidence
    ) {
      return progress.acceptedEvidence;
    }
    const files = this.workflow.acceptedInventory(progress, progress.id);
    const workspace = this.gitEvidence.ticketWorkspace(progress);
    this.gitEvidence.assertTicketCodeCommitted(progress);
    return {
      snapshot: identity.snapshot,
      codeSnapshot: identity.codeSnapshot,
      requirementsSnapshot: identity.requirementsSnapshot,
      files,
      contentDigest: this.gitEvidence.worktreeContentDigest(files, workspace),
    };
  }

  private readJournal(
    path: string,
    feature: FeaturePaths,
    progress: TicketProgress,
    ticketHead: string,
    accepted: AcceptedEvidence,
  ): MergeJournal {
    const entry = lstatSync(path);
    if (!entry.isFile() || entry.isSymbolicLink())
      throw new Error(`Integration journal is unsafe: ${path}.`);
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (
      !Records.isRecord(value) ||
      value.version !== 1 ||
      typeof value.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(value.id) ||
      value.feature !== feature.feature ||
      value.ticket !== progress.id ||
      typeof value.featureHead !== "string" ||
      !/^[0-9a-f]{40,64}$/i.test(value.featureHead) ||
      value.ticketHead !== ticketHead ||
      value.snapshot !== accepted.snapshot ||
      value.contentDigest !== accepted.contentDigest ||
      JSON.stringify(value.files) !== JSON.stringify(accepted.files)
    ) {
      throw new Error(`Integration journal conflicts with current ticket evidence: ${path}.`);
    }
    return {
      version: 1,
      id: value.id,
      feature: feature.feature,
      ticket: progress.id,
      featureHead: value.featureHead,
      ticketHead,
      snapshot: accepted.snapshot,
      files: accepted.files,
      contentDigest: accepted.contentDigest,
    };
  }

  private createJournal(path: string, journal: MergeJournal): void {
    const fd = openSync(path, "wx", 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(journal, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    const directory = openSync(resolve(path, ".."), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }

  private assertMergePreflight(
    root: string,
    featureHead: string,
    ticketHead: string,
    files: string[],
    workspace: string,
  ): void {
    const result = this.git.run(
      ["merge-tree", "--write-tree", "--name-only", featureHead, ticketHead],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      },
    );
    if (result.error) throw result.error;
    if (result.status === 1) {
      throw new Error(
        `Merge conflicts require resolution in ticket worktree ${workspace}; rebase it onto the current feature branch, resolve and commit conflicts, adopt the baseline with checks require --rebase-baseline, then obtain fresh checks and review. Feature checkout was preserved.\n${result.stdout.trim()}`,
      );
    }
    if (result.status !== 0)
      throw new Error(`Merge preflight failed; preserve both worktrees: ${result.stderr.trim()}`);
    const tree = result.stdout.trim().split(/\s+/)[0];
    if (!tree || !/^[0-9a-f]{40,64}$/i.test(tree))
      throw new Error("Merge preflight returned an invalid tree.");
    const paths = this.buffer(root, [
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      featureHead,
      tree,
      "--",
      ".",
    ])
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    if (paths.some((path) => !files.includes(path)))
      throw new Error("Merge would introduce unreviewed paths; re-review in the ticket worktree.");
    const diff = this.git.run(
      ["diff", "--quiet", ticketHead, tree, "--", ...files.map((path) => `:(literal)${path}`)],
      { cwd: root, encoding: "utf8" },
    );
    if (diff.error) throw diff.error;
    if (diff.status !== 0)
      throw new Error(
        `Merge differs from the reviewed ticket commit; reconcile in ${workspace} and obtain fresh review.`,
      );
  }

  private assertNoIgnoredCollisions(root: string, journal: MergeJournal): void {
    // Some Git versions still overwrite ignored files during a non-fast-forward merge
    // despite --no-overwrite-ignore, so check the reviewed incoming paths as well.
    if (!journal.files.length) return;
    const literals = journal.files.map((path) => `:(literal)${path}`);
    const incoming = this.buffer(root, [
      "ls-tree",
      "-r",
      "--name-only",
      "-z",
      journal.ticketHead,
      "--",
      ...literals,
    ])
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    if (!incoming.length) return;
    const candidates = new Set(incoming);
    for (const path of incoming) {
      const components = path.split("/");
      for (let count = 1; count < components.length; count++) {
        const ancestor = components.slice(0, count).join("/");
        const entry = lstatIfPresent(join(root, ancestor));
        if (!entry) break;
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
          candidates.add(ancestor);
          break;
        }
      }
    }
    const ignored = this.buffer(root, [
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--full-name",
      "-z",
      "--",
      ...[...candidates].map((path) => `:(literal)${path}`),
    ])
      .toString("utf8")
      .split("\0")
      .filter(
        (path) =>
          path &&
          incoming.some(
            (target) =>
              path === target || path.startsWith(`${target}/`) || target.startsWith(`${path}/`),
          ),
      );
    if (!ignored.length) {
      for (const path of incoming) {
        if (!lstatIfPresent(join(root, path))?.isDirectory()) continue;
        const result = this.git.run(["check-ignore", "--quiet", "--", path], {
          cwd: root,
          encoding: "utf8",
        });
        if (result.error) throw result.error;
        if (result.status === 0) ignored.push(path);
        else if (result.status !== 1)
          throw new Error("Cannot verify ignored directory collision safety.");
      }
    }
    if (ignored.length) {
      throw new Error(
        `Ignored files would be overwritten by the reviewed merge; preserve or move them before retrying: ${ignored.join(", ")}.`,
      );
    }
  }

  private assertIndexMatchesReview(root: string, journal: MergeJournal): void {
    if (this.buffer(root, ["ls-files", "--unmerged", "-z"]).length) {
      throw new Error("Merge conflicts remain; conflict resolution requires fresh review.");
    }
    const paths = this.buffer(root, [
      "diff",
      "--cached",
      "--name-only",
      "--no-renames",
      "-z",
      journal.featureHead,
      "--",
      ".",
    ])
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    if (paths.some((path) => !journal.files.includes(path))) {
      throw new Error("Merge introduces unreviewed paths; preserve the merge for review.");
    }
    const diff = this.git.run(
      [
        "diff",
        "--cached",
        "--quiet",
        journal.ticketHead,
        "--",
        ...journal.files.map((path) => `:(literal)${path}`),
      ],
      { cwd: root, encoding: "utf8" },
    );
    if (diff.error) throw diff.error;
    if (diff.status !== 0)
      throw new Error(
        "Merged content differs from the reviewed ticket commit; preserve it for fresh review.",
      );
  }

  private assertMergeCommit(root: string, journal: MergeJournal, mergeSha: string): void {
    const parents = this.run(root, ["rev-list", "--parents", "-n", "1", mergeSha]).split(" ");
    const message = this.run(root, ["show", "-s", "--format=%B", mergeSha]);
    if (
      parents.length !== 3 ||
      parents[1] !== journal.featureHead ||
      parents[2] !== journal.ticketHead ||
      message !== this.message(journal)
    ) {
      throw new Error(
        "Feature HEAD is not the journaled reviewed merge; preserve it for inspection.",
      );
    }
    const paths = this.buffer(root, [
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      journal.featureHead,
      mergeSha,
      "--",
      ".",
    ])
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    if (paths.some((path) => !journal.files.includes(path)))
      throw new Error("Merge commit contains unreviewed paths.");
    const diff = this.git.run(
      [
        "diff",
        "--quiet",
        journal.ticketHead,
        mergeSha,
        "--",
        ...journal.files.map((path) => `:(literal)${path}`),
      ],
      { cwd: root, encoding: "utf8" },
    );
    if (diff.error) throw diff.error;
    if (diff.status !== 0)
      throw new Error("Merge commit differs from the reviewed ticket content.");
  }

  private message(journal: MergeJournal): string {
    return `spindle: merge ${journal.ticket} (${journal.id})`;
  }

  private assertClean(root: string, feature: FeaturePaths): void {
    const lock = `.scratch/${feature.feature}/.sdd-tickets.lock`;
    const status = this.run(root, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--ignore-submodules=none",
      "--",
      ".",
      `:(exclude,literal)${lock}`,
    ]);
    if (status)
      throw new Error(
        `Commit canonical workflow records and resolve other changes before integration:\n${status}`,
      );
  }

  private assertNoOperation(root: string): void {
    if (this.buffer(root, ["ls-files", "--unmerged", "-z"]).length) {
      throw new Error("Merge conflicts require reviewed resolution before continuing.");
    }
    for (const operation of [
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
      "rebase-merge",
      "rebase-apply",
      "sequencer",
    ]) {
      const path = resolve(root, this.run(root, ["rev-parse", "--git-path", operation]));
      if (lstatIfPresent(path))
        throw new Error(
          `Existing Git operation ${operation} was preserved; inspect and review before continuing.`,
        );
    }
  }

  private assertNoHooks(root: string): void {
    for (const hook of [
      "pre-merge-commit",
      "pre-commit",
      "prepare-commit-msg",
      "commit-msg",
      "post-commit",
      "post-merge",
      "post-rewrite",
      "pre-auto-gc",
      "reference-transaction",
    ]) {
      const path = this.run(root, ["rev-parse", "--git-path", `hooks/${hook}`]);
      try {
        accessSync(isAbsolute(path) ? path : join(root, path), constants.X_OK);
      } catch {
        continue;
      }
      throw new Error(`Active Git hook ${path} requires manual handling before integration.`);
    }
  }

  private isAncestor(root: string, ancestor: string, descendant: string): boolean {
    const result = this.git.run(["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1)
      throw new Error(`git merge-base failed: ${result.stderr.trim()}`);
    return result.status === 0;
  }

  private assertAncestor(
    root: string,
    ancestor: string,
    descendant: string,
    message: string,
  ): void {
    if (!this.isAncestor(root, ancestor, descendant)) throw new Error(message);
  }

  private run(root: string, args: string[]): string {
    return this.buffer(root, args).toString("utf8").trim();
  }

  private buffer(root: string, args: string[]): Buffer {
    const result = this.git.run(args, { cwd: root, encoding: "buffer" });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`git ${args[0]} failed: ${result.stderr.toString("utf8").trim()}`);
    return result.stdout;
  }
}
