import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blueprintCatalog } from "@/blueprints/catalog";
import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { FEATURE_DIRECTORY, EXECUTION_STATES } from "@/SubagentDrivenDevelopment/Models/Workflow";
import type {
  ExecutionState,
  IssueProgress,
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
  isCheckGateInvalidation,
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
import { isRecord } from "@/utilities/records";

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
    if (value.schemaVersion !== 1) {
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
    for (const role of ["issue", "delivery"] as const) {
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
      !Array.isArray(value.issues) ||
      !value.issues.every(
        (issue) =>
          isRecord(issue) &&
          typeof issue.id === "string" &&
          /^I-\d{4,}$/.test(issue.id) &&
          typeof issue.execution === "string" &&
          EXECUTION_STATES.includes(issue.execution as ExecutionState) &&
          ((!Object.hasOwn(issue, "owner") && !Object.hasOwn(issue, "baseSha")) ||
            (typeof issue.owner === "string" &&
              !!issue.owner.trim() &&
              typeof issue.baseSha === "string" &&
              /^[0-9a-f]{40,64}$/i.test(issue.baseSha))) &&
          (!Object.hasOwn(issue, "acceptedEvidence") ||
            isAcceptedEvidence(issue.acceptedEvidence)) &&
          (!Object.hasOwn(issue, "integration") ||
            (issue.execution === "integrated" &&
              isIntegrationRecord(issue.integration) &&
              isAcceptedEvidence(issue.acceptedEvidence) &&
              JSON.stringify(issue.integration.files) ===
                JSON.stringify(issue.acceptedEvidence.files) &&
              issue.integration.contentDigest === issue.acceptedEvidence.contentDigest)) &&
          (!Object.hasOwn(issue, "reviewRequirements") ||
            (Array.isArray(issue.reviewRequirements) &&
              issue.reviewRequirements.every(isSpecialistReviewRequirement) &&
              new Set(issue.reviewRequirements.map((requirement) => requirement.agent)).size ===
                issue.reviewRequirements.length)) &&
          (!Object.hasOwn(issue, "checks") ||
            (isRecord(issue.checks) &&
              Array.isArray(issue.checks.required) &&
              issue.checks.required.every(isCheckRequirement) &&
              Array.isArray(issue.checks.records) &&
              issue.checks.records.every(isCheckRecord) &&
              (!Object.hasOwn(issue.checks, "invalidations") ||
                (Array.isArray(issue.checks.invalidations) &&
                  issue.checks.invalidations.every(isCheckGateInvalidation))))) &&
          (!Object.hasOwn(issue, "assignment") ||
            (isImplementationAssignment(issue.assignment) &&
              issue.assignment.report ===
                join(
                  this.app.workspaceRoot,
                  ".scratch",
                  feature,
                  "reports",
                  issue.assignment.action === "implement"
                    ? `${issue.id}-implementation.md`
                    : `${issue.id}-round-${issue.assignment.attempt}-fix.md`,
                ))) &&
          (!Object.hasOwn(issue, "correctionAttempts") ||
            (Array.isArray(issue.correctionAttempts) &&
              issue.correctionAttempts.every(isCorrectionAttempt) &&
              issue.correctionAttempts.every((attempt, index) => attempt.number === index + 1) &&
              issue.correctionAttempts.every(
                (attempt) =>
                  attempt.assignment.report ===
                    join(
                      this.app.workspaceRoot,
                      ".scratch",
                      feature,
                      "reports",
                      `${issue.id}-round-${attempt.number}-fix.md`,
                    ) &&
                  (!attempt.priorAssignment ||
                    attempt.priorAssignment.report ===
                      join(
                        this.app.workspaceRoot,
                        ".scratch",
                        feature,
                        "reports",
                        attempt.priorAssignment.action === "implement"
                          ? `${issue.id}-implementation.md`
                          : `${issue.id}-round-${attempt.priorAssignment.attempt}-fix.md`,
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
                          ? `${issue.id}-review-${assignment.id}.md`
                          : `${issue.id}-round-${assignment.attempt}-review-${assignment.id}.md`,
                      ),
                  ),
              ) &&
              hasMatchingCorrectionAttempt(issue))) &&
          (!Object.hasOwn(issue, "adjudication") || isCorrectionAdjudication(issue.adjudication)) &&
          (!Object.hasOwn(issue, "reviewAssignments") ||
            (Array.isArray(issue.reviewAssignments) &&
              issue.reviewAssignments.every(
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
                        ? `${issue.id}-review-${assignment.id}.md`
                        : `${issue.id}-round-${assignment.attempt}-review-${assignment.id}.md`,
                    ),
              ))) &&
          (!Object.hasOwn(issue, "reviewHistory") ||
            (Array.isArray(issue.reviewHistory) &&
              issue.reviewHistory.every(
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
                        ? `${issue.id}-review-${assignment.id}.md`
                        : `${issue.id}-round-${assignment.attempt}-review-${assignment.id}.md`,
                    ),
              ))) &&
          (!Object.hasOwn(issue, "requirementsDecisions") ||
            (Array.isArray(issue.requirementsDecisions) &&
              issue.requirementsDecisions.every(isRequirementsDecision))) &&
          (!Object.hasOwn(issue, "findings") ||
            (Array.isArray(issue.findings) && issue.findings.every(isReviewFinding))),
      )
    ) {
      throw new Error(
        "Feature issue records must contain an issue ID and a valid execution state.",
      );
    }
    if (
      new Set(value.issues.map((issue) => (issue as IssueProgress).id)).size !== value.issues.length
    ) {
      throw new Error("Feature ledger issue IDs must be unique.");
    }
    for (const issue of value.issues as IssueProgress[]) {
      for (const requirement of issue.reviewRequirements ?? []) {
        if (blueprintCatalog.agents[requirement.agent]?.canReview !== true) {
          throw new Error(
            `Required specialist agent '${requirement.agent}' is not explicitly marked review-eligible.`,
          );
        }
        if (
          (value.reviewPolicy as FeatureLedger["reviewPolicy"]).issue.includes(requirement.agent)
        ) {
          throw new Error(
            `Specialist reviewer '${requirement.agent}' duplicates the pinned issue review policy.`,
          );
        }
      }
      const findingIds = issue.findings?.map((finding) => finding.id) ?? [];
      if (new Set(findingIds).size !== findingIds.length) {
        throw new Error(`Finding IDs must be unique within issue ${issue.id}.`);
      }
      const decisionIds = issue.requirementsDecisions?.map((decision) => decision.id) ?? [];
      if (new Set(decisionIds).size !== decisionIds.length) {
        throw new Error(`Requirements decision IDs must be unique within issue ${issue.id}.`);
      }
      for (const finding of issue.findings ?? []) {
        if (
          finding.requirementsDecision &&
          !issue.requirementsDecisions?.some(
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
        ...(issue.reviewHistory ?? []),
        ...(issue.reviewAssignments ?? []),
      ]) {
        const reported = (issue.findings ?? []).filter((finding) =>
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
          const finding = (issue.findings ?? []).find((candidate) => candidate.id === id);
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
    const reviewAssignmentIds = value.issues.flatMap((issue) =>
      isRecord(issue)
        ? [
            ...(Array.isArray(issue.reviewHistory) ? issue.reviewHistory : []),
            ...(Array.isArray(issue.reviewAssignments) ? issue.reviewAssignments : []),
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
    for (const finding of delivery.findings ?? []) {
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
