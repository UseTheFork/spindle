import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { Service } from "@spindle/Foundation/Service";
import { GitService } from "@spindle/Git/Services/GitService";
import type { Feature } from "@spindle/SubagentDrivenDevelopment/Models/Feature";
import type { FeatureLedger } from "@spindle/SubagentDrivenDevelopment/Models/FeatureLedger";
import type { MergeOperation } from "@spindle/SubagentDrivenDevelopment/Models/MergeOperation";
import type { Ticket } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { SddReviewService } from "@spindle/SubagentDrivenDevelopment/Services/SddReviewService";
import { SddSequence } from "@spindle/SubagentDrivenDevelopment/Support/SddSequence";

export class MergeOperationService extends Service {
  public async integrate(reference: string, ticketId: string) {
    return this.start(reference, { type: "ticket-integration", ticketId });
  }

  public async finish(reference: string) {
    return this.start(reference, { type: "feature-finish" });
  }

  public async assignment(reference: string, operationId: string) {
    this.assertApplicationBooted();
    if (!isAbsolute(reference)) throw new Error("Assignment requires an absolute --feature path.");
    const feature = await (await this.app.make(FeatureWorkspaceService)).load(reference);
    const operation = feature.pendingMergeOperation;
    if (!operation || operation.id !== operationId) {
      throw new Error(`Unknown pending merge operation '${operationId}'.`);
    }
    this.assertOperationMatches(feature, feature.tickets, operation);
    return this.assignmentDetails(feature, operation);
  }

  public async record(reference: string, operationId: string) {
    this.assertApplicationBooted();
    const workspace = await this.app.make(FeatureWorkspaceService);
    const git = await this.app.make(GitService);
    return workspace.withLedgerTransaction(
      reference,
      async (feature, ledger, publish) => {
        const operation = ledger.pendingMergeOperation;
        if (!operation || operation.id !== operationId) {
          throw new Error(`Unknown pending merge operation '${operationId}'.`);
        }
        this.assertOperationMatches(feature, ledger.tickets, operation);
        if (operation.phase === "merge") {
          await this.verifyMerge(feature, operation, git);
          operation.phase = "cleanup";
          await publish(ledger);
          return {
            feature: feature.name,
            operationId,
            phase: operation.phase,
            next: "Remove the source worktree and branch, then record the operation again.",
          };
        }

        await this.verifyCleanup(feature, operation, git);
        if (operation.type === "ticket-integration") {
          const ticket = ledger.tickets.find(({ id }) => id === operation.ticketId);
          if (!ticket) throw new Error(`Unknown ticket '${operation.ticketId}'.`);
          ticket.merged = true;
          delete ticket.branch;
          delete ticket.worktree;
        } else {
          ledger.completed = true;
        }
        delete ledger.pendingMergeOperation;
        await publish(ledger);
        return {
          feature: feature.name,
          operationId,
          phase: "completed",
          ...(operation.type === "ticket-integration"
            ? { ticket: operation.ticketId, state: "Merged" as const }
            : { completed: true }),
        };
      },
      { resumeMergeOperation: true },
    );
  }

  private async start(
    reference: string,
    request: { type: "ticket-integration"; ticketId: string } | { type: "feature-finish" },
  ) {
    this.assertApplicationBooted();
    const workspace = await this.app.make(FeatureWorkspaceService);
    const git = await this.app.make(GitService);
    return workspace.withLedgerTransaction(
      reference,
      async (feature, ledger, publish) => {
        if (ledger.pendingStart) throw new Error("Resume the pending start before merging.");
        const pending = ledger.pendingMergeOperation;
        if (pending) {
          if (
            pending.type !== request.type ||
            (pending.type === "ticket-integration" &&
              request.type === "ticket-integration" &&
              pending.ticketId !== request.ticketId)
          ) {
            throw new Error("Another merge operation is pending. Run sdd next to resume it.");
          }
          this.assertOperationMatches(feature, ledger.tickets, pending);
          return this.operationStarted(feature, pending);
        }
        const number = SddSequence.next([ledger.lastMergeOperationNumber ?? "0"]);
        const id = SddSequence.format("M", number);
        const operation =
          request.type === "ticket-integration"
            ? await this.prepareIntegration(feature, ledger, request.ticketId, git, id)
            : await this.prepareFinish(feature, ledger, git, id);
        ledger.lastMergeOperationNumber = String(number);
        ledger.pendingMergeOperation = operation;
        await publish(ledger);
        return this.operationStarted(feature, operation);
      },
      { resumeMergeOperation: true },
    );
  }

