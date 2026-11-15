import type { ReviewAssignment } from "@/SubagentDrivenDevelopment/Models/Assignments";
import type { ReviewFinding } from "@/SubagentDrivenDevelopment/Models/Findings";
import type { TicketProgress } from "@/SubagentDrivenDevelopment/Models/Workflow";

export function currentReviewBatch(progress: TicketProgress): ReviewAssignment[] {
  return progress.assignment?.action === "correct"
    ? (progress.correctionAttempts?.at(-1)?.reviewAssignments ?? [])
    : (progress.reviewAssignments ?? []);
}

export function reviewBatchComplete(batch: ReviewAssignment[]): boolean {
  return batch.length > 0 && batch.every((assignment) => assignment.status === "submitted");
}

export function reviewBatchRequestsChanges(
  batch: ReviewAssignment[],
  findings: ReviewFinding[],
): boolean {
  if (!reviewBatchComplete(batch)) return false;
  if (batch.some((assignment) => assignment.result === "failed")) return true;
  const batchFindingIds = new Set(batch.flatMap((assignment) => assignment.findingIds ?? []));
  return findings.some(
    (finding) =>
      batchFindingIds.has(finding.id) &&
      finding.blocking &&
      finding.status !== "fixed" &&
      finding.status !== "dismissed",
  );
}

export function reviewBatchNeedsRedispatch(
  batch: ReviewAssignment[],
  findings: ReviewFinding[],
): boolean {
  return (
    reviewBatchComplete(batch) &&
    batch.some((assignment) => assignment.result === "unavailable") &&
    !reviewBatchRequestsChanges(batch, findings)
  );
}

export function failedReviewWithoutFindings(assignment: string, selection: string): string {
  return `A failed review requires at least one registered finding. Register each accepted finding with \`sdd finding create ${selection} --assignment ${assignment}\` before submitting, or submit --result unavailable when the report has no usable verdict so a new review can be dispatched.`;
}
