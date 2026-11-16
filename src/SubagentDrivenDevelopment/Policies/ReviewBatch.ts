import type { ReviewAssignment } from "@spindle/SubagentDrivenDevelopment/Models/Assignments";
import type { ReviewFinding } from "@spindle/SubagentDrivenDevelopment/Models/Findings";
import type { TicketProgress } from "@spindle/SubagentDrivenDevelopment/Models/Workflow";

export class ReviewBatch {
  public static currentReviewBatch(progress: TicketProgress): ReviewAssignment[] {
    return progress.assignment?.action === "correct"
      ? (progress.correctionAttempts?.at(-1)?.reviewAssignments ?? [])
      : (progress.reviewAssignments ?? []);
  }

  public static reviewBatchComplete(batch: ReviewAssignment[]): boolean {
    return batch.length > 0 && batch.every((assignment) => assignment.status === "submitted");
  }

  public static reviewBatchRequestsChanges(
    batch: ReviewAssignment[],
    findings: ReviewFinding[],
  ): boolean {
    if (!ReviewBatch.reviewBatchComplete(batch)) return false;
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

  public static reviewBatchNeedsRedispatch(
    batch: ReviewAssignment[],
    findings: ReviewFinding[],
  ): boolean {
    return (
      ReviewBatch.reviewBatchComplete(batch) &&
      batch.some((assignment) => assignment.result === "unavailable") &&
      !ReviewBatch.reviewBatchRequestsChanges(batch, findings)
    );
  }

  public static failedReviewWithoutFindings(assignment: string, selection: string): string {
    return `A failed review requires at least one registered finding. Register each accepted finding with \`sdd finding create ${selection} --assignment ${assignment}\` before submitting, or submit --result unavailable when the report has no usable verdict so a new review can be dispatched.`;
  }
}
