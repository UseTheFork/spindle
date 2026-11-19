import { Service } from "@spindle/Foundation/Service";
import { GitService } from "@spindle/Git/Services/GitService";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { SddReviewService } from "@spindle/SubagentDrivenDevelopment/Services/SddReviewService";

export class DeliveryService extends Service {
  public async createTicket(reference: string, writeScope: string[]) {
    const plan = await this.plan(reference);
    if (!plan.needsDelivery) {
      throw new Error("The feature already includes the original branch tip. Run sdd finish.");
    }
    return (await this.app.make(FeatureWorkspaceService)).createDeliveryTicket(
      reference,
      {
        originalBranch: plan.originalBranch,
        featureBranch: plan.featureBranch,
        featureCommit: plan.featureCommit,
        originalCommit: plan.originalCommit,
        requiredWriteScope: plan.requiredWriteScope,
      },
      { writeScope },
    );
  }

  public async plan(reference: string) {
    this.assertApplicationBooted();
    const workspace = await this.app.make(FeatureWorkspaceService);
    const feature = await workspace.load(reference);
    if (
      !feature.originalBranch ||
      !feature.featureBranch ||
      !feature.featureWorktree ||
      feature.completed
    ) {
      throw new Error(`Feature '${feature.name}' is not active.`);
    }
    if (!feature.tickets.length || feature.tickets.some(({ merged }) => !merged)) {
      throw new Error("Integrate all feature tickets before creating a delivery ticket.");
    }
    if (
      feature.findings.some((finding) =>
        finding.type === "review"
          ? finding.decision.status === "open"
          : finding.decision === "open",
      )
    ) {
      throw new Error("Resolve all findings before creating a delivery ticket.");
    }
    const reviews = await this.app.make(SddReviewService);
    if (!reviews.hasPassedFeatureReview(feature)) {
      throw new Error("A feature review round must pass before creating a delivery ticket.");
    }
    const reviewStatus = await reviews.featureStatus(feature);
    if ("blocker" in reviewStatus) throw new Error(reviewStatus.blocker);
    if (reviewStatus.state !== "Accepted") {
      throw new Error("The current feature revision must pass feature review before delivery.");
    }

    const git = await this.app.make(GitService);
    await git.requireWorktreeBranch(feature.featureWorktree, feature.featureBranch);
    const featureHead = this.git(git, feature.featureWorktree, ["rev-parse", "--verify", "HEAD"]);
    const featureBranchHead = this.git(git, this.app.workspaceRoot, [
      "rev-parse",
      "--verify",
      `refs/heads/${feature.featureBranch}`,
    ]);
    const originalHead = this.git(git, this.app.workspaceRoot, [
      "rev-parse",
      "--verify",
      `refs/heads/${feature.originalBranch}`,
    ]);
    if (featureHead !== featureBranchHead) {
      throw new Error("The feature worktree and branch do not point to the same commit.");
    }
    const needsDelivery = !this.isAncestor(git, this.app.workspaceRoot, originalHead, featureHead);
    if (!needsDelivery) {
      return {
        originalBranch: feature.originalBranch,
        featureBranch: feature.featureBranch,
        featureCommit: featureHead,
        originalCommit: originalHead,
        requiredWriteScope: [],
        needsDelivery: false,
      };
    }
    for (const [label, path] of [
      ["feature", feature.featureWorktree],
      ["original", this.app.workspaceRoot],
    ]) {
      const changed = git
        .changedPaths(path)
        .filter(
          (changedPath) =>
            label !== "original" ||
            (changedPath !== `.spindle/features/${feature.name}` &&
              !changedPath.startsWith(`.spindle/features/${feature.name}/`)),
        );
      if (changed.length > 0) {
        throw new Error(`${label} worktree has uncommitted paths: ${JSON.stringify(changed)}`);
      }
    }
    const mergeBase = this.git(git, this.app.workspaceRoot, [
      "merge-base",
      featureHead,
      originalHead,
    ]);
    const requiredWriteScope = this.git(git, this.app.workspaceRoot, [
      "diff",
      "--no-renames",
      "--name-only",
      "-z",
      mergeBase,
      originalHead,
    ])
      .split("\0")
      .filter(Boolean);
    return {
      originalBranch: feature.originalBranch,
      featureBranch: feature.featureBranch,
      featureCommit: featureHead,
      originalCommit: originalHead,
      requiredWriteScope,
      needsDelivery: true,
    };
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
