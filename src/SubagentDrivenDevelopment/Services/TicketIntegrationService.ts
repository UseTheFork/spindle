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
import type { TicketSelection } from "@/SubagentDrivenDevelopment/Models/Options";
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
  ) {
    super(app);
  }

  public integrate(options: TicketSelection): {
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
      if (!progress.worktree || !progress.baseSha || !progress.acceptedEvidence) {
        throw new Error("Ticket integration requires an accepted isolated ticket worktree.");
      }
      if (progress.execution !== "accepted" && progress.execution !== "integrated") {
        throw new Error(`Ticket ${options.ticket} must be accepted before integration.`);
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
      const accepted = progress.acceptedEvidence;
      if (
        identity.snapshot !== accepted.snapshot ||
        identity.codeSnapshot !== accepted.codeSnapshot ||
        identity.requirementsSnapshot !== accepted.requirementsSnapshot
      ) {
        throw new Error("Accepted ticket evidence is stale; fresh review is required.");
      }
      const blockers = this.acceptance.acceptBlockers(feature, ledger, ticket, progress, identity);
      if (blockers.length)
        throw new Error(`Ticket review or checks are not current:\n${blockers.join("\n")}`);
      this.reports.assertAcceptedReportsCurrent(feature, progress);
      const workspace = this.gitEvidence.ticketWorkspace(progress)!;
      this.gitEvidence.assertTicketCodeCommitted(progress);
      if (
        JSON.stringify(this.gitEvidence.changedPaths(progress.baseSha, workspace)) !==
          JSON.stringify(accepted.files) ||
        this.gitEvidence.worktreeContentDigest(accepted.files, workspace) !== accepted.contentDigest
      ) {
        throw new Error("Ticket inventory or content changed after acceptance.");
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
      const journalPath = join(directory, `${feature.feature}-${options.ticket}.json`);
      let journal: MergeJournal;
      if (lstatIfPresent(journalPath)) {
        journal = this.readJournal(journalPath, feature, progress, identity.headSha);
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
        journal = {
          version: 1,
          id: randomUUID(),
          feature: feature.feature,
          ticket: options.ticket,
          featureHead,
          ticketHead: identity.headSha,
          snapshot: accepted.snapshot,
          files: accepted.files,
          contentDigest: accepted.contentDigest,
        };
        this.createJournal(journalPath, journal);
      }

      if (progress.execution === "integrated") {
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
          this.run(root, [
            "-c",
            "merge.autostash=false",
            "merge",
            "--no-ff",
            "--no-commit",
            "--no-autostash",
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
        progress.integration = {
          commitSha: journal.ticketHead,
          mergeSha,
          postMerge: { status: "pending", mergeSha },
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

  private readJournal(
    path: string,
    feature: FeaturePaths,
    progress: TicketProgress,
    ticketHead: string,
  ): MergeJournal {
    const entry = lstatSync(path);
    if (!entry.isFile() || entry.isSymbolicLink())
      throw new Error(`Integration journal is unsafe: ${path}.`);
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    const accepted = progress.acceptedEvidence!;
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
