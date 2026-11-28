import { Service } from "@spindle/Foundation/Service";
import { GitService } from "@spindle/Git/Services/GitService";
import type { Feature } from "@spindle/SubagentDrivenDevelopment/Models/Feature";
import type { Ticket } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import { SddReviewService } from "@spindle/SubagentDrivenDevelopment/Services/SddReviewService";

export type DocumentationStatus = {
  state: "Missing" | "InProgress" | "Current" | "Stale";
  ticket?: string;
  featureCommit?: string;
  coveredCommit?: string;
};

export class DocumentationService extends Service {
  public static readonly agent = "sdd-documentation-agent";

  public async status(feature: Feature): Promise<DocumentationStatus> {
    const ticket = [...feature.tickets]
      .reverse()
      .find(({ documentation }) => documentation !== undefined);
    const git = await this.app.make(GitService);
    const featureCommit = this.featureCommit(git, feature);
    if (!ticket) return { state: "Missing", featureCommit };
    if (!ticket.merged) return { state: "InProgress", ticket: ticket.id, featureCommit };
    const parents = this.git(git, ["rev-list", "--parents", "-n", "1", featureCommit]).split(/\s+/);
    const current =
      ticket.tasks.length > 0 &&
      ticket.tasks.every(
        ({ id, state }) => state === "Done" && ticket.committedTaskIds?.includes(id),
      ) &&
      parents.length === 3 &&
      parents[1] === ticket.documentation?.baseCommit &&
      parents[2] === ticket.workRoundCommits.at(-1);
    return {
      state: current ? "Current" : "Stale",
      ticket: ticket.id,
      featureCommit,
      ...(current ? { coveredCommit: featureCommit } : {}),
    };
  }

  public async requireCurrent(feature: Feature): Promise<void> {
    if ((await this.status(feature)).state !== "Current") {
      throw new Error(
        "Complete the final documentation ticket for the current feature commit. Run sdd next for the required work.",
      );
    }
  }

  public async creationBlocker(feature: Feature): Promise<string | undefined> {
    if (feature.completed || !feature.featureBranch || !feature.featureWorktree) {
      return "Start an active feature before creating its documentation ticket.";
    }
    if (feature.pendingStart || feature.pendingTicketCommit || feature.pendingMergeOperation) {
      return "Resume the pending workflow operation before creating documentation work.";
    }
    if (!feature.tickets.length || feature.tickets.some(({ merged }) => !merged)) {
      return "Integrate all existing tickets before creating the final documentation ticket.";
    }
    if ((await this.status(feature)).state === "Current") {
      return "Documentation already covers the current feature commit.";
    }
    const reviewStatus = await (await this.app.make(SddReviewService)).featureStatus(feature);
    if ("blocker" in reviewStatus) return reviewStatus.blocker;
    if (
      feature.reviewRounds.some(
        ({ target, codeRevision, reviews }) =>
          target.type === "feature" &&
          codeRevision === reviewStatus.codeRevision &&
          reviews.some(({ result }) => result === undefined),
      )
    ) {
      return "Complete the current feature reviews before creating documentation work.";
    }
    if (
      feature.findings.some(
        ({ decision, fixWork }) =>
          decision.status === "open" &&
          (!fixWork ||
            (fixWork.type === "ticket" &&
              !feature.tickets.find(({ id }) => id === fixWork.ticketId)?.merged)),
      )
    ) {
      return "Resolve or implement open findings before creating documentation work.";
    }
    return undefined;
  }

  public async assertCanCreate(feature: Feature): Promise<void> {
    const blocker = await this.creationBlocker(feature);
    if (blocker) throw new Error(blocker);
  }

  public async assignment(feature: Feature, ticket: Ticket) {
    const featureCommit = ticket.documentation?.baseCommit;
    if (!featureCommit || !feature.originalBranch) {
      throw new Error(`Documentation ticket '${ticket.id}' has no recorded feature base.`);
    }
    const git = await this.app.make(GitService);
    const comparisonCommit = this.git(git, [
      "merge-base",
      `refs/heads/${feature.originalBranch}`,
      featureCommit,
    ]);
    const changedFiles = this.git(git, [
      "diff",
      "--no-renames",
      "--name-only",
      "-z",
      comparisonCommit,
      featureCommit,
    ])
      .split("\0")
      .filter(Boolean);
    const domainContext = this.git(git, ["ls-tree", "-r", "--name-only", "-z", featureCommit])
      .split("\0")
      .filter(
        (path) =>
          path === "GLOSSARY-MAP.md" ||
          path === "GLOSSARY.md" ||
          path.endsWith("/GLOSSARY.md") ||
          path === "docs/agents/domain.md" ||
          /(^|\/)docs\/adr\/[^/]+\.md$/.test(path),
      );
    return {
      agent: DocumentationService.agent,
      specification: feature.specification,
      ...(feature.design === undefined ? {} : { design: feature.design }),
      documentation: {
        requiredSkill: "public-ref-domain-modeling",
        featureCommit,
        comparisonCommit,
        changedFiles,
        domainContext,
      },
    };
  }

  public static creationCommand(feature: string): string {
    return (
      `spindle sdd ticket create --feature ${feature} --documentation` +
      " --title 'Finalize feature documentation'" +
      " --requirements 'Check the combined feature and update its domain documentation with the public-ref-domain-modeling skill.'" +
      " --acceptance-criteria 'Domain documentation matches the combined feature. Implement required updates or explain why no changes are needed.'"
    );
  }

  private featureCommit(git: GitService, feature: Feature): string {
    if (!feature.featureBranch) throw new Error(`Feature '${feature.name}' has no feature branch.`);
    return this.git(git, ["rev-parse", "--verify", `refs/heads/${feature.featureBranch}^{commit}`]);
  }

  private git(git: GitService, args: string[]): string {
    const result = git.run(args, { cwd: this.app.workspaceRoot, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    }
    return result.stdout.trimEnd();
  }
}
