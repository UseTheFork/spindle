import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type { FinishOptions, NextOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { CheckPolicy } from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";
import { FindingPolicy } from "@/SubagentDrivenDevelopment/Policies/FindingPolicy";
import { validateAuthor } from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { requiredDeliveryReviewers } from "@/SubagentDrivenDevelopment/Policies/RequiredReviewers";
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class DeliveryService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly reportEvidence: ReportEvidence,
    private readonly ticketRepository: TicketRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly checkPolicy: CheckPolicy,
    private readonly findingPolicy: FindingPolicy,
    private readonly reviewPolicy: ReviewPolicy,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public finish(options: FinishOptions): {
    scope: "delivery";
    finished: true;
    idempotent?: boolean;
    retrospectiveRequired: boolean;
    retrospective?: { report: string; reportSha256: string };
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateAuthor(options.author);
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const delivery = ledger.delivery;
      if (ledger.tickets.length === 0) {
        throw new Error("Cannot finish; the feature must contain at least one ticket.");
      }
      const tickets = this.ticketRepository.readTickets(feature.workspace);
      const missing = ledger.tickets
        .filter((progress) => progress.status !== "closed")
        .map((progress) => progress.id);
      if (missing.length > 0) {
        throw new Error(
          `Cannot finish; every feature ticket must be closed: ${missing.join(", ")}.`,
        );
      }
      if (tickets.length !== ledger.tickets.length) {
        throw new Error("Cannot finish; one or more feature ticket documents are missing.");
      }
      if (delivery.adjudication?.status === "pending") {
        throw new Error(
          `Cannot finish; delivery correction is paused for adjudication (${delivery.adjudication.reason}).`,
        );
      }
      const identity = this.gitEvidence.deliveryIdentity(feature, ledger, tickets);
      const checkBlockers = this.checkPolicy.deliveryCheckBlockers(delivery, identity);
      if (checkBlockers.length > 0) {
        throw new Error(
          `Cannot finish; final delivery checks are not current and passing:\n${checkBlockers.join("\n")}`,
        );
      }
      const reviewers = requiredDeliveryReviewers(ledger, delivery);
      const assignments = delivery.reviewAssignments ?? [];
      const reviewBlockers: string[] = [];
      if (assignments.length !== reviewers.length) {
        reviewBlockers.push("Aggregate review assignment batch is incomplete.");
      }
      for (const required of reviewers) {
        const matching = assignments.filter(
          (assignment) =>
            assignment.agent === required.agent &&
            assignment.objective === required.details &&
            assignment.scope === "delivery",
        );
        if (matching.length !== 1) {
          reviewBlockers.push(
            `Required aggregate reviewer '${required.agent}' has no unique current assignment.`,
          );
          continue;
        }
        const assignment = matching[0]!;
        if (assignment.status !== "submitted" || assignment.result !== "passed") {
          reviewBlockers.push(
            `Required aggregate review '${required.agent}' is ${assignment.status === "pending" ? "pending" : (assignment.result ?? "incomplete")}.`,
          );
          continue;
        }
        const blocker = this.reviewPolicy.reviewAssignmentBlocker(
          feature,
          delivery,
          assignment,
          identity,
        );
        if (blocker) reviewBlockers.push(blocker);
      }
      if (reviewBlockers.length > 0) {
        throw new Error(
          `Cannot finish; aggregate required reviews are not current and passing:\n${reviewBlockers.join("\n")}`,
        );
      }
      const findingBlockers = this.findingPolicy.deliveryFindingBlockers(
        feature,
        ledger,
        delivery,
        identity,
      );
      if (findingBlockers.length > 0) {
        throw new Error(
          `Cannot finish; unresolved delivery blockers remain:\n${findingBlockers.join("\n")}`,
        );
      }
      if (ledger.retrospectiveRequired && !options.report) {
        throw new Error(
          "A retrospective report is required by the feature's stored creation policy.",
        );
      }
      let retrospective: { report: string; reportSha256: string } | undefined;
      if (options.report) {
        const report = isAbsolute(options.report)
          ? resolve(options.report)
          : resolve(feature.workspace, options.report);
        this.reportEvidence.assertReportPath(feature, report, true);
        const content = readFileSync(report);
        if (content.length === 0 || !content.toString("utf8").trim()) {
          throw new Error("Retrospective report must not be empty.");
        }
        retrospective = {
          report,
          reportSha256: createHash("sha256").update(content).digest("hex"),
        };
      }
      if (delivery.finished) {
        const same =
          delivery.finished.report === retrospective?.report &&
          delivery.finished.reportSha256 === retrospective?.reportSha256;
        if (!same) {
          throw new Error(
            "Full-spec delivery is already finished with different retrospective evidence.",
          );
        }
        return {
          scope: "delivery",
          finished: true,
          idempotent: true,
          retrospectiveRequired: ledger.retrospectiveRequired,
          ...(retrospective ? { retrospective } : {}),
          ...identity,
        };
      }
      const confirmed = this.gitEvidence.deliveryIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      if (
        confirmed.snapshot !== identity.snapshot ||
        this.checkPolicy.deliveryCheckBlockers(delivery, confirmed).length > 0
      ) {
        throw new Error(
          "Aggregate content or check evidence changed while finishing; resume and revalidate delivery.",
        );
      }
      delivery.execution = "complete";
      delivery.finished = {
        at: new Date().toISOString(),
        author: options.author.trim(),
        ...retrospective,
      };
      delivery.status = "complete";
      delivery.history.push({
        at: delivery.finished.at,
        author: delivery.finished.author,
        action: "delivery-finished",
      });
      this.workspaceTransaction.writeLedger(feature, ledger);
      return {
        scope: "delivery",
        finished: true,
        retrospectiveRequired: ledger.retrospectiveRequired,
        ...(retrospective ? { retrospective } : {}),
        ...identity,
      };
    });
  }

  public next(options: NextOptions) {
    const status = this.featureInspectionService.status(options);
    return {
      feature: status.feature,
      spec: status.spec,
      snapshots: status.snapshots,
      findings: status.findings,
      requirementsDecisions: status.requirementsDecisions,
      actions: status.actions,
      pendingAssignments: status.pendingAssignments,
      blockers: status.blockers,
      delivery: status.delivery,
    };
  }
}