  private async prepareIntegration(
    feature: Feature,
    ledger: FeatureLedger,
    ticketId: string,
    git: GitService,
    id: string,
  ): Promise<MergeOperation> {
    if (!feature.featureBranch || !feature.featureWorktree) {
      throw new Error(`Feature '${feature.name}' has no active worktree.`);
    }
    const ticket = ledger.tickets.find(({ id }) => id === ticketId);
    if (!ticket) throw new Error(`Unknown ticket '${ticketId}'.`);
    if (ticket.merged) throw new Error(`Ticket '${ticketId}' is already integrated.`);
    if (!ticket.branch || !ticket.worktree || ticket.tasks.length === 0) {
      throw new Error(`Ticket '${ticket.id}' has no active worktree or completed tasks.`);
    }
    const status = await (await this.app.make(SddReviewService)).status(feature, ticket);
    if ("blocker" in status || status.state !== "Accepted") {
      throw new Error(
        `Ticket '${ticket.id}' is not accepted: ${"blocker" in status ? status.blocker : status.state}.`,
      );
    }
    if (feature.featureBranch === ticket.branch) {
      throw new Error("The ticket and feature must use different branches.");
    }
    await git.requireWorktreeBranch(feature.featureWorktree, feature.featureBranch);
    await git.requireWorktreeBranch(ticket.worktree, ticket.branch);
    this.assertClean(git, feature.featureWorktree, "feature");
    this.assertClean(git, ticket.worktree, "ticket");
    this.assertNoGitOperation(git, feature.featureWorktree);
    this.assertNoGitOperation(git, ticket.worktree);
    this.requireBranch(git, feature.featureBranch);
    this.requireBranch(git, ticket.branch);
    return {
      id,
      type: "ticket-integration",
      ticketId,
      phase: "merge",
      sourceBranch: ticket.branch,
      sourceWorktree: ticket.worktree,
      targetBranch: feature.featureBranch,
      targetWorktree: feature.featureWorktree,
    };
  }

  private async prepareFinish(
    feature: Feature,
    ledger: FeatureLedger,
    git: GitService,
    id: string,
  ): Promise<MergeOperation> {
    if (
      !feature.originalBranch ||
      !feature.featureBranch ||
      !feature.featureWorktree ||
      feature.completed
    ) {
      throw new Error(`Feature '${feature.name}' is not active.`);
    }
    if (!ledger.tickets.length || ledger.tickets.some(({ merged }) => !merged)) {
      throw new Error("Integrate all feature tickets before finishing.");
    }
    if (
      feature.findings.some(
        (finding) => finding.type === "review" && finding.decision.status === "open",
      )
    ) {
      throw new Error("Resolve all findings before finishing.");
    }
    const reviews = await this.app.make(SddReviewService);
    if (!reviews.hasPassedFeatureReview(feature)) {
      throw new Error("At least one feature review round must pass before finishing.");
    }
    const status = await reviews.featureStatus(feature);
    if ("blocker" in status) throw new Error(status.blocker);
    if (status.state !== "Accepted") {
      throw new Error("The current feature revision must pass feature review before finishing.");
    }
    if (feature.originalBranch === feature.featureBranch) {
      throw new Error("The feature and original checkout must use different branches.");
    }
    this.requireBranch(git, feature.originalBranch);
    this.requireBranch(git, feature.featureBranch);
    await git.requireWorktreeBranch(feature.featureWorktree, feature.featureBranch);
    await git.requireWorktreeBranch(this.app.workspaceRoot, feature.originalBranch);
    this.requireClean(
      this.app.workspaceRoot,
      git,
      "original",
      join(".spindle", "features", feature.name),
    );
    this.requireClean(feature.featureWorktree, git, "feature");
    if (
      !this.isAncestor(
        git,
        this.app.workspaceRoot,
        `refs/heads/${feature.originalBranch}`,
        `refs/heads/${feature.featureBranch}`,
      )
    ) {
      throw new Error(
        "The original branch tip is not included in the feature. Create a delivery ticket first.",
      );
    }
    return {
      id,
      type: "feature-finish",
      phase: "merge",
      sourceBranch: feature.featureBranch,
      sourceWorktree: feature.featureWorktree,
      targetBranch: feature.originalBranch,
      targetWorktree: this.app.workspaceRoot,
    };
  }

