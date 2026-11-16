import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  commitTicketWorkspace,
  execute,
  prepareImplementationForReview,
  prepareReviewAssignment,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "@test/Helpers/SubagentDrivenDevelopment/StatusSummary";
import type { WorkflowServices } from "@test/Helpers/SubagentDrivenDevelopment/WorkflowServices";
import { expect, test } from "vitest";

test("correct persists a finding-scoped attempt before returning an idempotent fix assignment", async () => {
  const { repo, spec, assignment, ticketWorkspace } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA blocking ticket needs a fix.\n");
  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      blocking: true,
      summary: "Incorrect empty-input behavior",
      details: "The implementation rejects an input that the requirements allow.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const confirmedFinding = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      spec,
      ticket: "T-0001",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmedFinding.status, confirmedFinding.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "failed",
      details: "The implementation must be corrected.",
      author: "controller",
    }),
  );
  expect(failedReview.status, failedReview.stderr).toBe(0);

  const args = (service: WorkflowServices) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      findings: ["F-0001"],
      details: "Preserve the accepted empty-input behavior.",
      author: "controller",
    });
  const dispatched = await execute(repo, args);
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const first = JSON.parse(dispatched.stdout) as {
    execution: string;
    attempt: { number: number; findingIds: string[]; objective: string };
    assignment: { id: string; role: string; action: string; report: string; status: string };
  };
  expect(first.execution).toBe("implementing");
  expect(first.attempt.number).toBe(1);
  expect(first.attempt.findingIds).toEqual(["F-0001"]);
  expect(first.attempt.objective).toBe("Preserve the accepted empty-input behavior.");
  expect(first.assignment.role).toBe("implementation");
  expect(first.assignment.action).toBe("correct");
  expect(first.assignment.status).toBe("pending");
  expect(first.assignment.report).toMatch(/round-1-fix\.md$/);

  const resumed = await execute(repo, args);
  expect(resumed.status, resumed.stderr).toBe(0);
  const repeated = JSON.parse(resumed.stdout) as typeof first & { idempotent?: boolean };
  expect(repeated.idempotent).toBe(true);
  expect(repeated.attempt.number).toBe(1);
  expect(repeated.assignment.id).toBe(first.assignment.id);
  expect(repeated.assignment.report).toBe(first.assignment.report);

  const ledgerPath = join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  delete ledger.tickets[0].assignment.startingHeadSha;
  delete ledger.tickets[0].correctionAttempts[0].assignment.startingHeadSha;
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  execFileSync("git", ["add", ledgerPath], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "record legacy correction"], { cwd: repo });
  writeFileSync(first.assignment.report, "# Correction report\n\nCorrected the finding.\n");
  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(next.status, next.stderr).toBe(0);
  const nextText = nextSummary(JSON.parse(next.stdout)).join("\n");
  expect(nextText).toContain(
    "pnpm spindle sdd correct --feature .spindle/features/0001-ticket-flow --ticket T-0001 --findings F-0001 --details 'Preserve the accepted empty-input behavior.' --actor <acting-agent>",
  );
  expect(nextText).not.toContain("sdd submit");
  const legacy = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(legacy.status).not.toBe(0);
  expect(legacy.stderr).toMatch(/rerun the same sdd correct command/i);
  const recovered = await execute(repo, args);
  expect(recovered.status, recovered.stderr).toBe(0);
  expect(JSON.parse(recovered.stdout).assignment.startingHeadSha).toMatch(/^[a-f0-9]{40,64}$/);
  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = 'legacy fix';\n");
  commitTicketWorkspace(ticketWorkspace, "commit legacy correction");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
});

test("corrective implementation reports submit through the implementation evidence contract", async () => {
  const { repo, spec, assignment, ticketWorkspace } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Initial review\n\nA blocking ticket needs a fix.\n");
  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      blocking: true,
      summary: "Incorrect empty-input behavior",
      details: "The implementation rejects an input that the requirements allow.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const confirmedFinding = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      spec,
      ticket: "T-0001",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmedFinding.status, confirmedFinding.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "failed",
      details: "The implementation must be corrected.",
      author: "controller",
    }),
  );
  expect(failedReview.status, failedReview.stderr).toBe(0);

  const dispatched = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      findings: ["F-0001"],
      details: "Preserve the accepted empty-input behavior.",
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const fix = JSON.parse(dispatched.stdout).assignment as {
    id: string;
    action: string;
    report: string;
  };
  writeFileSync(fix.report, "# Correction report\n\nCorrected the finding.\n");
  const withoutCommit = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: fix.id,
      author: "controller",
    }),
  );
  expect(withoutCommit.status).not.toBe(0);
  expect(withoutCommit.stderr).toMatch(/no new commits/i);
  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = 'corrected';\n");
  commitTicketWorkspace(ticketWorkspace, "correct feature behavior");

  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: fix.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const result = JSON.parse(submitted.stdout) as {
    execution: string;
    assignment: { action: string; status: string };
  };
  expect(result.execution).toBe("reviewing");
  expect(result.assignment.action).toBe("correct");
  expect(result.assignment.status).toBe("submitted");
});

test("a current non-mechanical failed check can select a correction before initial review", async () => {
  const { repo, spec, command } = await prepareImplementationForReview();
  const failed = await recordReviewCheck(repo, spec, command, "failed");
  expect(failed.status, failed.stderr).toBe(0);

  const corrected = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      checkFailure: command,
      details: "Address the behavior exposed by the failing check.",
      author: "controller",
    }),
  );
  expect(corrected.status, corrected.stderr).toBe(0);
  const output = JSON.parse(corrected.stdout) as {
    attempt: { number: number; checkFailure: string; findingIds: string[] };
    assignment: { action: string; report: string };
  };
  expect(output.attempt.number).toBe(1);
  expect(output.attempt.checkFailure).toBe(command);
  expect(output.attempt.findingIds).toEqual([]);
  expect(output.assignment.action).toBe("correct");
  expect(output.assignment.report).toMatch(/round-1-fix\.md$/);
});
