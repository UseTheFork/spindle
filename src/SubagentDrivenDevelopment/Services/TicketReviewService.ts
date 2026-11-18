import { createHash, randomUUID } from "node:crypto";
import { isAbsolute, join } from "node:path";

import { Service } from "@spindle/Foundation/Service";
import { GitService } from "@spindle/Git/Services/GitService";
import type { Feature } from "@spindle/SubagentDrivenDevelopment/Models/Feature";
import { findingSchema } from "@spindle/SubagentDrivenDevelopment/Models/Finding";
import type { ReviewRound } from "@spindle/SubagentDrivenDevelopment/Models/ReviewRound";
import type { Ticket } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";

type ProposedFinding = {
  title: string;
  severity: string;
  location: string;
  criterion: string;
  evidence: string;
  suggestedFix: string;
};
type ReviewFacts = Pick<Feature, "reviewRounds" | "findings">;

const responseTemplate = [
  "Recommendation: pass | changes-required",
  "Findings: none (for pass), or one or more findings with:",
  "- Title:",
  "  Severity:",
  "  Location:",
  "  Criterion:",
  "  Evidence:",
  "  Suggested fix:",
].join("\n");

export class TicketReviewService extends Service {
  public async start(reference: string, ticketId: string, scope: string, focus?: string) {
    if (!scope.trim() || (focus !== undefined && !focus.trim())) {
      throw new Error("Review scope and optional focus must not be empty.");
    }
    const workspace = await this.app.make(FeatureWorkspaceService);
    return workspace.withLedgerTransaction(reference, async (feature, ledger, publish) => {
      if (feature.pendingStart)
        throw new Error("Resume the pending start before starting reviews.");
      const ticket = this.ticket(feature, ticketId);
      const current = await this.currentRevision(ticket);
      if ("blocker" in current) throw new Error(current.blocker);
      if (this.acceptance(feature, ticket.id, current.revision) === "Accepted") {
        throw new Error(`Ticket '${ticket.id}' is already accepted at this revision.`);
      }
      const review = {
        id: `R-${randomUUID()}`,
        targetWorktree: current.worktree,
        scope,
        focus,
        findingsToVerify: [],
      };
      const round = this.round(feature, ticket.id, current.revision);
      if (round) {
        ledger.reviewRounds[feature.reviewRounds.indexOf(round)].reviews.push(review);
      } else {
        ledger.reviewRounds.push({
          target: { type: "ticket", ticketId },
          codeRevision: current.revision,
          reviews: [review],
        });
      }
      await publish(ledger);
      const path = this.app.workspacePath(join(".spindle", "features", feature.name));
      const quoted = `'${path.replaceAll("'", "'\\''")}'`;
      return {
        review: review.id,
        ticket: ticketId,
        codeRevision: current.revision,
        assignmentCommand: `spindle sdd assignment --feature ${quoted} --review ${review.id} --json`,
      };
    });
  }

  public async assignment(reference: string, reviewId: string) {
    if (!isAbsolute(reference)) throw new Error("Assignment requires an absolute --feature path.");
    const feature = await (await this.app.make(FeatureWorkspaceService)).load(reference);
    const { review, round, ticket } = await this.activeReview(feature, reviewId);
    return {
      role: "reviewer",
      feature: feature.name,
      ticket: ticket.id,
      review: review.id,
      worktree: review.targetWorktree,
      codeRevision: round.codeRevision,
      scope: review.scope,
      focus: review.focus,
      requirements: ticket.requirements,
      acceptanceCriteria: ticket.acceptanceCriteria,
      findingsToVerify: feature.findings.filter(({ id }) => review.findingsToVerify.includes(id)),
      reviewerRules: [
        "You may run tests, builds, and type checks in the target worktree.",
        "Do not change tracked files, commit, or run other SDD commands.",
        "Return the review to the controller; do not write a report file.",
      ],
      responseTemplate,
    };
  }

  public async submit(
    reference: string,
    reviewId: string,
    recommendation: string,
    proposals: ProposedFinding[],
  ) {
    if (
      recommendation === "pass"
        ? proposals.length !== 0
        : recommendation !== "changes-required" || proposals.length === 0
    ) {
      throw new Error(
        "A pass requires no findings; changes-required requires at least one finding.",
      );
    }
    const workspace = await this.app.make(FeatureWorkspaceService);
    return workspace.withLedgerTransaction(reference, async (feature, ledger, publish) => {
      if (feature.pendingStart)
        throw new Error("Resume the pending start before submitting reviews.");
      const { review, round, ticket } = await this.activeReview(feature, reviewId);
      const findings = proposals.map((proposal) =>
        findingSchema.parse({
          ...proposal,
          id: `F-${randomUUID()}`,
          type: "review",
          reviewId,
          decision: { status: "open" },
        }),
      );
      review.result =
        recommendation === "pass"
          ? { recommendation, findingIds: [] }
          : { recommendation: "changes-required", findingIds: findings.map(({ id }) => id) };
      feature.findings.push(...findings);
      await publish({ ...ledger, reviewRounds: feature.reviewRounds, findings: feature.findings });
      return {
        review: reviewId,
        ticket: ticket.id,
        findings: findings.map(({ id }) => id),
        acceptance: this.acceptance(feature, ticket.id, round.codeRevision),
      };
    });
  }

