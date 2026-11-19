import { createHash, randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";

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
type ReviewTarget = ReviewRound["target"];
type ReviewableTicket = Pick<
  Ticket,
  "id" | "workRoundCommits" | "committedTaskIds" | "tasks" | "worktree" | "branch" | "merged"
>;
type RevisionResult = { revision: string; worktree: string } | { blocker: string };

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

export class SddReviewService extends Service {
  public hasPassedFeatureReview(feature: Feature): boolean {
    return feature.reviewRounds.some(
      ({ target, reviews }) =>
        target.type === "feature" &&
        reviews.some(({ result }) => result?.recommendation === "pass"),
    );
  }

  public async start(reference: string, target: ReviewTarget, scope: string, focus?: string) {
    if (!scope.trim() || (focus !== undefined && !focus.trim())) {
      throw new Error("Review scope and optional focus must not be empty.");
    }
    const workspace = await this.app.make(FeatureWorkspaceService);
    return workspace.withLedgerTransaction(reference, async (feature, ledger, publish) => {
      if (feature.pendingStart)
        throw new Error("Resume the pending start before starting reviews.");
      const current =
        target.type === "ticket"
          ? await this.currentTicketRevision(this.ticket(feature, target.ticketId))
          : await this.currentFeatureRevision(feature);
      if ("blocker" in current) throw new Error(current.blocker);
      if (this.acceptance(feature, target, current.revision, feature.tickets) === "Accepted") {
        throw new Error(`${this.describeTarget(target)} is already accepted at this revision.`);
      }
      const round = this.round(feature, target, current.revision);
      const findingsToVerify = this.findingsToVerify(feature, target, current.revision);
      const review = {
        id: `R-${randomUUID()}`,
        targetWorktree: current.worktree,
        scope,
        focus,
        findingsToVerify,
      };
      if (round) {
        ledger.reviewRounds[feature.reviewRounds.indexOf(round)].reviews.push(review);
      } else {
        ledger.reviewRounds.push({
          target,
          codeRevision: current.revision,
          reviews: [review],
        });
      }
      await publish(ledger);
      const path = this.app.featuresPath(feature.name);
      const quoted = `'${path.replaceAll("'", "'\\''")}'`;
      return {
        review: review.id,
        ...(target.type === "ticket" ? { ticket: target.ticketId } : { feature: feature.name }),
        codeRevision: current.revision,
        assignmentCommand: `spindle sdd assignment --feature ${quoted} --review ${review.id} --json`,
      };
    });
  }

  public async assignment(reference: string, reviewId: string) {
    if (!isAbsolute(reference)) throw new Error("Assignment requires an absolute --feature path.");
    const feature = await (await this.app.make(FeatureWorkspaceService)).load(reference);
    const { review, round } = await this.activeReview(feature, reviewId);
    const assignment = {
      role: "reviewer",
      feature: feature.name,
      review: review.id,
      worktree: review.targetWorktree,
      codeRevision: round.codeRevision,
      scope: review.scope,
      focus: review.focus,
      findingsToVerify: feature.findings.filter(({ id }) => review.findingsToVerify.includes(id)),
      reviewerRules: [
        "Verify each listed finding against the current code. Report any fix that still fails as a finding.",
        "You may run tests, builds, and type checks in the target worktree.",
        "Do not change tracked files, commit, or run other SDD commands.",
        "Return the review to the controller; do not write a report file.",
      ],
      responseTemplate,
    };
    if (round.target.type === "ticket") {
      const ticket = this.ticket(feature, round.target.ticketId);
      return {
        ...assignment,
        ticket: ticket.id,
        requirements: ticket.requirements,
        acceptanceCriteria: ticket.acceptanceCriteria,
      };
    }
    return {
      ...assignment,
      specification: feature.specification,
      ...(feature.design === undefined ? {} : { design: feature.design }),
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
      const { review, round } = await this.activeReview(feature, reviewId);
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
      this.resolveVerifiedFindings(feature, round);
      await publish({ ...ledger, reviewRounds: feature.reviewRounds, findings: feature.findings });
      return {
        review: reviewId,
        ...(round.target.type === "ticket"
          ? { ticket: round.target.ticketId }
          : { feature: feature.name }),
        findings: findings.map(({ id }) => id),
        acceptance: this.acceptance(feature, round.target, round.codeRevision, feature.tickets),
      };
    });
  }

  public async dismissFinding(reference: string, findingId: string, reason: string) {
    if (!reason.trim()) throw new Error("A dismissal reason must not be empty.");
    const workspace = await this.app.make(FeatureWorkspaceService);
    return workspace.withLedgerTransaction(reference, async (feature, ledger, publish) => {
      if (feature.pendingStart)
        throw new Error("Resume the pending start before dismissing findings.");
      const finding = feature.findings.find(({ id }) => id === findingId);
      if (!finding) throw new Error(`Unknown finding '${findingId}'.`);
      if (finding.decision.status !== "open")
        throw new Error(`Finding '${findingId}' is not open.`);
      const round = feature.reviewRounds.find(({ reviews }) =>
        reviews.some(({ id }) => id === finding.reviewId),
      );
      if (!round) throw new Error(`Finding '${findingId}' has no review round.`);
      if (round.target.type === "ticket") {
        const ticket = this.ticket(feature, round.target.ticketId);
        if (ticket.merged) throw new Error(`Ticket '${ticket.id}' is already merged.`);
      }
      finding.decision = { status: "dismissed", reason };
      this.resolveVerifiedFindings(feature, round);
      await publish({ ...ledger, findings: feature.findings });
      return {
        finding: finding.id,
        ...(round.target.type === "ticket"
          ? { ticket: round.target.ticketId }
          : { feature: feature.name }),
        decision: finding.decision,
      };
    });
  }

  public async status(
    feature: Feature,
    ticket: ReviewableTicket,
  ): Promise<
    | { blocker: string }
    | {
        state: "Accepted" | "InAcceptance" | "Blocked";
        codeRevision: string;
        hasRound: boolean;
      }
  > {
    const current = await this.currentTicketRevision(ticket);
    if ("blocker" in current) return { blocker: current.blocker };
    const acceptance = this.acceptance(
      feature,
      { type: "ticket", ticketId: ticket.id },
      current.revision,
    );
    return {
      state: acceptance === "InReview" ? "InAcceptance" : acceptance,
      codeRevision: current.revision,
      hasRound:
        this.round(feature, { type: "ticket", ticketId: ticket.id }, current.revision) !==
        undefined,
    };
  }

  public async featureStatus(
    feature: Feature,
  ): Promise<
    | { blocker: string }
    | { state: "Accepted" | "InReview" | "Blocked"; codeRevision: string; hasRound: boolean }
  > {
    const current = await this.currentFeatureRevision(feature);
    if ("blocker" in current) return { blocker: current.blocker };
    const acceptance = this.acceptance(
      feature,
      { type: "feature" },
      current.revision,
      feature.tickets,
    );
    return {
      state: acceptance === "InAcceptance" ? "InReview" : acceptance,
      codeRevision: current.revision,
      hasRound: this.round(feature, { type: "feature" }, current.revision) !== undefined,
    };
  }

  public async assertOrdinaryTaskAllowed(
    facts: ReviewFacts,
    ticket: Pick<Ticket, "id" | "workRoundCommits">,
  ) {
    const target = { type: "ticket" as const, ticketId: ticket.id };
    const rounds = this.roundsForTarget(facts, target);
    const reviewIds = new Set(rounds.flatMap(({ reviews }) => reviews.map(({ id }) => id)));
    if (rounds.some(({ reviews }) => reviews.some(({ result }) => result === undefined))) {
      throw new Error(`Cannot add a task while ticket '${ticket.id}' is under review.`);
    }
    if (
      facts.findings.some(
        (finding) => reviewIds.has(finding.reviewId) && finding.decision.status === "open",
      )
    ) {
      throw new Error(`Cannot add an ordinary task while ticket '${ticket.id}' has open findings.`);
    }
    const commit = ticket.workRoundCommits.at(-1);
    if (!commit || rounds.length === 0) return;
    const git = await this.app.make(GitService);
    const revision = this.codeRevision(git, this.app.workspaceRoot, commit);
    if (this.acceptance(facts, target, revision) === "Accepted") {
      throw new Error(
        `Cannot add an ordinary task to accepted ticket '${ticket.id}'; use linked fix work.`,
      );
    }
  }

  private findingsToVerify(feature: Feature, target: ReviewTarget, revision: string): string[] {
    return feature.findings.flatMap((finding) => {
      if (finding.type !== "review" || finding.decision.status !== "open") return [];
      const fixWork = finding.fixWork;
      const sourceRound = feature.reviewRounds.find(({ reviews }) =>
        reviews.some(({ id }) => id === finding.reviewId),
      );
      if (!sourceRound || !this.sameTarget(sourceRound.target, target)) return [];
      if (target.type === "ticket") {
        if (finding.fixWork?.type !== "task") return [];
        const ticket = this.ticket(feature, target.ticketId);
        const { taskId } = finding.fixWork;
        if (
          !ticket.committedTaskIds?.includes(taskId) ||
          !ticket.tasks.some(
            ({ id, discoveredFrom }) => id === taskId && discoveredFrom === finding.id,
          )
        )
          return [];
      } else {
        if (fixWork?.type !== "ticket") return [];
        const fixTicket = feature.tickets.find(({ id }) => id === fixWork.ticketId);
        if (!fixTicket?.merged) return [];
      }
      if (sourceRound.codeRevision === revision) {
        throw new Error(
          `Fix for finding '${finding.id}' needs a changed code revision before review.`,
        );
      }
      return [finding.id];
    });
  }

  private resolveVerifiedFindings(feature: Feature, round: ReviewRound): void {
    if (round.reviews.some(({ result }) => result === undefined)) return;
    const reviewIds = new Set(round.reviews.map(({ id }) => id));
    if (
      feature.findings.some(
        (finding) =>
          finding.type === "review" &&
          reviewIds.has(finding.reviewId) &&
          finding.decision.status === "open",
      )
    )
      return;
    for (const finding of feature.findings) {
      if (finding.type !== "review" || finding.decision.status !== "open") continue;
      const sourceRound = feature.reviewRounds.find(({ reviews }) =>
        reviews.some(({ id }) => id === finding.reviewId),
      );
      if (
        sourceRound &&
        this.sameTarget(sourceRound.target, round.target) &&
        round.reviews.every(({ findingsToVerify }) => findingsToVerify.includes(finding.id))
      ) {
        finding.decision = { status: "resolved" };
      }
    }
  }

  private ticket(feature: Feature, id: string): Ticket {
    const ticket = feature.tickets.find((item) => item.id === id);
    if (!ticket) throw new Error(`Unknown ticket '${id}'.`);
    return ticket;
  }

  private round(
    feature: ReviewFacts,
    target: ReviewTarget,
    revision: string,
  ): ReviewRound | undefined {
    const latest = this.roundsForTarget(feature, target).at(-1);
    return latest?.codeRevision === revision ? latest : undefined;
  }

  private roundsForTarget(feature: ReviewFacts, target: ReviewTarget): ReviewRound[] {
    return feature.reviewRounds.filter(({ target: candidate }) =>
      this.sameTarget(candidate, target),
    );
  }

  private sameTarget(left: ReviewTarget, right: ReviewTarget): boolean {
    return (
      left.type === right.type &&
      (left.type === "feature" || (right.type === "ticket" && left.ticketId === right.ticketId))
    );
  }

  private acceptance(
    feature: ReviewFacts,
    target: ReviewTarget,
    revision: string,
    tickets: readonly Pick<Ticket, "id" | "merged">[] = [],
  ) {
    const rounds = this.roundsForTarget(feature, target);
    const round = this.round(feature, target, revision);
    const reviewIds = new Set(rounds.flatMap(({ reviews }) => reviews.map(({ id }) => id)));
    const open = feature.findings.filter(
      (finding) => reviewIds.has(finding.reviewId) && finding.decision.status === "open",
    );
    if (
      open.some((finding) => {
        const fixWork = finding.fixWork;
        if (!fixWork) return true;
        return (
          target.type === "feature" &&
          fixWork.type === "ticket" &&
          tickets.find(({ id }) => id === fixWork.ticketId)?.merged !== true
        );
      })
    )
      return "Blocked" as const;
    if (open.length > 0)
      return target.type === "ticket" ? ("InAcceptance" as const) : ("InReview" as const);
    return round?.reviews.every(({ result }) => result !== undefined)
      ? ("Accepted" as const)
      : target.type === "ticket"
        ? ("InAcceptance" as const)
        : ("InReview" as const);
  }

  private async activeReview(feature: Feature, reviewId: string) {
    const round = feature.reviewRounds.find(({ reviews }) =>
      reviews.some(({ id }) => id === reviewId),
    );
    const review = round?.reviews.find(({ id }) => id === reviewId);
    if (!review || !round) throw new Error(`Unknown review '${reviewId}'.`);
    if (review.result) throw new Error(`Review '${reviewId}' already has a result.`);
    const current =
      round.target.type === "ticket"
        ? await this.currentTicketRevision(this.ticket(feature, round.target.ticketId))
        : await this.currentFeatureRevision(feature);
    if (
      "blocker" in current ||
      current.revision !== round.codeRevision ||
      current.worktree !== review.targetWorktree
    ) {
      throw new Error(
        `Review '${reviewId}' no longer matches the current ${round.target.type} revision or worktree.`,
      );
    }
    return { review, round };
  }

  private async currentTicketRevision(ticket: ReviewableTicket): Promise<RevisionResult> {
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

  private async currentFeatureRevision(feature: Feature): Promise<RevisionResult> {
    if (feature.pendingStart || feature.pendingTicketCommit || feature.pendingMergeOperation) {
      return { blocker: `Feature '${feature.name}' has a pending workflow operation.` } as const;
    }
    if (!feature.tickets.length || feature.tickets.some(({ merged }) => !merged)) {
      return {
        blocker: `All tickets in feature '${feature.name}' must be integrated before feature review.`,
      } as const;
    }
    if (!feature.featureWorktree || !feature.featureBranch) {
      return { blocker: `Feature '${feature.name}' has no active feature worktree.` } as const;
    }
    const git = await this.app.make(GitService);
    const worktree = feature.featureWorktree;
    await git.requireWorktreeBranch(worktree, feature.featureBranch);
    const head = this.gitOutput(git, worktree, ["rev-parse", "HEAD"]).toString("utf8").trim();
    const branchHead = this.gitOutput(git, worktree, [
      "rev-parse",
      "--verify",
      `refs/heads/${feature.featureBranch}`,
    ])
      .toString("utf8")
      .trim();
    if (
      head !== branchHead ||
      git
        .changedPaths(worktree, false)
        .some((path) => path !== ".spindle" && !path.startsWith(".spindle/"))
    ) {
      return {
        blocker: `Feature '${feature.name}' must be at its branch tip with no outstanding code changes.`,
      } as const;
    }
    return { revision: this.codeRevision(git, worktree, head), worktree } as const;
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

  private describeTarget(target: ReviewTarget): string {
    return target.type === "ticket" ? `Ticket '${target.ticketId}'` : "Feature";
  }

  private gitOutput(git: GitService, worktree: string, args: string[]): Buffer {
    const result = git.run(args, { cwd: worktree, encoding: "buffer" });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`git ${args[0]} failed: ${result.stderr.toString("utf8").trim()}`);
    return result.stdout;
  }
}
