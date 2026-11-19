import { existsSync } from "node:fs";
import { join } from "node:path";

import { Service } from "@spindle/Foundation/Service";
import { GitService } from "@spindle/Git/Services/GitService";
import type { Feature } from "@spindle/SubagentDrivenDevelopment/Models/Feature";
import type { FinishJournal } from "@spindle/SubagentDrivenDevelopment/Models/FinishJournal";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { SddReviewService } from "@spindle/SubagentDrivenDevelopment/Services/SddReviewService";

export class FeatureFinishService extends Service {
  public async finish(reference: string) {
    this.assertApplicationBooted();
    const workspace = await this.app.make(FeatureWorkspaceService);
    const git = await this.app.make(GitService);
    return workspace.withLedgerTransaction(
      reference,
      async (feature, ledger, publish) => {
        const journal = ledger.pendingFinish ?? (await this.prepare(feature, git));
        this.validateJournal(feature, journal);
        if (!ledger.pendingFinish) {
          ledger.pendingFinish = journal;
          await publish(ledger);
        }
        await this.completeFastForward(journal, git, async () => {
          delete ledger.pendingFinish;
          await publish(ledger);
        });
        if (journal.phase === "prepared") {
          journal.phase = "fast-forwarded";
          await publish(ledger);
        }
        await this.cleanup(journal, git);
        delete ledger.pendingFinish;
        ledger.completed = true;
        await publish(ledger);
        return {
          feature: feature.name,
          originalBranch: journal.originalBranch,
          featureCommit: journal.featureCommit,
          completed: true,
        };
      },
      { resumeFinish: true },
    );
  }