  public async status(feature: Feature, ticket: Ticket) {
    const current = await this.currentRevision(ticket);
    if ("blocker" in current) return { blocker: current.blocker };
    return {
      state: this.acceptance(feature, ticket.id, current.revision),
      codeRevision: current.revision,
      hasRound: this.round(feature, ticket.id, current.revision) !== undefined,
    };
  }

  public async assertOrdinaryTaskAllowed(
    facts: ReviewFacts,
    ticket: Pick<Ticket, "id" | "workRoundCommits">,
  ) {
    const rounds = facts.reviewRounds.filter(
      ({ target }) => target.type === "ticket" && target.ticketId === ticket.id,
    );
    if (rounds.some(({ reviews }) => reviews.some(({ result }) => result === undefined))) {
      throw new Error(`Cannot add a task while ticket '${ticket.id}' is under review.`);
    }
    const commit = ticket.workRoundCommits.at(-1);
    if (!commit || rounds.length === 0) return;
    const git = await this.app.make(GitService);
    const revision = this.codeRevision(git, this.app.workspaceRoot, commit);
    if (this.acceptance(facts, ticket.id, revision) === "Accepted") {
      throw new Error(
        `Cannot add an ordinary task to accepted ticket '${ticket.id}'; use linked fix work.`,
      );
    }
  }

  private ticket(feature: Feature, id: string): Ticket {
    const ticket = feature.tickets.find((item) => item.id === id);
    if (!ticket) throw new Error(`Unknown ticket '${id}'.`);
    return ticket;
  }

  private round(feature: ReviewFacts, ticketId: string, revision: string): ReviewRound | undefined {
    return feature.reviewRounds.find(
      ({ target, codeRevision }) =>
        target.type === "ticket" && target.ticketId === ticketId && codeRevision === revision,
    );
  }

  private acceptance(feature: ReviewFacts, ticketId: string, revision: string) {
    const round = this.round(feature, ticketId, revision);
    const reviewIds = new Set(
      feature.reviewRounds
        .filter(({ target }) => target.type === "ticket" && target.ticketId === ticketId)
        .flatMap(({ reviews }) => reviews.map(({ id }) => id)),
    );
    if (
      feature.findings.some((finding) =>
        finding.type === "review"
          ? reviewIds.has(finding.reviewId) && finding.decision.status === "open"
          : finding.ticketId === ticketId && finding.decision === "open",
      )
    )
      return "Blocked" as const;
    return round?.reviews.every(({ result }) => result !== undefined)
      ? ("Accepted" as const)
      : ("InAcceptance" as const);
  }

  private async activeReview(feature: Feature, reviewId: string) {
    const round = feature.reviewRounds.find(({ reviews }) =>
      reviews.some(({ id }) => id === reviewId),
    );
    const review = round?.reviews.find(({ id }) => id === reviewId);
    if (!review || round?.target.type !== "ticket")
      throw new Error(`Unknown ticket review '${reviewId}'.`);
    if (review.result) throw new Error(`Review '${reviewId}' already has a result.`);
    const ticket = this.ticket(feature, round.target.ticketId);
    const current = await this.currentRevision(ticket);
    if (
      "blocker" in current ||
      current.revision !== round.codeRevision ||
      current.worktree !== review.targetWorktree
    ) {
      throw new Error(
        `Review '${reviewId}' no longer matches the current ticket revision or worktree.`,
      );
    }
    return { review, round, ticket };
  }

  private async currentRevision(ticket: Ticket) {
    const commit = ticket.workRoundCommits.at(-1);
    if (
      !commit ||
      ticket.tasks.length === 0 ||
      ticket.tasks.some(
        ({ id, state }) => state !== "Done" || !ticket.committedTaskIds?.includes(id),
      )
    )
      return {
        blocker: `Ticket '${ticket.id}' must have a committed round covering all Done tasks.`,
      } as const;
    if (!ticket.worktree || !ticket.branch || ticket.merged) {
      return { blocker: `Ticket '${ticket.id}' has no active worktree.` } as const;
    }
    const git = await this.app.make(GitService);
    const worktree = ticket.worktree;
    await git.requireWorktreeBranch(worktree, ticket.branch);
    if (
      this.gitOutput(git, worktree, ["rev-parse", "HEAD"]).toString("utf8").trim() !== commit ||
      git
        .changedPaths(worktree, false)
        .some((path) => path !== ".spindle" && !path.startsWith(".spindle/"))
    ) {
      return {
        blocker: `Ticket '${ticket.id}' must be at its recorded commit with no outstanding code changes.`,
      } as const;
    }
    return { revision: this.codeRevision(git, worktree, commit), worktree } as const;
  }

  private codeRevision(git: GitService, worktree: string, commit: string): string {
    const tree = this.gitOutput(git, worktree, ["ls-tree", "-z", commit]);
    const digest = createHash("sha256");
    let start = 0;
    for (let end = tree.indexOf(0); end !== -1; end = tree.indexOf(0, start)) {
      const entry = tree.subarray(start, end);
      if (!entry.subarray(entry.indexOf(9) + 1).equals(Buffer.from(".spindle"))) {
        digest.update(tree.subarray(start, end + 1));
      }
      start = end + 1;
    }
    return digest.digest("hex");
  }

  private gitOutput(git: GitService, worktree: string, args: string[]): Buffer {
    const result = git.run(args, { cwd: worktree, encoding: "buffer" });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`git ${args[0]} failed: ${result.stderr.toString("utf8").trim()}`);
    return result.stdout;
  }
}
