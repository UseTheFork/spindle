import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { blueprintCatalog } from "@/BlueprintManagement/Catalog/BlueprintCatalog";
import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type { IntegrationRecord } from "@/SubagentDrivenDevelopment/Models/Evidence";
import {
  FEATURE_DIRECTORY,
  EXECUTION_STATES,
  TICKET_CATEGORIES,
  TRACKER_STATUSES,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import type {
  ExecutionState,
  TicketProgress,
  TicketBaselineChange,
  FeatureLedger,
  FeaturePaths,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import {
  isImplementationAssignment,
  isCorrectionAttempt,
  isCorrectionAdjudication,
  hasMatchingCorrectionAttempt,
} from "@/SubagentDrivenDevelopment/Persistence/AssignmentSchema";
import {
  isCheckRequirement,
  isCheckRecord,
} from "@/SubagentDrivenDevelopment/Persistence/CheckSchema";
import {
  isReviewFinding,
  isRequirementsDecision,
} from "@/SubagentDrivenDevelopment/Persistence/FindingSchema";
import {
  isDeliveryProgress,
  isAcceptedEvidence,
  isIntegrationRecord,
} from "@/SubagentDrivenDevelopment/Persistence/ProgressSchema";
import {
  isReviewAssignment,
  isSpecialistReviewRequirement,
} from "@/SubagentDrivenDevelopment/Persistence/ReviewSchema";
import { Records } from "@/Support/Records";

const isRecord = Records.isRecord;

function matchingCorrectionChecks(
  current: IntegrationRecord,
  previous: IntegrationRecord,
): boolean {
  const expected = previous.postMerge?.checks;
  const checks = current.postMerge?.checks;
  return (
    !!expected &&
    !!checks &&
    JSON.stringify(expected.required.map((item) => item.command)) ===
      JSON.stringify(checks.required.map((item) => item.command))
  );
}

function matchingCorrectionHistory(history: IntegrationRecord[]): boolean {
  const first = history[0];
  return !!first && history.every((integration) => matchingCorrectionChecks(integration, first));
}

function validBaselineHistory(value: unknown, baseSha: unknown): value is TicketBaselineChange[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(
      (change) =>
        isRecord(change) &&
        typeof change.from === "string" &&
        /^[0-9a-f]{40,64}$/i.test(change.from) &&
        typeof change.to === "string" &&
        /^[0-9a-f]{40,64}$/i.test(change.to) &&
        change.from !== change.to &&
        typeof change.ticketHead === "string" &&
        /^[0-9a-f]{40,64}$/i.test(change.ticketHead) &&
        typeof change.at === "string" &&
        Number.isFinite(Date.parse(change.at)) &&
        typeof change.author === "string" &&
        !!change.author.trim() &&
        Object.keys(change).every((key) =>
          ["from", "to", "ticketHead", "at", "author"].includes(key),
        ),
    )
  )
    return false;
  return (
    value.every((change, index) => index === 0 || value[index - 1].to === change.from) &&
    value.at(-1).to === baseSha
  );
}

export class LedgerRepository extends Service {
  public constructor(app: Application) {
    super(app);
  }

  public readLedger(feature: FeaturePaths): FeatureLedger {
    return this.validateLedger(
      JSON.parse(readFileSync(feature.ledger, "utf8")) as unknown,
      feature.feature,
    );
  }

  public validateLedger(value: unknown, feature: string): FeatureLedger {
    this.assertLedger(value, feature);
    return value;
  }

  private assertLedger(value: unknown, feature: string): asserts value is FeatureLedger {
    if (!isRecord(value)) throw new Error("Feature ledger must contain a JSON object.");
    const id = FEATURE_DIRECTORY.exec(feature)?.[1];
    if (value.schemaVersion !== 3) {
      throw new Error(`Unsupported feature ledger schema version: ${String(value.schemaVersion)}.`);
    }
    if (typeof value.featureId !== "string" || value.featureId !== id) {
      throw new Error("Feature ledger ID does not match its workspace directory.");
    }
    if (typeof value.title !== "string" || !value.title.trim()) {
      throw new Error("Feature ledger title must be a non-empty string.");
    }
    if (typeof value.createdBy !== "string" || !value.createdBy.trim()) {
      throw new Error("Feature ledger author must be a non-empty string.");
    }
    if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) {
      throw new Error("Feature ledger creation time must be a valid timestamp.");
    }
    if (typeof value.retrospectiveRequired !== "boolean") {
      throw new Error("Feature ledger retrospective policy must be a boolean.");
    }
    if (!isRecord(value.reviewPolicy)) throw new Error("Feature review policy must be an object.");
    if (
      typeof value.reviewPolicy.version !== "number" ||
      !Number.isSafeInteger(value.reviewPolicy.version) ||
      value.reviewPolicy.version < 1
    ) {
      throw new Error("Feature review policy version must be a positive integer.");
    }
    for (const role of ["ticket", "delivery"] as const) {
      const reviewers = value.reviewPolicy[role];
      if (
        !Array.isArray(reviewers) ||
        reviewers.length === 0 ||
        !reviewers.every((reviewer) => typeof reviewer === "string" && reviewer.trim())
      ) {
        throw new Error(`Feature ${role} review requirements must be a non-empty string list.`);
      }
    }
    if (
      !Array.isArray(value.tickets) ||
      !value.tickets.every(
        (ticket) =>
          isRecord(ticket) &&
          typeof ticket.id === "string" &&
          /^T-\d{4,}$/.test(ticket.id) &&
          typeof ticket.execution === "string" &&
          EXECUTION_STATES.includes(ticket.execution as ExecutionState) &&
          typeof ticket.title === "string" &&
          !!ticket.title.trim() &&
          typeof ticket.reporter === "string" &&
          !!ticket.reporter.trim() &&
          typeof ticket.category === "string" &&
          TICKET_CATEGORIES.includes(ticket.category as (typeof TICKET_CATEGORIES)[number]) &&
          typeof ticket.status === "string" &&
          TRACKER_STATUSES.includes(ticket.status as (typeof TRACKER_STATUSES)[number]) &&
          Array.isArray(ticket.blockedBy) &&
          ticket.blockedBy.every((dependency) => typeof dependency === "string") &&
          (!Object.hasOwn(ticket, "blocker") ||
            (typeof ticket.blocker === "string" && !!ticket.blocker.trim())) &&
          ((!Object.hasOwn(ticket, "owner") && !Object.hasOwn(ticket, "baseSha")) ||
            (typeof ticket.owner === "string" &&
              !!ticket.owner.trim() &&
              typeof ticket.baseSha === "string" &&
              /^[0-9a-f]{40,64}$/i.test(ticket.baseSha))) &&
          (!Object.hasOwn(ticket, "baselineHistory") ||
            validBaselineHistory(ticket.baselineHistory, ticket.baseSha)) &&
          (!Object.hasOwn(ticket, "worktree") ||
            (isRecord(ticket.worktree) &&
              typeof ticket.worktree.workspace === "string" &&
              isAbsolute(ticket.worktree.workspace) &&
              ticket.worktree.branch === `tickets/${feature}/${ticket.id}` &&
              typeof ticket.worktree.baseSha === "string" &&
              ticket.worktree.baseSha === ticket.baseSha &&
              /^[0-9a-f]{40,64}$/i.test(ticket.worktree.baseSha))) &&
          (!Object.hasOwn(ticket, "acceptedEvidence") ||
            isAcceptedEvidence(ticket.acceptedEvidence)) &&
          (!Object.hasOwn(ticket, "integration") ||
            (ticket.execution === "integrated" &&
              isIntegrationRecord(ticket.integration) &&
              isAcceptedEvidence(ticket.acceptedEvidence) &&
              JSON.stringify(ticket.integration.files) ===
                JSON.stringify(ticket.acceptedEvidence.files) &&
              ticket.integration.contentDigest === ticket.acceptedEvidence.contentDigest)) &&
          (!Object.hasOwn(ticket, "integrationHistory") ||
            (Array.isArray(ticket.integrationHistory) &&
              ticket.integrationHistory.length > 0 &&
              ticket.integrationHistory.every(isIntegrationRecord) &&
              ticket.integrationHistory.every((integration) => {
                const postMerge = integration.postMerge;
                const records = postMerge?.checks?.records ?? [];
                return (
                  postMerge?.status === "pending" &&
                  records.some(
                    (record, index) =>
                      record.result === "failed" &&
                      !records.slice(index + 1).some((later) => later.command === record.command),
                  )
                );
              }) &&
              new Set(ticket.integrationHistory.map((integration) => integration.mergeSha)).size ===
                ticket.integrationHistory.length &&
              (!isIntegrationRecord(ticket.integration) ||
                (!new Set(ticket.integrationHistory.map((integration) => integration.mergeSha)).has(
                  ticket.integration.mergeSha,
                ) &&
                  matchingCorrectionChecks(
                    ticket.integration,
                    ticket.integrationHistory[ticket.integrationHistory.length - 1]!,
                  ))) &&
              matchingCorrectionHistory(ticket.integrationHistory))) &&
          (!Object.hasOwn(ticket, "reviewRequirements") ||
            (Array.isArray(ticket.reviewRequirements) &&
              ticket.reviewRequirements.every(isSpecialistReviewRequirement) &&
              new Set(ticket.reviewRequirements.map((requirement) => requirement.agent)).size ===
                ticket.reviewRequirements.length)) &&
          (!Object.hasOwn(ticket, "checks") ||
            (isRecord(ticket.checks) &&
              Array.isArray(ticket.checks.required) &&
              ticket.checks.required.every(isCheckRequirement) &&
              Array.isArray(ticket.checks.records) &&
              ticket.checks.records.every(isCheckRecord) &&
              !Object.hasOwn(ticket.checks, "invalidations"))) &&
          (!Object.hasOwn(ticket, "assignment") ||
            (isImplementationAssignment(ticket.assignment) &&
              (!ticket.worktree ||
                (isRecord(ticket.worktree) &&
                  ticket.assignment.workspace === ticket.worktree.workspace &&
                  ticket.assignment.branch === ticket.worktree.branch)) &&
              ticket.assignment.report ===
                join(
                  this.app.workspaceRoot,
                  ".scratch",
                  feature,
                  "reports",
                  ticket.assignment.action === "implement"
                    ? `${ticket.id}-implementation.md`
                    : `${ticket.id}-round-${ticket.assignment.attempt}-fix.md`,
                ))) &&
          (!Object.hasOwn(ticket, "correctionAttempts") ||
            (Array.isArray(ticket.correctionAttempts) &&
              ticket.correctionAttempts.every(isCorrectionAttempt) &&
              ticket.correctionAttempts.every((attempt, index) => attempt.number === index + 1) &&
              ticket.correctionAttempts.every(
                (attempt) =>
                  attempt.assignment.report ===
                    join(
                      this.app.workspaceRoot,
                      ".scratch",
                      feature,
                      "reports",
                      `${ticket.id}-round-${attempt.number}-fix.md`,
                    ) &&
                  (!attempt.priorAssignment ||
                    attempt.priorAssignment.report ===
                      join(
                        this.app.workspaceRoot,
                        ".scratch",
                        feature,
                        "reports",
                        attempt.priorAssignment.action === "implement"
                          ? `${ticket.id}-implementation.md`
                          : `${ticket.id}-round-${attempt.priorAssignment.attempt}-fix.md`,
                      )) &&
                  (attempt.reviewAssignments ?? []).every(
                    (assignment) =>
                      assignment.report ===
                      join(
                        this.app.workspaceRoot,
                        ".scratch",
                        feature,
                        "reports",
                        assignment.scope === "initial"
                          ? `${ticket.id}-review-${assignment.id}.md`
                          : `${ticket.id}-round-${assignment.attempt}-review-${assignment.id}.md`,
                      ),
                  ),
              ) &&
              hasMatchingCorrectionAttempt(ticket))) &&
          (!Object.hasOwn(ticket, "adjudication") ||
            isCorrectionAdjudication(ticket.adjudication)) &&
          (!Object.hasOwn(ticket, "reviewAssignments") ||
            (Array.isArray(ticket.reviewAssignments) &&
              ticket.reviewAssignments.every(
                (assignment) =>
                  isReviewAssignment(assignment) &&
                  blueprintCatalog.agents[assignment.agent]?.canReview === true &&
                  assignment.report ===
                    join(
                      this.app.workspaceRoot,
                      ".scratch",
                      feature,
                      "reports",
                      assignment.scope === "initial"
                        ? `${ticket.id}-review-${assignment.id}.md`
                        : `${ticket.id}-round-${assignment.attempt}-review-${assignment.id}.md`,
                    ),
              ))) &&
          (!Object.hasOwn(ticket, "reviewHistory") ||
            (Array.isArray(ticket.reviewHistory) &&
              ticket.reviewHistory.every(
                (assignment) =>
                  isReviewAssignment(assignment) &&
                  blueprintCatalog.agents[assignment.agent]?.canReview === true &&
                  assignment.report ===
                    join(
                      this.app.workspaceRoot,
                      ".scratch",
                      feature,
                      "reports",
                      assignment.scope === "initial"
                        ? `${ticket.id}-review-${assignment.id}.md`
                        : `${ticket.id}-round-${assignment.attempt}-review-${assignment.id}.md`,
                    ),
              ))) &&
          (!Object.hasOwn(ticket, "requirementsDecisions") ||
            (Array.isArray(ticket.requirementsDecisions) &&
              ticket.requirementsDecisions.every(isRequirementsDecision))) &&
          (!Object.hasOwn(ticket, "findings") ||
            (Array.isArray(ticket.findings) && ticket.findings.every(isReviewFinding))),
      )
    ) {
      throw new Error(
        "Feature ticket records must contain a ticket ID and a valid execution state.",
      );
    }

    if (
      new Set(value.tickets.map((ticket) => (ticket as TicketProgress).id)).size !==
      value.tickets.length
    ) {
      throw new Error("Feature ledger ticket IDs must be unique.");
    }
    for (const ticket of value.tickets as TicketProgress[]) {
      for (const requirement of ticket.reviewRequirements ?? []) {
        if (blueprintCatalog.agents[requirement.agent]?.canReview !== true) {
          throw new Error(
            `Required specialist agent '${requirement.agent}' is not explicitly marked review-eligible.`,
          );
        }
        if (
          (value.reviewPolicy as FeatureLedger["reviewPolicy"]).ticket.includes(requirement.agent)
        ) {
          throw new Error(
            `Specialist reviewer '${requirement.agent}' duplicates the pinned ticket review policy.`,
          );
        }
      }
      const findingIds = ticket.findings?.map((finding) => finding.id) ?? [];
      if (new Set(findingIds).size !== findingIds.length) {
        throw new Error(`Finding IDs must be unique within ticket ${ticket.id}.`);
      }
      const decisionIds = ticket.requirementsDecisions?.map((decision) => decision.id) ?? [];
      if (new Set(decisionIds).size !== decisionIds.length) {
        throw new Error(`Requirements decision IDs must be unique within ticket ${ticket.id}.`);
      }
      for (const finding of ticket.findings ?? []) {
        if (
          finding.requirementsDecision &&
          !ticket.requirementsDecisions?.some(
            (decision) =>
              decision.id === finding.requirementsDecision &&
              decision.finding === finding.id &&
              decision.status === "approved",
          )
        ) {
          throw new Error(`Finding ${finding.id} references an invalid requirements decision.`);
        }
      }
      for (const assignment of [
        ...(ticket.reviewHistory ?? []),
        ...(ticket.reviewAssignments ?? []),
      ]) {
        const reported = (ticket.findings ?? []).filter((finding) =>
          finding.provenance.some(
            (source) =>
              source.report === assignment.report && source.snapshot === assignment.snapshot,
          ),
        );
        if (assignment.noFindings === true && reported.length > 0) {
          throw new Error(
            `Review assignment ${assignment.id} declares no findings despite registered provenance.`,
          );
        }
        for (const id of assignment.findingIds ?? []) {
          const finding = (ticket.findings ?? []).find((candidate) => candidate.id === id);
          if (
            !finding ||
            !finding.provenance.some(
              (source) =>
                source.report === assignment.report && source.snapshot === assignment.snapshot,
            )
          ) {
            throw new Error(
              `Review assignment ${assignment.id} references finding ${id} without matching provenance.`,
            );
          }
        }
        if (
          assignment.status === "submitted" &&
          assignment.findingIds &&
          (reported.length !== assignment.findingIds.length ||
            reported.some((finding) => !assignment.findingIds!.includes(finding.id)))
        ) {
          throw new Error(
            `Review assignment ${assignment.id} does not list the complete canonical findings set.`,
          );
        }
      }
    }
    const reviewAssignmentIds = value.tickets.flatMap((ticket) =>
      isRecord(ticket)
        ? [
            ...(Array.isArray(ticket.reviewHistory) ? ticket.reviewHistory : []),
            ...(Array.isArray(ticket.reviewAssignments) ? ticket.reviewAssignments : []),
          ].map((assignment) => (isRecord(assignment) ? assignment.id : undefined))
        : [],
    );
    if (
      reviewAssignmentIds.some((assignmentId) => typeof assignmentId !== "string") ||
      new Set(reviewAssignmentIds).size !== reviewAssignmentIds.length
    ) {
      throw new Error("Feature review assignment IDs must be unique.");
    }
    if (!isRecord(value.delivery)) throw new Error("Feature delivery progress must be an object.");
    if (
      typeof value.delivery.execution !== "string" ||
      !EXECUTION_STATES.includes(value.delivery.execution as ExecutionState)
    ) {
      throw new Error("Feature delivery execution state is invalid.");
    }
    if (!["active", "complete"].includes(String(value.delivery.status))) {
      throw new Error("Feature tracking status is invalid.");
    }
    if (
      !Array.isArray(value.delivery.history) ||
      !value.delivery.history.every(
        (entry) =>
          isRecord(entry) &&
          typeof entry.at === "string" &&
          Number.isFinite(Date.parse(entry.at)) &&
          typeof entry.author === "string" &&
          entry.author.trim() &&
          typeof entry.action === "string" &&
          entry.action.trim(),
      )
    ) {
      throw new Error(
        "Feature delivery history records must contain a valid timestamp, author, and action.",
      );
    }
    const delivery = value.delivery;
    if (
      (Object.hasOwn(delivery, "baseSha") &&
        (typeof delivery.baseSha !== "string" || !/^[0-9a-f]{40,64}$/i.test(delivery.baseSha))) ||
      (Object.hasOwn(delivery, "owner") &&
        (typeof delivery.owner !== "string" || !delivery.owner.trim())) ||
      (Object.hasOwn(delivery, "reviewRequirements") &&
        (!Array.isArray(delivery.reviewRequirements) ||
          !delivery.reviewRequirements.every(isSpecialistReviewRequirement) ||
          new Set(delivery.reviewRequirements.map((item) => item.agent)).size !==
            delivery.reviewRequirements.length)) ||
      (Object.hasOwn(delivery, "reviewAssignments") &&
        (!Array.isArray(delivery.reviewAssignments) ||
          !delivery.reviewAssignments.every(
            (assignment) =>
              isReviewAssignment(assignment) &&
              assignment.scope === "delivery" &&
              blueprintCatalog.agents[assignment.agent]?.canReview === true &&
              assignment.report ===
                join(
                  this.app.workspaceRoot,
                  ".scratch",
                  feature,
                  "reports",
                  assignment.attempt
                    ? `final-round-${assignment.attempt}-review-${assignment.id}.md`
                    : `final-review-${assignment.id}.md`,
                ),
          ))) ||
      (Object.hasOwn(delivery, "reviewHistory") &&
        (!Array.isArray(delivery.reviewHistory) ||
          !delivery.reviewHistory.every(
            (assignment) =>
              isReviewAssignment(assignment) &&
              assignment.scope === "delivery" &&
              blueprintCatalog.agents[assignment.agent]?.canReview === true,
          ))) ||
      (Object.hasOwn(delivery, "requirementsDecisions") &&
        (!Array.isArray(delivery.requirementsDecisions) ||
          !delivery.requirementsDecisions.every(isRequirementsDecision) ||
          new Set(delivery.requirementsDecisions.map((decision) => decision.id)).size !==
            delivery.requirementsDecisions.length)) ||
      (Object.hasOwn(delivery, "findings") &&
        (!Array.isArray(delivery.findings) || !delivery.findings.every(isReviewFinding))) ||
      (Object.hasOwn(delivery, "assignment") &&
        (!isImplementationAssignment(delivery.assignment) ||
          delivery.assignment.action !== "correct" ||
          !Number.isSafeInteger(delivery.assignment.attempt) ||
          delivery.assignment.report !==
            join(
              this.app.workspaceRoot,
              ".scratch",
              feature,
              "reports",
              `final-round-${delivery.assignment.attempt}-fix.md`,
            ))) ||
      (Object.hasOwn(delivery, "checks") &&
        (!isRecord(delivery.checks) ||
          !Array.isArray(delivery.checks.required) ||
          !delivery.checks.required.every(isCheckRequirement) ||
          !Array.isArray(delivery.checks.records) ||
          !delivery.checks.records.every(isCheckRecord))) ||
      (Object.hasOwn(delivery, "correctionAttempts") &&
        (!Array.isArray(delivery.correctionAttempts) ||
          !delivery.correctionAttempts.every(isCorrectionAttempt) ||
          delivery.correctionAttempts.some(
            (attempt, index) =>
              attempt.number !== index + 1 ||
              attempt.assignment.action !== "correct" ||
              attempt.assignment.report !==
                join(
                  this.app.workspaceRoot,
                  ".scratch",
                  feature,
                  "reports",
                  `final-round-${attempt.number}-fix.md`,
                ) ||
              (attempt.reviewAssignments ?? []).some(
                (assignment) =>
                  assignment.scope !== "delivery" ||
                  assignment.attempt !== attempt.number ||
                  assignment.report !==
                    join(
                      this.app.workspaceRoot,
                      ".scratch",
                      feature,
                      "reports",
                      `final-round-${attempt.number}-review-${assignment.id}.md`,
                    ),
              ),
          ) ||
          !hasMatchingCorrectionAttempt(delivery))) ||
      (Object.hasOwn(delivery, "adjudication") && !isCorrectionAdjudication(delivery.adjudication))
    ) {
      throw new Error("Feature delivery evidence or assignment records are invalid.");
    }
    if (!isDeliveryProgress(delivery)) {
      throw new Error("Feature delivery progress does not match the delivery ledger schema.");
    }
    const deliveryFindingIds = delivery.findings?.map((finding) => finding.id) ?? [];
    if (new Set(deliveryFindingIds).size !== deliveryFindingIds.length) {
      throw new Error("Delivery finding IDs must be unique.");
    }
    const ticketIds = new Set((value.tickets as TicketProgress[]).map((ticket) => ticket.id));
    for (const finding of delivery.findings ?? []) {
      if (finding.relatedTicket && !ticketIds.has(finding.relatedTicket)) {
        throw new Error(
          `Delivery finding ${finding.id} references missing ticket ${finding.relatedTicket}.`,
        );
      }
      if (
        finding.requirementsDecision &&
        !delivery.requirementsDecisions?.some(
          (decision) =>
            decision.id === finding.requirementsDecision &&
            decision.finding === finding.id &&
            decision.status === "approved",
        )
      ) {
        throw new Error(
          `Delivery finding ${finding.id} references an invalid requirements decision.`,
        );
      }
    }
    const allReviewAssignmentIds = [
      ...reviewAssignmentIds,
      ...(Array.isArray(delivery.reviewHistory) ? delivery.reviewHistory : []).map((assignment) =>
        isRecord(assignment) ? assignment.id : undefined,
      ),
      ...(Array.isArray(delivery.reviewAssignments) ? delivery.reviewAssignments : []).map(
        (assignment) => (isRecord(assignment) ? assignment.id : undefined),
      ),
    ];
    if (
      allReviewAssignmentIds.some((assignmentId) => typeof assignmentId !== "string") ||
      new Set(allReviewAssignmentIds).size !== allReviewAssignmentIds.length
    ) {
      throw new Error("Feature review assignment IDs must be unique.");
    }
  }
}
