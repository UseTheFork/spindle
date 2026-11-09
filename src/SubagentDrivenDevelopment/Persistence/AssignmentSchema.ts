import { isAbsolute } from "node:path";

import type {
  ImplementationAssignment,
  CorrectionAttempt,
  CorrectionAdjudication,
} from "@/SubagentDrivenDevelopment/Models/Assignments";
import { isCheckRecord } from "@/SubagentDrivenDevelopment/Persistence/CheckSchema";
import { isReviewAssignment } from "@/SubagentDrivenDevelopment/Persistence/ReviewSchema";
import { Records } from "@/Support/Records";

const isRecord = Records.isRecord;

export function isImplementationAssignment(value: unknown): value is ImplementationAssignment {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    value.role !== "implementation" ||
    !["implement", "correct"].includes(String(value.action)) ||
    typeof value.controller !== "string" ||
    !value.controller.trim() ||
    typeof value.report !== "string" ||
    !isAbsolute(value.report) ||
    typeof value.requestedAt !== "string" ||
    !Number.isFinite(Date.parse(value.requestedAt)) ||
    !["pending", "submitted", "unavailable"].includes(String(value.status)) ||
    !Array.isArray(value.handoffs) ||
    !value.handoffs.every(
      (handoff) =>
        isRecord(handoff) &&
        typeof handoff.at === "string" &&
        Number.isFinite(Date.parse(handoff.at)) &&
        typeof handoff.from === "string" &&
        handoff.from.trim() &&
        typeof handoff.to === "string" &&
        handoff.to.trim() &&
        handoff.confirmedStopped === true,
    )
  ) {
    return false;
  }
  if (value.action === "correct") {
    if (
      !Number.isSafeInteger(value.attempt) ||
      Number(value.attempt) < 1 ||
      !Array.isArray(value.findingIds) ||
      !value.findingIds.every((id) => typeof id === "string" && /^F-\d{4,}$/.test(id)) ||
      new Set(value.findingIds).size !== value.findingIds.length ||
      (value.findingIds.length === 0 &&
        (typeof value.checkFailure !== "string" || !value.checkFailure.trim())) ||
      typeof value.objective !== "string" ||
      !value.objective.trim()
    ) {
      return false;
    }
  } else if (
    Object.hasOwn(value, "attempt") ||
    Object.hasOwn(value, "findingIds") ||
    Object.hasOwn(value, "checkFailure") ||
    Object.hasOwn(value, "objective")
  ) {
    return false;
  }
  if (value.status === "submitted") {
    return (
      typeof value.reportSha256 === "string" &&
      /^[0-9a-f]{64}$/i.test(value.reportSha256) &&
      typeof value.submittedAt === "string" &&
      Number.isFinite(Date.parse(value.submittedAt)) &&
      typeof value.submittedBy === "string" &&
      !!value.submittedBy.trim()
    );
  }
  if (value.status === "unavailable") {
    return typeof value.unavailableDetails === "string" && !!value.unavailableDetails.trim();
  }
  return true;
}

export function isCorrectionAttempt(value: unknown): value is CorrectionAttempt {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.number) ||
    Number(value.number) < 1 ||
    !Array.isArray(value.findingIds) ||
    !value.findingIds.every(
      (finding) => typeof finding === "string" && /^F-\d{4,}$/.test(finding),
    ) ||
    new Set(value.findingIds).size !== value.findingIds.length ||
    (value.findingIds.length === 0 &&
      (typeof value.checkFailure !== "string" || !value.checkFailure.trim())) ||
    typeof value.objective !== "string" ||
    !value.objective.trim() ||
    typeof value.startedAt !== "string" ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    typeof value.startedBy !== "string" ||
    !value.startedBy.trim() ||
    typeof value.assignmentId !== "string" ||
    !value.assignmentId.trim() ||
    !isImplementationAssignment(value.assignment) ||
    value.assignment.id !== value.assignmentId ||
    value.assignment.action !== "correct" ||
    value.assignment.attempt !== value.number ||
    (Object.hasOwn(value, "priorAssignment") &&
      !isImplementationAssignment(value.priorAssignment)) ||
    (Object.hasOwn(value, "checks") &&
      (!Array.isArray(value.checks) || !value.checks.every(isCheckRecord))) ||
    (Object.hasOwn(value, "reviewAssignments") &&
      (!Array.isArray(value.reviewAssignments) ||
        !value.reviewAssignments.every(isReviewAssignment)))
  ) {
    return false;
  }
  if (Object.hasOwn(value, "progressAssessment")) {
    const assessment = value.progressAssessment;
    if (
      !isRecord(assessment) ||
      assessment.decision !== "continue" ||
      assessment.result !== "productive" ||
      typeof assessment.details !== "string" ||
      !assessment.details.trim() ||
      typeof assessment.recordedAt !== "string" ||
      !Number.isFinite(Date.parse(assessment.recordedAt)) ||
      typeof assessment.recordedBy !== "string" ||
      !assessment.recordedBy.trim()
    ) {
      return false;
    }
  }
  if (Object.hasOwn(value, "outcome")) {
    const outcome = value.outcome;
    if (
      !isRecord(outcome) ||
      !["productive", "unproductive"].includes(String(outcome.result)) ||
      typeof outcome.details !== "string" ||
      !outcome.details.trim() ||
      typeof outcome.recordedAt !== "string" ||
      !Number.isFinite(Date.parse(outcome.recordedAt)) ||
      typeof outcome.recordedBy !== "string" ||
      !outcome.recordedBy.trim() ||
      (Object.hasOwn(outcome, "snapshot") &&
        (typeof outcome.snapshot !== "string" || !/^[0-9a-f]{64}$/i.test(outcome.snapshot)))
    ) {
      return false;
    }
  }
  return true;
}

export function isCorrectionAdjudication(value: unknown): value is CorrectionAdjudication {
  if (
    isRecord(value) &&
    ["pending", "resolved"].includes(String(value.status)) &&
    typeof value.reason === "string" &&
    !!value.reason.trim() &&
    typeof value.details === "string" &&
    !!value.details.trim() &&
    typeof value.recordedAt === "string" &&
    Number.isFinite(Date.parse(value.recordedAt)) &&
    typeof value.recordedBy === "string" &&
    !!value.recordedBy.trim()
  ) {
    return value.status === "pending"
      ? !Object.hasOwn(value, "resolution")
      : isRecord(value.resolution) &&
          typeof value.resolution.details === "string" &&
          !!value.resolution.details.trim() &&
          typeof value.resolution.recordedAt === "string" &&
          Number.isFinite(Date.parse(value.resolution.recordedAt)) &&
          typeof value.resolution.recordedBy === "string" &&
          !!value.resolution.recordedBy.trim();
  }
  return false;
}

export function hasMatchingCorrectionAttempt(ticket: Record<string, unknown>): boolean {
  const assignment = ticket.assignment;
  if (!isImplementationAssignment(assignment) || assignment.action !== "correct") return true;
  const attempts = ticket.correctionAttempts;
  return (
    Array.isArray(attempts) &&
    attempts.some(
      (attempt) =>
        isCorrectionAttempt(attempt) &&
        attempt.number === assignment.attempt &&
        attempt.assignmentId === assignment.id,
    )
  );
}
