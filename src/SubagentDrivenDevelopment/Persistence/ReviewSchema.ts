import { isAbsolute } from "node:path";

import type {
  ReviewAssignment,
  SpecialistReviewRequirement,
} from "@/SubagentDrivenDevelopment/Models/Assignments";
import { Records } from "@/Support/Records";

const isRecord = Records.isRecord;

export function isReviewAssignment(value: unknown): value is ReviewAssignment {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.agent !== "string" ||
    !value.agent.trim() ||
    value.role !== "review" ||
    !["initial", "corrective", "delivery"].includes(String(value.scope)) ||
    (value.scope === "corrective" &&
      (!Number.isSafeInteger(value.attempt) || Number(value.attempt) < 1)) ||
    (value.scope === "initial" && Object.hasOwn(value, "attempt")) ||
    (value.scope === "delivery" &&
      Object.hasOwn(value, "attempt") &&
      (!Number.isSafeInteger(value.attempt) || Number(value.attempt) < 1)) ||
    typeof value.headSha !== "string" ||
    !/^[0-9a-f]{40,64}$/i.test(value.headSha) ||
    (Object.hasOwn(value, "reworkBaseSha") &&
      (typeof value.reworkBaseSha !== "string" ||
        !/^[0-9a-f]{40,64}$/i.test(value.reworkBaseSha))) ||
    (Object.hasOwn(value, "workspace") &&
      (typeof value.workspace !== "string" || !isAbsolute(value.workspace))) ||
    (Object.hasOwn(value, "branch") &&
      (typeof value.branch !== "string" || !value.branch.trim())) ||
    !Array.isArray(value.inventory) ||
    !value.inventory.every((path) => typeof path === "string" && path.length > 0) ||
    new Set(value.inventory).size !== value.inventory.length ||
    (Object.hasOwn(value, "objective") &&
      (typeof value.objective !== "string" || !value.objective.trim())) ||
    (Object.hasOwn(value, "details") &&
      (typeof value.details !== "string" || !value.details.trim())) ||
    typeof value.report !== "string" ||
    !isAbsolute(value.report) ||
    typeof value.requestedAt !== "string" ||
    !Number.isFinite(Date.parse(value.requestedAt)) ||
    !["pending", "submitted"].includes(String(value.status))
  ) {
    return false;
  }
  if (value.status === "pending") return true;
  return (
    ["passed", "failed", "unavailable"].includes(String(value.result)) &&
    (value.noFindings === true
      ? value.findingIds === undefined
      : value.noFindings === undefined &&
        Array.isArray(value.findingIds) &&
        value.findingIds.length > 0 &&
        value.findingIds.every((id) => typeof id === "string" && /^F-\d{4,}$/.test(id)) &&
        new Set(value.findingIds).size === value.findingIds.length) &&
    typeof value.reportSha256 === "string" &&
    /^[0-9a-f]{64}$/i.test(value.reportSha256) &&
    typeof value.submittedAt === "string" &&
    Number.isFinite(Date.parse(value.submittedAt)) &&
    typeof value.submittedBy === "string" &&
    !!value.submittedBy.trim() &&
    (value.result === "passed" || (typeof value.details === "string" && !!value.details.trim()))
  );
}

export function isSpecialistReviewRequirement(
  value: unknown,
): value is SpecialistReviewRequirement {
  return (
    isRecord(value) &&
    typeof value.agent === "string" &&
    !!value.agent.trim() &&
    typeof value.details === "string" &&
    !!value.details.trim() &&
    typeof value.author === "string" &&
    !!value.author.trim() &&
    typeof value.requestedAt === "string" &&
    Number.isFinite(Date.parse(value.requestedAt))
  );
}