  private operationStarted(feature: Feature, operation: MergeOperation) {
    const featurePath = resolve(this.app.workspaceRoot, ".spindle", "features", feature.name);
    return {
      feature: feature.name,
      operationId: operation.id,
      type: operation.type,
      phase: operation.phase,
      assignmentCommand: `spindle sdd assignment --feature ${this.shellArgument(featurePath)} --merge ${operation.id} --json`,
    };
  }

  private assignmentDetails(feature: Feature, operation: MergeOperation) {
    const recordCommand = `spindle sdd merge record --feature ${this.shellArgument(resolve(this.app.workspaceRoot, ".spindle", "features", feature.name))} --merge ${operation.id}`;
    const removeWorktree = `git -C ${this.shellArgument(operation.targetWorktree)} worktree remove -- ${this.shellArgument(operation.sourceWorktree)}`;
    const deleteBranch = `git -C ${this.shellArgument(operation.targetWorktree)} branch -d -- ${this.shellArgument(operation.sourceBranch)}`;
    const action =
      operation.type === "ticket-integration"
        ? `In the target worktree, merge \`${operation.sourceBranch}\` with \`git merge --no-ff ${this.shellArgument(operation.sourceBranch)}\`. Resolve conflicts within this assignment and commit the merge.`
        : `In the target worktree, merge \`${operation.sourceBranch}\` with \`git merge --ff-only ${this.shellArgument(operation.sourceBranch)}\`.`;
    const cleanup = `Remove the source worktree with \`${removeWorktree}\`, delete the source branch with \`${deleteBranch}\`, then run \`${recordCommand}\` again.`;
    const instructions =
      operation.phase === "merge"
        ? [action, `Run \`${recordCommand}\` before cleanup. If it records the merge, ${cleanup}`]
        : [`The merge has been recorded. ${cleanup}`];
    return {
      role: "merge-agent",
      feature: feature.name,
      operationId: operation.id,
      type: operation.type,
      phase: operation.phase,
      source: { branch: operation.sourceBranch, worktree: operation.sourceWorktree },
      target: { branch: operation.targetBranch, worktree: operation.targetWorktree },
      instructions,
    };
  }

  private assertOperationMatches(
    feature: Feature,
    tickets: readonly Pick<Ticket, "id" | "branch" | "worktree" | "merged">[],
    operation: MergeOperation,
  ): void {
    if (operation.type === "ticket-integration") {
      const ticket = tickets.find(({ id }) => id === operation.ticketId);
      if (
        !ticket ||
        ticket.merged ||
        ticket.branch !== operation.sourceBranch ||
        ticket.worktree !== operation.sourceWorktree ||
        feature.featureBranch !== operation.targetBranch ||
        feature.featureWorktree !== operation.targetWorktree
      ) {
        throw new Error("The pending merge operation no longer matches the feature and ticket.");
      }
    } else if (
      feature.originalBranch !== operation.targetBranch ||
      feature.featureBranch !== operation.sourceBranch ||
      feature.featureWorktree !== operation.sourceWorktree ||
      this.app.workspaceRoot !== operation.targetWorktree
    ) {
      throw new Error("The pending merge operation no longer matches the feature workspace.");
    }
  }

