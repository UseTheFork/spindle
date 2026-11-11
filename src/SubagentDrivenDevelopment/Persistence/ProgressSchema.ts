import { isAbsolute } from "node:path";

import type {
  AcceptedEvidence,
  IntegrationRecord,
} from "@/SubagentDrivenDevelopment/Models/Evidence";
import { EXECUTION_STATES } from "@/SubagentDrivenDevelopment/Models/Workflow";
import type { DeliveryProgress } from "@/SubagentDrivenDevelopment/Models/Workflow";
import {
  isImplementationAssignment,
  isCorrectionAttempt,
  isCorrectionAdjudication,
} from "@/SubagentDrivenDevelopment/Persistence/AssignmentSchema";
import {
  isCheckRequirement,
  isCheckRecord,
  isCheckGateInvalidation,
  isSafeCoveragePath,
} from "@/SubagentDrivenDevelopment/Persistence/CheckSchema";
import {
  isReviewFinding,
  isRequirementsDecision,
} from "@/SubagentDrivenDevelopment/Persistence/FindingSchema";
import {
  isReviewAssignment,
  isSpecialistReviewRequirement,
} from "@/SubagentDrivenDevelopment/Persistence/ReviewSchema";
import { Records } from "@/Support/Records";

const isRecord = Records.isRecord;

export function isDeliveryProgress(value: unknown): value is DeliveryProgress {
  return (
    isRecord(value) &&
    (!Object.hasOwn(value, "status") || ["active", "complete"].includes(String(value.status))) &&
    typeof value.execution === "string" &&
    EXECUTION_STATES.some((state) => state === value.execution) &&
    Array.isArray(value.history) &&
    value.history.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.at === "string" &&
        Number.isFinite(Date.parse(entry.at)) &&
        typeof entry.author === "string" &&
        !!entry.author.trim() &&
        typeof entry.action === "string" &&
        !!entry.action.trim(),
    ) &&
    (!Object.hasOwn(value, "baseSha") ||
      (typeof value.baseSha === "string" && /^[0-9a-f]{40,64}$/i.test(value.baseSha))) &&
    (!Object.hasOwn(value, "owner") || (typeof value.owner === "string" && !!value.owner.trim())) &&
    (!Object.hasOwn(value, "reviewRequirements") ||
      (Array.isArray(value.reviewRequirements) &&
        value.reviewRequirements.every(isSpecialistReviewRequirement))) &&
    (!Object.hasOwn(value, "reviewAssignments") ||
      (Array.isArray(value.reviewAssignments) &&
        value.reviewAssignments.every(isReviewAssignment))) &&
    (!Object.hasOwn(value, "reviewHistory") ||
      (Array.isArray(value.reviewHistory) && value.reviewHistory.every(isReviewAssignment))) &&
    (!Object.hasOwn(value, "assignment") ||
      (isImplementationAssignment(value.assignment) && value.assignment.action === "correct")) &&
    (!Object.hasOwn(value, "requirementsDecisions") ||
      (Array.isArray(value.requirementsDecisions) &&
        value.requirementsDecisions.every(isRequirementsDecision))) &&
    (!Object.hasOwn(value, "checks") ||
      (isRecord(value.checks) &&
        Array.isArray(value.checks.required) &&
        value.checks.required.every(isCheckRequirement) &&
        Array.isArray(value.checks.records) &&
        value.checks.records.every(isCheckRecord) &&
        (!Object.hasOwn(value.checks, "invalidations") ||
          (Array.isArray(value.checks.invalidations) &&
            value.checks.invalidations.every(isCheckGateInvalidation))))) &&
    (!Object.hasOwn(value, "findings") ||
      (Array.isArray(value.findings) && value.findings.every(isReviewFinding))) &&
    (!Object.hasOwn(value, "correctionAttempts") ||
      (Array.isArray(value.correctionAttempts) &&
        value.correctionAttempts.every(isCorrectionAttempt))) &&
    (!Object.hasOwn(value, "adjudication") || isCorrectionAdjudication(value.adjudication)) &&
    (!Object.hasOwn(value, "acceptedEvidence") || isAcceptedEvidence(value.acceptedEvidence)) &&
    (!Object.hasOwn(value, "finished") ||
      (isRecord(value.finished) &&
        typeof value.finished.at === "string" &&
        Number.isFinite(Date.parse(value.finished.at)) &&
        typeof value.finished.author === "string" &&
        !!value.finished.author.trim() &&
        (!Object.hasOwn(value.finished, "report") ||
          (typeof value.finished.report === "string" && isAbsolute(value.finished.report))) &&
        (!Object.hasOwn(value.finished, "reportSha256") ||
          (typeof value.finished.reportSha256 === "string" &&
            /^[0-9a-f]{64}$/i.test(value.finished.reportSha256)))))
  );
}

export function isAcceptedEvidence(value: unknown): value is AcceptedEvidence {
  return (
    isRecord(value) &&
    typeof value.snapshot === "string" &&
    /^[0-9a-f]{64}$/i.test(value.snapshot) &&
    typeof value.codeSnapshot === "string" &&
    /^[0-9a-f]{64}$/i.test(value.codeSnapshot) &&
    typeof value.requirementsSnapshot === "string" &&
    /^[0-9a-f]{64}$/i.test(value.requirementsSnapshot) &&
    Array.isArray(value.files) &&
    value.files.length > 0 &&
    value.files.every((path) => typeof path === "string" && isSafeCoveragePath(path)) &&
    new Set(value.files).size === value.files.length &&
    typeof value.contentDigest === "string" &&
    /^[0-9a-f]{64}$/i.test(value.contentDigest)
  );
}

export function isIntegrationRecord(value: unknown): value is IntegrationRecord {
  return (
    isRecord(value) &&
    typeof value.commitSha === "string" &&
    /^[0-9a-f]{40,64}$/i.test(value.commitSha) &&
    (!Object.hasOwn(value, "mergeSha") ||
      (typeof value.mergeSha === "string" && /^[0-9a-f]{40,64}$/i.test(value.mergeSha))) &&
    (!Object.hasOwn(value, "postMerge") ||
      (isRecord(value.postMerge) &&
        value.postMerge.status === "pending" &&
        typeof value.mergeSha === "string" &&
        value.postMerge.mergeSha === value.mergeSha)) &&
    typeof value.integratedAt === "string" &&
    Number.isFinite(Date.parse(value.integratedAt)) &&
    typeof value.integratedBy === "string" &&
    !!value.integratedBy.trim() &&
    Array.isArray(value.files) &&
    value.files.length > 0 &&
    value.files.every((path) => typeof path === "string" && isSafeCoveragePath(path)) &&
    new Set(value.files).size === value.files.length &&
    typeof value.contentDigest === "string" &&
    /^[0-9a-f]{64}$/i.test(value.contentDigest)
  );
}
