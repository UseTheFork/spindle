import { isAbsolute } from "node:path";

import type {
  ApprovedTaskPlanException,
  ImplementationAssignment,
  CorrectionAttempt,
  CorrectionAdjudication,
} from "@spindle/SubagentDrivenDevelopment/Models/Assignments";
import { APPROVED_TASK_PLAN_EXCEPTION } from "@spindle/SubagentDrivenDevelopment/Models/Assignments";
import { CheckSchema } from "@spindle/SubagentDrivenDevelopment/Persistence/CheckSchema";
import { ReviewSchema } from "@spindle/SubagentDrivenDevelopment/Persistence/ReviewSchema";
import { Records } from "@spindle/Support/Records";

const isRecord = Records.isRecord;

export class AssignmentSchema {
  public static isImplementationAssignment(value: unknown): value is ImplementationAssignment {
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
      (Object.hasOwn(value, "workspace") &&
        (typeof value.workspace !== "string" || !isAbsolute(value.workspace))) ||
      (Object.hasOwn(value, "branch") &&
        (typeof value.branch !== "string" || !value.branch.trim())) ||
      (Object.hasOwn(value, "startingHeadSha") &&
        (typeof value.startingHeadSha !== "string" ||
          !/^[0-9a-f]{40,64}$/i.test(value.startingHeadSha))) ||
      (Object.hasOwn(value, "approvedExceptionId") &&
        (typeof value.approvedExceptionId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value.approvedExceptionId,
          ))) ||
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
          !(
            (typeof value.checkFailure === "string" && !!value.checkFailure.trim()) ||
            (typeof value.approvedExceptionId === "string" && value.findingIds.length === 0)
          )) ||
        (typeof value.approvedExceptionId === "string" &&
          (value.findingIds.length > 0 ||
            Object.hasOwn(value, "checkFailure") ||
            value.approvedExceptionId.trim() === "")) ||
        typeof value.objective !== "string" ||
        !value.objective.trim()
      ) {
        return false;
      }
    } else if (
      Object.hasOwn(value, "attempt") ||
      Object.hasOwn(value, "findingIds") ||
      Object.hasOwn(value, "checkFailure") ||
      Object.hasOwn(value, "objective") ||
      Object.hasOwn(value, "approvedExceptionId")
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

  public static isCorrectionAttempt(value: unknown): value is CorrectionAttempt {
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
        !(
          (typeof value.checkFailure === "string" && !!value.checkFailure.trim()) ||
          (typeof value.approvedExceptionId === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              value.approvedExceptionId,
            ))
        )) ||
      (typeof value.approvedExceptionId === "string" &&
        (value.findingIds.length > 0 || Object.hasOwn(value, "checkFailure"))) ||
      typeof value.objective !== "string" ||
      !value.objective.trim() ||
      typeof value.startedAt !== "string" ||
      !Number.isFinite(Date.parse(value.startedAt)) ||
      typeof value.startedBy !== "string" ||
      !value.startedBy.trim() ||
      typeof value.assignmentId !== "string" ||
      !value.assignmentId.trim() ||
      !AssignmentSchema.isImplementationAssignment(value.assignment) ||
      value.assignment.id !== value.assignmentId ||
      value.assignment.action !== "correct" ||
      value.assignment.attempt !== value.number ||
      value.approvedExceptionId !== value.assignment.approvedExceptionId ||
      (Object.hasOwn(value, "priorAssignment") &&
        !AssignmentSchema.isImplementationAssignment(value.priorAssignment)) ||
      (Object.hasOwn(value, "checks") &&
        (!Array.isArray(value.checks) || !value.checks.every(CheckSchema.isCheckRecord))) ||
      (Object.hasOwn(value, "reviewAssignments") &&
        (!Array.isArray(value.reviewAssignments) ||
          !value.reviewAssignments.every(ReviewSchema.isReviewAssignment)))
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
        !outcome.recordedBy.trim()
      ) {
        return false;
      }
    }
    return true;
  }

  public static isApprovedTaskPlanException(value: unknown): value is ApprovedTaskPlanException {
    const approval = isRecord(value) ? value.approval : undefined;
    return (
      isRecord(value) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value.id),
      ) &&
      value.feature === APPROVED_TASK_PLAN_EXCEPTION.feature &&
      value.ticket === APPROVED_TASK_PLAN_EXCEPTION.ticket &&
      value.recoveryTicket === APPROVED_TASK_PLAN_EXCEPTION.recoveryTicket &&
      value.scope === APPROVED_TASK_PLAN_EXCEPTION.scope &&
      isRecord(approval) &&
      approval.author === APPROVED_TASK_PLAN_EXCEPTION.approvalAuthor &&
      approval.date === APPROVED_TASK_PLAN_EXCEPTION.approvalDate &&
      approval.commentAt === APPROVED_TASK_PLAN_EXCEPTION.approvalCommentAt &&
      approval.quote === APPROVED_TASK_PLAN_EXCEPTION.approvalQuote &&
      approval.comment === APPROVED_TASK_PLAN_EXCEPTION.approvalComment &&
      approval.source === APPROVED_TASK_PLAN_EXCEPTION.approvalSource &&
      Object.keys(approval).every((key) =>
        ["author", "date", "commentAt", "quote", "comment", "source"].includes(key),
      ) &&
      typeof value.controller === "string" &&
      !!value.controller.trim() &&
      typeof value.recordedAt === "string" &&
      Number.isFinite(Date.parse(value.recordedAt)) &&
      typeof value.objective === "string" &&
      !!value.objective.trim() &&
      typeof value.assignmentId === "string" &&
      !!value.assignmentId.trim() &&
      Number.isSafeInteger(value.attempt) &&
      Number(value.attempt) > 0 &&
      isRecord(value.priorIntegration) &&
      isRecord(value.priorAcceptedEvidence)
    );
  }

  public static isCorrectionAdjudication(value: unknown): value is CorrectionAdjudication {
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

  public static hasMatchingCorrectionAttempt(ticket: Record<string, unknown>): boolean {
    const assignment = ticket.assignment;
    if (!AssignmentSchema.isImplementationAssignment(assignment) || assignment.action !== "correct")
      return true;
    const attempts = ticket.correctionAttempts;
    return (
      Array.isArray(attempts) &&
      attempts.some(
        (attempt) =>
          AssignmentSchema.isCorrectionAttempt(attempt) &&
          attempt.number === assignment.attempt &&
          attempt.assignmentId === assignment.id,
      )
    );
  }
}