  private async verifyMerge(
    feature: Feature,
    operation: MergeOperation,
    git: GitService,
  ): Promise<void> {
    this.requireBranch(git, operation.sourceBranch);
    this.requireBranch(git, operation.targetBranch);
    await git.requireWorktreeBranch(operation.sourceWorktree, operation.sourceBranch);
    await git.requireWorktreeBranch(operation.targetWorktree, operation.targetBranch);
    this.assertClean(git, operation.sourceWorktree, "source");
    this.assertTargetClean(feature, operation, git);
    this.assertNoGitOperation(git, operation.sourceWorktree);
    this.assertNoGitOperation(git, operation.targetWorktree);
    if (
      !this.isAncestor(
        git,
        operation.targetWorktree,
        `refs/heads/${operation.sourceBranch}`,
        `refs/heads/${operation.targetBranch}`,
      )
    ) {
      throw new Error(
        `Source branch '${operation.sourceBranch}' is not included in target branch '${operation.targetBranch}'.`,
      );
    }
    if (operation.type === "feature-finish") {
      await git.requireWorktreeBranch(this.app.workspaceRoot, operation.targetBranch);
      if (feature.originalBranch !== operation.targetBranch) {
        throw new Error("The original checkout no longer matches the pending finish.");
      }
    }
  }

  private async verifyCleanup(
    feature: Feature,
    operation: MergeOperation,
    git: GitService,
  ): Promise<void> {
    this.requireBranch(git, operation.targetBranch);
    await git.requireWorktreeBranch(operation.targetWorktree, operation.targetBranch);
    this.assertTargetClean(feature, operation, git);
    this.assertNoGitOperation(git, operation.targetWorktree);
    if (existsSync(operation.sourceWorktree)) {
      throw new Error(`Source worktree '${operation.sourceWorktree}' still exists.`);
    }
    if (this.branchExists(git, operation.targetWorktree, operation.sourceBranch)) {
      throw new Error(`Source branch '${operation.sourceBranch}' still exists.`);
    }
    if (operation.type === "feature-finish" && feature.originalBranch !== operation.targetBranch) {
      throw new Error("The original checkout no longer matches the pending finish.");
    }
  }

  private assertClean(git: GitService, worktree: string, name: string): void {
    const paths = git.changedPaths(worktree);
    if (paths.length > 0) {
      throw new Error(`The ${name} worktree has outstanding changes: ${JSON.stringify(paths)}.`);
    }
  }

  private assertTargetClean(feature: Feature, operation: MergeOperation, git: GitService): void {
    if (operation.type === "feature-finish") {
      this.requireClean(
        operation.targetWorktree,
        git,
        "target",
        join(".spindle", "features", feature.name),
      );
    } else {
      this.assertClean(git, operation.targetWorktree, "target");
    }
  }

  private requireClean(path: string, git: GitService, label: string, ignoredPath?: string): void {
    const changed = git
      .changedPaths(path)
      .filter(
        (changedPath) =>
          !ignoredPath ||
          (changedPath !== ignoredPath && !changedPath.startsWith(`${ignoredPath}/`)),
      );
    if (changed.length > 0) {
      throw new Error(`${label} worktree has uncommitted paths: ${JSON.stringify(changed)}`);
    }
  }

  private assertNoGitOperation(git: GitService, worktree: string): void {
    const paths = git.gitPaths(worktree, [
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
      "rebase-apply",
      "rebase-merge",
      "sequencer",
    ]);
    if (paths.some((path) => existsSync(resolve(worktree, path)))) {
      throw new Error("Finish the Git operation in the worktree before recording the merge.");
    }
  }

  private requireBranch(git: GitService, branch: string): void {
    this.git(git, this.app.workspaceRoot, ["check-ref-format", "--branch", branch]);
  }

  private branchExists(git: GitService, cwd: string, branch: string): boolean {
    const result = git.run(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status === 0) return true;
    if (result.status === 1) return false;
    throw new Error(`git show-ref failed: ${result.stderr.trim()}`);
  }

  private isAncestor(git: GitService, cwd: string, ancestor: string, descendant: string): boolean {
    const result = git.run(["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status === 0) return true;
    if (result.status === 1) return false;
    throw new Error(`git merge-base failed: ${result.stderr.trim()}`);
  }

  private git(git: GitService, cwd: string, args: string[]): string {
    const result = git.run(args, { cwd, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    return result.stdout.replace(/\r?\n$/, "");
  }

  private shellArgument(value: string): string {
    return /^[a-zA-Z0-9_./-]+$/.test(value) && value === value.trim()
      ? value
      : `'${value.replaceAll("'", "'\\''")}'`;
  }
}
