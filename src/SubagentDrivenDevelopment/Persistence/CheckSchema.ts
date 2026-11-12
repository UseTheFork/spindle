import { isAbsolute } from "node:path";

import type { CheckRequirement, CheckRecord } from "@/SubagentDrivenDevelopment/Models/Evidence";
import { Records } from "@/Support/Records";

const isRecord = Records.isRecord;

export function isCheckRequirement(value: unknown): value is CheckRequirement {
  if (
    !isRecord(value) ||
    typeof value.command !== "string" ||
    !value.command.trim() ||
    typeof value.addedAt !== "string" ||
    !Number.isFinite(Date.parse(value.addedAt)) ||
    typeof value.addedBy !== "string" ||
    !value.addedBy.trim()
  ) {
    return false;
  }
  const removed = Object.hasOwn(value, "removedAt");
  return (
    (!removed && !Object.hasOwn(value, "removedBy") && !Object.hasOwn(value, "removalDetails")) ||
    (typeof value.removedAt === "string" &&
      Number.isFinite(Date.parse(value.removedAt)) &&
      typeof value.removedBy === "string" &&
      !!value.removedBy.trim() &&
      typeof value.removalDetails === "string" &&
      !!value.removalDetails.trim())
  );
}

export function isCheckRecord(value: unknown): value is CheckRecord {
  if (
    isRecord(value) &&
    typeof value.command === "string" &&
    !!value.command.trim() &&
    (value.result === "passed" || value.result === "failed" || value.result === "unavailable") &&
    typeof value.author === "string" &&
    !!value.author.trim() &&
    typeof value.snapshot === "string" &&
    /^[0-9a-f]{64}$/i.test(value.snapshot) &&
    typeof value.codeSnapshot === "string" &&
    /^[0-9a-f]{64}$/i.test(value.codeSnapshot) &&
    typeof value.requirementsSnapshot === "string" &&
    /^[0-9a-f]{64}$/i.test(value.requirementsSnapshot) &&
    typeof value.headSha === "string" &&
    /^[0-9a-f]{40,64}$/i.test(value.headSha) &&
    typeof value.recordedAt === "string" &&
    Number.isFinite(Date.parse(value.recordedAt)) &&
    (!Object.hasOwn(value, "details") ||
      (typeof value.details === "string" && !!value.details.trim())) &&
    (value.result === "passed" || (typeof value.details === "string" && !!value.details.trim()))
  ) {
    const hasScope =
      Object.hasOwn(value, "coveredPaths") || Object.hasOwn(value, "coverageSnapshot");
    return (
      !hasScope ||
      (Array.isArray(value.coveredPaths) &&
        value.coveredPaths.length > 0 &&
        value.coveredPaths.every(isSafeCoveragePath) &&
        new Set(value.coveredPaths).size === value.coveredPaths.length &&
        typeof value.coverageSnapshot === "string" &&
        /^[0-9a-f]{64}$/i.test(value.coverageSnapshot))
    );
  }
  return false;
}

export function isSafeCoveragePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !!value &&
    !isAbsolute(value) &&
    !value.includes("\\") &&
    value.split("/").every((segment) => !!segment && segment !== "." && segment !== "..") &&
    value !== ".scratch" &&
    !value.startsWith(".scratch/")
  );
}
