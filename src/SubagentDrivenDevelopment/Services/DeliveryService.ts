import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";
import type { FinishOptions, NextOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import type { FeatureLedger, FeaturePaths } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { CheckPolicy } from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";
import { FindingPolicy } from "@/SubagentDrivenDevelopment/Policies/FindingPolicy";
import { validateAuthor } from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { requiredDeliveryReviewers } from "@/SubagentDrivenDevelopment/Policies/RequiredReviewers";
import { ReviewPolicy } from "@/SubagentDrivenDevelopment/Policies/ReviewPolicy";
import {
  FeatureFinalizationService,
  type FeatureFinishOptions,
} from "@/SubagentDrivenDevelopment/Services/FeatureFinalizationService";
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
    private readonly finalization: FeatureFinalizationService,
  ) {
    super(app);
  }

  public finish(options: FeatureFinishOptions): unknown {
    validateAuthor(options.author);
    const feature =
      this.finalization.recordedFeature(options.spec) ??
      this.featureInspectionService.resolveFeature(options.spec);
    return this.finalization.finish(feature, options, (ledger) =>
      this.assertReady(feature, options, ledger),
    );
  }

  private assertReady(
    feature: FeaturePaths,
    options: FinishOptions,
    approvedLedger?: FeatureLedger,
  ) {
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = approvedLedger ?? this.ledgerRepository.readLedger(feature);
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
      const unintegrated = ledger.tickets
        .filter((progress) => progress.execution !== "integrated" || !progress.integration)
        .map((progress) => progress.id);
      if (unintegrated.length > 0) {
        throw new Error(
          `Cannot finish; every ticket must be integrated: ${unintegrated.join(", ")}.`,
        );
      }
      if (
        ledger.tickets.some(
          (progress) =>
            !progress.worktree ||
            progress.integration?.postMerge?.status !== "passed" ||
            !progress.integration.postMerge.checks ||
            progress.integration.postMerge.mergeSha !== progress.integration.mergeSha ||
            progress.integration.postMerge.checks.required.length === 0 ||
            progress.integration.postMerge.checks.required.some((requirement) => {
              const latest = progress
                .integration!.postMerge!.checks!.records.filter(
                  (record) => record.command === requirement.command,
                )
                .at(-1);
              return (
                latest?.result !== "passed" || latest.headSha !== progress.integration!.mergeSha
              );
            }),
        )
      ) {
        throw new Error(
          "Cannot finish; every ticket needs recorded worktree ownership and passing exact post-merge validation.",
        );
      }
      if (tickets.length !== ledger.tickets.length) {
        throw new Error("Cannot finish; one or more feature ticket documents are missing.");
      }
      for (const progress of ledger.tickets) {
        if (!progress.acceptedEvidence || progress.adjudication?.status === "pending") {
          throw new Error(
            `Cannot finish; ticket ${progress.id} has no frozen acceptance evidence or awaits adjudication.`,
          );
        }
        const ticket = tickets.find((candidate) => candidate.id === progress.id)!;
        const blockers = this.findingPolicy.findingBlockers(feature, ticket, progress, {
          ...progress.acceptedEvidence,
          headSha: progress.integration!.commitSha,
        });
        if (blockers.length)
          throw new Error(
            `Cannot finish; ticket findings remain blocking:\n${blockers.join("\n")}`,
          );
      }
      if (delivery.adjudication?.status === "pending") {
        throw new Error(
          `Cannot finish; delivery correction is paused for adjudication (${delivery.adjudication.reason}).`,
        );
      }
      const identity = this.gitEvidence.deliveryCommitIdentity(feature, ledger, tickets);
      const checkBlockers = this.checkPolicy.deliveryCheckBlockers(
        feature,
        tickets,
        delivery,
        identity,
      );
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
      const confirmed = this.gitEvidence.deliveryCommitIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      if (
        confirmed.headSha !== identity.headSha ||
        this.checkPolicy.deliveryCheckBlockers(feature, tickets, delivery, confirmed).length > 0
      ) {
        throw new Error(
          "Aggregate content or check evidence changed while finishing; resume and revalidate delivery.",
        );
      }
      return { ledger, identity, retrospective };
    });
  }

  public next(options: NextOptions) {
    const recorded = this.finalization.recordedFeature(options.spec);
    if (recorded) return this.finalization.status(recorded.feature);
    const status = this.featureInspectionService.status(options);
    return {
      feature: status.feature,
      spec: status.spec,
      commits: status.commits,
      findings: status.findings,
      requirementsDecisions: status.requirementsDecisions,
      actions: status.actions,
      pendingAssignments: status.pendingAssignments,
      blockers: status.blockers,
      delivery: status.delivery,
    };
  }
}
