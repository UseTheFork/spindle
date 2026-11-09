import { isAbsolute } from "node:path";

import type {
  RequirementsDecision,
  ReviewFinding,
} from "@/SubagentDrivenDevelopment/Models/Findings";
import { Records } from "@/Support/Records";

const isRecord = Records.isRecord;

export function isReviewFinding(value: unknown): value is ReviewFinding {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    /^F-\d{4,}$/.test(value.id) &&
    (!Object.hasOwn(value, "relatedIssue") ||
      (typeof value.relatedIssue === "string" && /^I-\d{4,}$/.test(value.relatedIssue))) &&
    ["high", "medium", "low"].includes(String(value.severity)) &&
    typeof value.blocking === "boolean" &&
    ["open", "confirmed", "fixed", "dismissed", "deferred"].includes(String(value.status)) &&
    typeof value.summary === "string" &&
    !!value.summary.trim() &&
    typeof value.details === "string" &&
    !!value.details.trim() &&
    typeof value.author === "string" &&
    !!value.author.trim() &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    Array.isArray(value.provenance) &&
    value.provenance.length > 0 &&
    value.provenance.every(
      (source) =>
        isRecord(source) &&
        typeof source.report === "string" &&
        isAbsolute(source.report) &&
        typeof source.snapshot === "string" &&
        /^[0-9a-f]{64}$/i.test(source.snapshot) &&
        typeof source.author === "string" &&
        !!source.author.trim() &&
        typeof source.summary === "string" &&
        !!source.summary.trim() &&
        typeof source.details === "string" &&
        !!source.details.trim(),
    ) &&
    Array.isArray(value.history) &&
    value.history.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.at === "string" &&
        Number.isFinite(Date.parse(entry.at)) &&
        typeof entry.author === "string" &&
        !!entry.author.trim() &&
        typeof entry.action === "string" &&
        !!entry.action.trim() &&
        typeof entry.details === "string" &&
        !!entry.details.trim(),
    ) &&
    (value.status !== "dismissed" ||
      (typeof value.rulingDetails === "string" && !!value.rulingDetails.trim())) &&
    (value.status !== "deferred" ||
      (typeof value.rulingDetails === "string" &&
        !!value.rulingDetails.trim() &&
        typeof value.followUp === "string" &&
        !!value.followUp.trim())) &&
    (!Object.hasOwn(value, "requirementsDecision") ||
      (typeof value.requirementsDecision === "string" &&
        /^R-\d{4,}$/.test(value.requirementsDecision))) &&
    (value.status !== "fixed" ||
      (isRecord(value.verification) &&
        typeof value.verification.snapshot === "string" &&
        /^[0-9a-f]{64}$/i.test(value.verification.snapshot) &&
        Array.isArray(value.verification.checkCommands) &&
        value.verification.checkCommands.length > 0 &&
        value.verification.checkCommands.every(
          (command) => typeof command === "string" && !!command.trim(),
        ) &&
        typeof value.verification.verifiedAt === "string" &&
        Number.isFinite(Date.parse(value.verification.verifiedAt)) &&
        typeof value.verification.verifiedBy === "string" &&
        !!value.verification.verifiedBy.trim()))
  );
}

export function isRequirementsDecision(value: unknown): value is RequirementsDecision {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    /^R-\d{4,}$/.test(value.id) &&
    typeof value.finding === "string" &&
    /^F-\d{4,}$/.test(value.finding) &&
    ["approved", "rejected"].includes(String(value.status)) &&
    typeof value.details === "string" &&
    !!value.details.trim() &&
    typeof value.author === "string" &&
    !!value.author.trim() &&
    typeof value.requirementsSnapshot === "string" &&
    /^[0-9a-f]{64}$/i.test(value.requirementsSnapshot) &&
    typeof value.recordedAt === "string" &&
    Number.isFinite(Date.parse(value.recordedAt))
  );
}
