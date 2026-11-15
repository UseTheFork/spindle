import { isAbsolute } from "node:path";

import type {
  AcceptedEvidence,
  CheckRequirement,
  IntegrationRecord,
} from "@spindle/SubagentDrivenDevelopment/Models/Evidence";
import { EXECUTION_STATES } from "@spindle/SubagentDrivenDevelopment/Models/Workflow";
import type { DeliveryProgress } from "@spindle/SubagentDrivenDevelopment/Models/Workflow";
import { AssignmentSchema } from "@spindle/SubagentDrivenDevelopment/Persistence/AssignmentSchema";
import { CheckSchema } from "@spindle/SubagentDrivenDevelopment/Persistence/CheckSchema";
import { FindingSchema } from "@spindle/SubagentDrivenDevelopment/Persistence/FindingSchema";
import { ReviewSchema } from "@spindle/SubagentDrivenDevelopment/Persistence/ReviewSchema";
import { Records } from "@spindle/Support/Records";

const isRecord = Records.isRecord;

export class ProgressSchema {
  public static isDeliveryProgress(value: unknown): value is DeliveryProgress {
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
      (!Object.hasOwn(value, "owner") ||
        (typeof value.owner === "string" && !!value.owner.trim())) &&
      (!Object.hasOwn(value, "reviewRequirements") ||
        (Array.isArray(value.reviewRequirements) &&
          value.reviewRequirements.every(ReviewSchema.isSpecialistReviewRequirement))) &&
      (!Object.hasOwn(value, "reviewAssignments") ||
        (Array.isArray(value.reviewAssignments) &&
          value.reviewAssignments.every(ReviewSchema.isReviewAssignment))) &&
      (!Object.hasOwn(value, "reviewHistory") ||
        (Array.isArray(value.reviewHistory) &&
          value.reviewHistory.every(ReviewSchema.isReviewAssignment))) &&
      (!Object.hasOwn(value, "assignment") ||
        (AssignmentSchema.isImplementationAssignment(value.assignment) &&
          value.assignment.action === "correct")) &&
      (!Object.hasOwn(value, "requirementsDecisions") ||
        (Array.isArray(value.requirementsDecisions) &&
          value.requirementsDecisions.every(FindingSchema.isRequirementsDecision))) &&
      (!Object.hasOwn(value, "checks") ||
        (isRecord(value.checks) &&
          Array.isArray(value.checks.required) &&
          value.checks.required.every(CheckSchema.isCheckRequirement) &&
          Array.isArray(value.checks.records) &&
          value.checks.records.every(CheckSchema.isCheckRecord) &&
          !Object.hasOwn(value.checks, "invalidations"))) &&
      (!Object.hasOwn(value, "finalChecks") ||
        ProgressSchema.isFinalCheckRequirements(value.finalChecks)) &&
      (!Object.hasOwn(value, "findings") ||
        (Array.isArray(value.findings) && value.findings.every(FindingSchema.isReviewFinding))) &&
      (!Object.hasOwn(value, "correctionAttempts") ||
        (Array.isArray(value.correctionAttempts) &&
          value.correctionAttempts.every(AssignmentSchema.isCorrectionAttempt))) &&
      (!Object.hasOwn(value, "adjudication") ||
        AssignmentSchema.isCorrectionAdjudication(value.adjudication)) &&
      (!Object.hasOwn(value, "acceptedEvidence") ||
        ProgressSchema.isAcceptedEvidence(value.acceptedEvidence)) &&
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

  private static isFinalCheckRequirements(value: unknown): value is CheckRequirement[] {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      !value.every(ProgressSchema.isFinalCheckRequirement)
    ) {
      return false;
    }
    return new Set(value.map((item) => item.command)).size === value.length;
  }

  private static isFinalCheckRequirement(value: unknown): value is CheckRequirement {
    return (
      CheckSchema.isCheckRequirement(value) &&
      value.command === value.command.trim() &&
      value.removedAt === undefined &&
      value.removedBy === undefined &&
      value.removalDetails === undefined &&
      Object.keys(value).every((key) => ["command", "addedAt", "addedBy"].includes(key))
    );
  }