  private async prepare(feature: Feature, git: GitService): Promise<FinishJournal> {
    if (
      !feature.originalBranch ||
      !feature.featureBranch ||
      !feature.featureWorktree ||
      feature.completed
    ) {
      throw new Error(`Feature '${feature.name}' is not active.`);
    }
    if (!feature.tickets.length || feature.tickets.some(({ merged }) => !merged)) {
      throw new Error("Integrate all feature tickets before finishing.");
    }
    if (
      feature.findings.some((finding) =>
        finding.type === "review"
          ? finding.decision.status === "open"
          : finding.decision === "open",
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
    this.requireBranch(git, feature.originalBranch);
    this.requireBranch(git, feature.featureBranch);
    await git.requireWorktreeBranch(feature.featureWorktree, feature.featureBranch);
    this.requireOriginalCheckout(feature.originalBranch, git);
    const featureWorkspace = join(".spindle", "features", feature.name);
    this.requireClean(this.app.workspaceRoot, git, "original", featureWorkspace);
    this.requireClean(feature.featureWorktree, git, "feature");

    const originalCommit = this.git(git, this.app.workspaceRoot, [
      "rev-parse",
      "--verify",
      `refs/heads/${feature.originalBranch}`,
    ]);
    const featureCommit = this.git(git, feature.featureWorktree, ["rev-parse", "--verify", "HEAD"]);
    if (
      this.git(git, this.app.workspaceRoot, [
        "rev-parse",
        "--verify",
        `refs/heads/${feature.featureBranch}`,
      ]) !== featureCommit
    ) {
      throw new Error("The feature branch and worktree do not point to the same commit.");
    }
    if (!this.isAncestor(git, this.app.workspaceRoot, originalCommit, featureCommit)) {
      throw new Error(
        "The original branch tip is not included in the feature. Create a delivery ticket first.",
      );
    }
    return {
      originalBranch: feature.originalBranch,
      featureBranch: feature.featureBranch,
      featureWorktree: feature.featureWorktree,
      featureWorkspace,
      originalCommit,
      featureCommit,
      phase: "prepared",
    };
  }

  private async completeFastForward(
    journal: FinishJournal,
    git: GitService,
    discardStaleJournal: () => Promise<void>,
  ): Promise<void> {
    this.requireOriginalCheckout(journal.originalBranch, git);
    this.requireClean(this.app.workspaceRoot, git, "original", journal.featureWorkspace);
    const current = this.git(git, this.app.workspaceRoot, [
      "rev-parse",
      "--verify",
      `refs/heads/${journal.originalBranch}`,
    ]);
    if (journal.phase === "prepared") {
      await this.requireFeatureCommit(journal, git, true);
      if (current === journal.originalCommit) {
        this.git(git, this.app.workspaceRoot, ["merge", "--ff-only", journal.featureCommit]);
      } else if (!this.isAncestor(git, this.app.workspaceRoot, journal.featureCommit, current)) {
        await discardStaleJournal();
        throw new Error(
          "The original branch changed before finish completed. Repeat delivery against its latest tip.",
        );
      }
    } else if (!this.isAncestor(git, this.app.workspaceRoot, journal.featureCommit, current)) {
      throw new Error("The original branch no longer contains the finished feature commit.");
    }
  }

  private async cleanup(journal: FinishJournal, git: GitService): Promise<void> {
    this.requireOriginalCheckout(journal.originalBranch, git);
    const originalHead = this.git(git, this.app.workspaceRoot, [
      "rev-parse",
      "--verify",
      `refs/heads/${journal.originalBranch}`,
    ]);
    if (!this.isAncestor(git, this.app.workspaceRoot, journal.featureCommit, originalHead)) {
      throw new Error("Cannot clean up before confirming the feature commit is merged.");
    }
    await this.requireFeatureCommit(journal, git, false);
    if (existsSync(journal.featureWorktree)) {
      await git.requireWorktreeBranch(journal.featureWorktree, journal.featureBranch);
      this.requireClean(journal.featureWorktree, git, "feature");
      this.git(git, this.app.workspaceRoot, ["worktree", "remove", "--", journal.featureWorktree]);
    }
    const branch = git.run(
      ["show-ref", "--verify", "--quiet", `refs/heads/${journal.featureBranch}`],
      { cwd: this.app.workspaceRoot, encoding: "utf8" },
    );
    if (branch.error) throw branch.error;
    if (branch.status === 0) {
      this.git(git, this.app.workspaceRoot, ["branch", "-d", "--", journal.featureBranch]);
    } else if (branch.status !== 1) {
      throw new Error(`git show-ref failed: ${branch.stderr.trim()}`);
    }
  }

  private validateJournal(feature: Feature, journal: FinishJournal): void {
    if (
      journal.originalBranch !== feature.originalBranch ||
      journal.featureBranch !== feature.featureBranch ||
      journal.featureWorktree !== feature.featureWorktree ||
      journal.featureWorkspace !== join(".spindle", "features", feature.name)
    ) {
      throw new Error("The pending finish journal does not match the feature workspace.");
    }
  }

  private async requireFeatureCommit(
    journal: FinishJournal,
    git: GitService,
    requireWorktree: boolean,
  ): Promise<void> {
    const branch = git.run(
      ["show-ref", "--verify", "--quiet", `refs/heads/${journal.featureBranch}`],
      { cwd: this.app.workspaceRoot, encoding: "utf8" },
    );
    if (branch.error) throw branch.error;
    if (branch.status === 1) {
      if (requireWorktree || existsSync(journal.featureWorktree)) {
        throw new Error("The feature branch is missing before finish cleanup is complete.");
      }
      return;
    }
    if (branch.status !== 0) throw new Error(`git show-ref failed: ${branch.stderr.trim()}`);
    const head = this.git(git, this.app.workspaceRoot, [
      "rev-parse",
      "--verify",
      `refs/heads/${journal.featureBranch}`,
    ]);
    if (head !== journal.featureCommit) {
      throw new Error("The feature branch moved after the finish journal was prepared.");
    }
    if (existsSync(journal.featureWorktree)) {
      await git.requireWorktreeBranch(journal.featureWorktree, journal.featureBranch);
      if (
        this.git(git, journal.featureWorktree, ["rev-parse", "--verify", "HEAD"]) !==
        journal.featureCommit
      ) {
        throw new Error("The feature worktree moved after the finish journal was prepared.");
      }
    } else if (requireWorktree) {
      throw new Error("The feature worktree is missing before finish cleanup is complete.");
    }
  }

  private requireBranch(git: GitService, branch: string): void {
    this.git(git, this.app.workspaceRoot, ["check-ref-format", "--branch", branch]);
  }

  private requireOriginalCheckout(branch: string, git: GitService): void {
    const head = this.git(git, this.app.workspaceRoot, ["symbolic-ref", "--short", "HEAD"]);
    if (head !== branch) throw new Error(`The original checkout must be on branch '${branch}'.`);
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
}
