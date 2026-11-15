import { accessSync, constants, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitService } from "@/Git/Services/GitService";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import type { TicketSelection } from "@/SubagentDrivenDevelopment/Models/Options";
import type {
  FeaturePaths,
  FeatureLedger,
  TicketProgress,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import { FileSystem } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { InputValidation } from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { ChecksService } from "@/SubagentDrivenDevelopment/Services/ChecksService";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class TicketSyncService extends Service {
  public constructor(
    app: Application,
    private readonly git: GitService,
    private readonly gitEvidence: GitEvidence,
    private readonly ledgerRepository: LedgerRepository,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly workflowPolicy: WorkflowPolicy,
    private readonly checksService: ChecksService,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public sync(options: TicketSelection): {
    ticket: string;
    mode: "post-merge" | "review-baseline";
    workspace: string;
    baseSha: string;
    headSha: string;
    mergeCommit?: string;
    idempotent?: boolean;
  } {
    InputValidation.validateTicketId(options.ticket);
    InputValidation.validateAuthor(options.author);
    this.assertGitEnvironment();
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    const root = this.assertCanonicalFeature(feature);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const progress = this.workflowPolicy.requireProgress(ledger, options.ticket);
      WorkflowPolicy.assertTicketOwner(
        progress.owner,
        options.author,
        feature.feature,
        options.ticket,
      );
      if (
        progress.execution === "integrated" &&
        progress.integration?.postMerge?.status === "pending"
      ) {
        return this.syncPostMerge(feature, ledger, progress, options.author);
      }
      if (progress.execution === "reviewing" && progress.assignment?.status === "submitted") {
        return this.syncReviewBaseline(feature, ledger, progress, options.author, root);
      }
      throw new Error(
        "sync requires a submitted ticket in review or a ticket with pending post-merge checks.",
      );
    });
  }

  private syncPostMerge(
    feature: FeaturePaths,
    ledger: FeatureLedger,
    progress: TicketProgress,
    author: string,
  ) {
    const integration = progress.integration;
    const postMerge = integration?.postMerge;
    const mergeCommit = integration?.mergeSha;
    const checks = postMerge?.checks;
    if (!mergeCommit || postMerge?.status !== "pending" || !checks?.required.length)
      throw new Error("Post-merge synchronization requires a recorded failed check.");
    const identity = this.checksService.postMergeIdentity(feature, ledger, progress);
    if (
      identity.headSha !== mergeCommit ||
      !checks.required.some((requirement) => {
        const latest = [...checks.records]
          .reverse()
          .find((record) => record.command === requirement.command);
        return latest?.result === "failed" && latest.headSha === identity.headSha;
      })
    )
      throw new Error("Post-merge synchronization requires a current failed check.");

    const workspace = this.gitEvidence.ticketWorkspace(progress);
    if (!workspace || !progress.baseSha || !progress.worktree)
      throw new Error("Post-merge synchronization requires an isolated ticket worktree.");
    this.assertClean(workspace);
    this.assertNoOperations(workspace);
    this.assertAncestor(
      workspace,
      progress.baseSha,
      mergeCommit,
      "Ticket baseline is not in the failed merge.",
    );
    this.checksService.assertPrerequisiteBaseline(ledger, progress, mergeCommit);

    const currentHead = this.gitEvidence.headSha(workspace);
    const alreadyRecorded =
      progress.baseSha === mergeCommit &&
      progress.worktree.baseSha === mergeCommit &&
      progress.baselineHistory?.at(-1)?.to === mergeCommit &&
      progress.baselineHistory.at(-1)?.ticketHead === mergeCommit;
    if (currentHead === mergeCommit && alreadyRecorded) {
      return {
        ticket: progress.id,
        mode: "post-merge" as const,
        workspace,
        baseSha: mergeCommit,
        headSha: mergeCommit,
        mergeCommit,
        idempotent: true,
      };
    }

    if (currentHead !== mergeCommit) {
      if (!this.isAncestor(workspace, currentHead, mergeCommit))
        throw new Error(
          "Ticket worktree has diverged from the failed feature merge; preserve it and resolve the divergence manually.",
        );
      this.assertNoHooks(workspace);
      const result = this.git.run(
        [
          "-c",
          "merge.autoStash=false",
          "-c",
          "rerere.enabled=false",
          "-c",
          "core.fsmonitor=false",
          "-c",
          "submodule.recurse=false",
          "merge",
          "--ff-only",
          "--no-overwrite-ignore",
          mergeCommit,
        ],
        {
          cwd: workspace,
          encoding: "utf8",
          env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
        },
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          `Unable to fast-forward the ticket worktree; preserve it and resolve manually: ${result.stderr.trim()}`,
        );
    }

    if (this.gitEvidence.headSha(workspace) !== mergeCommit)
      throw new Error("Ticket worktree moved during synchronization; preserve it and retry.");
    this.assertClean(workspace);
    this.assertNoOperations(workspace);
    const confirmedIdentity = this.checksService.postMergeIdentity(feature, ledger, progress);
    if (confirmedIdentity.headSha !== identity.headSha)
      throw new Error(
        "Feature code changed during ticket synchronization; preserve work and retry.",
      );
    this.appendBaseline(progress, mergeCommit, mergeCommit, author);
    this.gitEvidence.assertTicketCodeCommitted(progress);
    if (this.gitEvidence.headSha(workspace) !== mergeCommit)
      throw new Error("Ticket worktree moved during synchronization; preserve it and retry.");
    this.workspaceTransaction.writeLedger(feature, ledger);
    return {
      ticket: progress.id,
      mode: "post-merge" as const,
      workspace,
      baseSha: mergeCommit,
      headSha: mergeCommit,
      mergeCommit,
    };
  }

  private syncReviewBaseline(
    feature: FeaturePaths,
    ledger: FeatureLedger,
    progress: TicketProgress,
    author: string,
    root: string,
  ) {
    if (!progress.worktree || !progress.baseSha)
      throw new Error("Baseline synchronization requires an isolated ticket worktree.");
    if (!(progress.checks?.required ?? []).some((requirement) => !requirement.removedAt))
      throw new Error("Baseline synchronization requires an existing required ticket check.");
    const workspace = this.gitEvidence.ticketWorkspace(progress);
    if (!workspace) throw new Error("Ticket worktree is missing.");
    this.assertNoOperations(root, workspace);
    this.assertClean(workspace);
    this.assertFeatureCodeClean(feature, ledger);

    const rootHead = this.gitEvidence.headSha(root);
    const baseSha = this.gitEvidence.headBeforeWorkflowRecords(feature, ledger, rootHead);
    const ticketHead = this.gitEvidence.headSha(workspace);
    if (ticketHead === baseSha)
      throw new Error("Ticket must contain a distinct reviewed code commit.");
    if (!this.isAncestor(workspace, baseSha, ticketHead))
      throw new Error("Ticket worktree must be rebased onto the current feature baseline.");
    this.assertAncestor(
      root,
      progress.baseSha,
      baseSha,
      "Feature baseline does not descend from the ticket baseline.",
    );
    this.checksService.assertPrerequisiteBaseline(ledger, progress, baseSha);
    if (
      this.gitEvidence.gitBuffer(
        ["diff", "--name-only", baseSha, ticketHead, "--", ".scratch"],
        workspace,
      ).length
    )
      throw new Error("Rebased ticket commits must not change canonical workflow records.");

    if (progress.baseSha === baseSha) {
      return {
        ticket: progress.id,
        mode: "review-baseline" as const,
        workspace,
        baseSha,
        headSha: ticketHead,
        idempotent: true,
      };
    }

    const attempt =
      progress.assignment?.action === "correct"
        ? progress.correctionAttempts?.find((item) => item.number === progress.assignment?.attempt)
        : undefined;
    if (progress.assignment?.action === "correct" && !attempt)
      throw new Error("Correction attempt is missing.");
    const previousReviews = attempt
      ? (attempt.reviewAssignments ?? [])
      : (progress.reviewAssignments ?? []);
    if (previousReviews.some((assignment) => assignment.status !== "submitted"))
      throw new Error(
        "Pending reviews must finish before synchronization; assignments were preserved.",
      );

    this.appendBaseline(progress, baseSha, ticketHead, author);
    if (previousReviews.length) {
      (progress.reviewHistory ??= []).push(...previousReviews);
      if (attempt) delete attempt.reviewAssignments;
      else delete progress.reviewAssignments;
    }
    if (
      this.gitEvidence.headSha(root) !== rootHead ||
      this.gitEvidence.headSha(workspace) !== ticketHead
    )
      throw new Error("A Git HEAD changed while synchronizing the ticket baseline; retry.");
    this.gitEvidence.assertTicketCodeCommitted(progress);
    if (
      this.gitEvidence.headSha(root) !== rootHead ||
      this.gitEvidence.headSha(workspace) !== ticketHead
    )
      throw new Error("A Git HEAD changed while synchronizing the ticket baseline; retry.");
    this.workspaceTransaction.writeLedger(feature, ledger);
    return {
      ticket: progress.id,
      mode: "review-baseline" as const,
      workspace,
      baseSha,
      headSha: ticketHead,
    };
  }

  private appendBaseline(
    progress: TicketProgress,
    baseSha: string,
    ticketHead: string,
    author: string,
  ): void {
    if (!progress.baseSha || progress.baseSha === baseSha)
      throw new Error("Ticket baseline does not require a synchronization transition.");
    progress.baselineHistory ??= [];
    progress.baselineHistory.push({
      from: progress.baseSha,
      to: baseSha,
      ticketHead,
      at: new Date().toISOString(),
      author: author.trim(),
    });
    progress.baseSha = baseSha;
    progress.worktree!.baseSha = baseSha;
  }

  private assertCanonicalFeature(feature: FeaturePaths): string {
    const root = realpathSync(this.app.workspaceRoot);
    if (
      realpathSync(feature.workspace) !== realpathSync(resolve(root, ".scratch", feature.feature))
    )
      throw new Error("Run sync from the canonical feature worktree.");
    const branch = this.gitEvidence
      .gitBuffer(["symbolic-ref", "--quiet", "--short", "HEAD"], root)
      .toString("utf8")
      .trim();
    if (branch !== `features/${feature.feature}`)
      throw new Error("Run sync from the canonical feature branch.");
    return root;
  }

  private assertFeatureCodeClean(feature: FeaturePaths, ledger: FeatureLedger): void {
    const lock = `.scratch/${feature.feature}/.sdd-tickets.lock`;
    const allowed = this.gitEvidence.workflowDeliveryRecordPaths(feature, ledger);
    const dirty = this.gitEvidence
      .allGitChangePaths()
      .filter((path) => path !== lock && !allowed.has(path));
    if (dirty.length) throw new Error(`Feature code must be clean: ${dirty.join(", ")}.`);
  }

  private assertClean(workspace: string): void {
    const status = this.gitEvidence
      .gitBuffer(
        ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"],
        workspace,
      )
      .toString("utf8");
    if (status)
      throw new Error(`Ticket worktree must be clean; user changes were preserved:\n${status}`);
  }

  private assertNoOperations(...workspaces: string[]): void {
    for (const workspace of workspaces) {
      for (const operation of [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
        "sequencer",
      ]) {
        const gitPath = this.gitEvidence
          .gitBuffer(["rev-parse", "--git-path", operation], workspace)
          .toString("utf8")
          .trim();
        if (FileSystem.lstatIfPresent(resolve(workspace, gitPath)))
          throw new Error(`Resolve Git operation ${operation} before synchronizing.`);
      }
    }
  }

  private assertNoHooks(workspace: string): void {
    for (const hook of ["post-merge", "reference-transaction"]) {
      const configuredPath = this.gitEvidence
        .gitBuffer(["rev-parse", "--git-path", `hooks/${hook}`], workspace)
        .toString("utf8")
        .trim();
      const path = isAbsolute(configuredPath) ? configuredPath : resolve(workspace, configuredPath);
      try {
        accessSync(path, constants.X_OK);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") continue;
        if (code === "EACCES") throw new Error(`Cannot verify Git hook permissions: ${path}.`);
        throw error;
      }
      throw new Error(`Active Git hook requires manual handling before synchronization: ${path}.`);
    }
  }

  private assertAncestor(
    root: string,
    ancestor: string,
    descendant: string,
    message: string,
  ): void {
    if (!this.isAncestor(root, ancestor, descendant)) throw new Error(message);
  }

  private isAncestor(root: string, ancestor: string, descendant: string): boolean {
    const result = this.git.run(["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    if (result.error) throw result.error;
    if (result.status === 0) return true;
    if (result.status === 1) return false;
    throw new Error(`Unable to verify Git ancestry: ${result.stderr.trim()}`);
  }

  private assertGitEnvironment(): void {
    for (const variable of [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_COMMON_DIR",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_NAMESPACE",
    ]) {
      if (process.env[variable])
        throw new Error(`Unset ${variable} before synchronizing a ticket.`);
    }
  }
}