  public static isAcceptedEvidence(value: unknown): value is AcceptedEvidence {
    return (
      isRecord(value) &&
      typeof value.commitSha === "string" &&
      /^[0-9a-f]{40,64}$/i.test(value.commitSha) &&
      Array.isArray(value.files) &&
      value.files.length > 0 &&
      value.files.every(
        (path) => typeof path === "string" && CheckSchema.isSafeCoveragePath(path),
      ) &&
      new Set(value.files).size === value.files.length &&
      Object.keys(value).every((key) => ["commitSha", "files"].includes(key))
    );
  }

  public static isIntegrationRecord(value: unknown): value is IntegrationRecord {
    return (
      isRecord(value) &&
      typeof value.commitSha === "string" &&
      /^[0-9a-f]{40,64}$/i.test(value.commitSha) &&
      (!Object.hasOwn(value, "mergeSha") ||
        (typeof value.mergeSha === "string" && /^[0-9a-f]{40,64}$/i.test(value.mergeSha))) &&
      (!Object.hasOwn(value, "postMerge") ||
        (isRecord(value.postMerge) &&
          Object.keys(value.postMerge).every((key) =>
            ["status", "mergeSha", "checks"].includes(key),
          ) &&
          (value.postMerge.status === "pending" || value.postMerge.status === "passed") &&
          typeof value.mergeSha === "string" &&
          value.postMerge.mergeSha === value.mergeSha &&
          (!Object.hasOwn(value.postMerge, "checks") ||
            ProgressSchema.isPostMergeChecks(value.postMerge.checks, value.postMerge.status)) &&
          (value.postMerge.status !== "passed" || Object.hasOwn(value.postMerge, "checks")))) &&
      typeof value.integratedAt === "string" &&
      Number.isFinite(Date.parse(value.integratedAt)) &&
      typeof value.integratedBy === "string" &&
      !!value.integratedBy.trim() &&
      Array.isArray(value.files) &&
      value.files.length > 0 &&
      value.files.every(
        (path) => typeof path === "string" && CheckSchema.isSafeCoveragePath(path),
      ) &&
      new Set(value.files).size === value.files.length &&
      Object.keys(value).every((key) =>
        ["commitSha", "mergeSha", "postMerge", "integratedAt", "integratedBy", "files"].includes(
          key,
        ),
      )
    );
  }

  private static isPostMergeChecks(value: unknown, status: "pending" | "passed"): boolean {
    if (
      !isRecord(value) ||
      !Object.keys(value).every((key) => ["required", "records"].includes(key)) ||
      !Array.isArray(value.required) ||
      value.required.length === 0 ||
      !value.required.every(CheckSchema.isCheckRequirement) ||
      value.required.some(
        (item) =>
          item.command !== item.command.trim() ||
          !Object.keys(item).every((key) => ["command", "addedAt", "addedBy"].includes(key)),
      ) ||
      value.required.some(
        (item) =>
          item.removedAt !== undefined ||
          item.removedBy !== undefined ||
          item.removalDetails !== undefined,
      ) ||
      new Set(value.required.map((item) => item.command)).size !== value.required.length ||
      !Array.isArray(value.records) ||
      !value.records.every(CheckSchema.isCheckRecord) ||
      value.records.some(
        (record) =>
          !Object.keys(record).every((key) =>
            ["command", "result", "author", "headSha", "recordedAt", "details"].includes(key),
          ) || record.coveredPaths !== undefined,
      )
    )
      return false;
    const required = value.required;
    if (value.records.some((record) => !required.some((item) => item.command === record.command)))
      return false;
    if (status === "pending") return true;
    const records = value.records;
    const latest = value.required.map((item) =>
      [...records].reverse().find((record) => record.command === item.command),
    );
    return latest.every((record) => record?.result === "passed");
  }
}
