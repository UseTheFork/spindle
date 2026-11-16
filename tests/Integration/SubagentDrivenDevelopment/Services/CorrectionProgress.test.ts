import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  commitTicketWorkspace,
  execute,
  prepareImplementationForReview,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect, test } from "vitest";

test("explicit progress assessments permit productive continuation beyond five attempts", async () => {
  const { repo, spec, command, ticketWorkspace } = await prepareImplementationForReview();
  const failed = await recordReviewCheck(repo, spec, command, "failed");
  expect(failed.status, failed.stderr).toBe(0);
  let correction = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      checkFailure: command,
      details: "Fix the first observed check failure.",
      author: "controller",
    }),
  );
  expect(correction.status, correction.stderr).toBe(0);
  let attemptNumber = 1;

  for (let nextAttempt = 1; nextAttempt <= 6; nextAttempt += 1) {
    const assigned = JSON.parse(correction.stdout).assignment as {
      id: string;
      report: string;
      attempt: number;
    };
    expect(assigned.attempt).toBe(nextAttempt);
    writeFileSync(join(ticketWorkspace, "feature.ts"), `export const feature = ${nextAttempt};\n`);
    commitTicketWorkspace(ticketWorkspace, `correction attempt ${nextAttempt}`);
    writeFileSync(assigned.report, `# Correction ${nextAttempt}\n\nProgress recorded.\n`);
    const submitted = await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: assigned.id,
        author: "controller",
      }),
    );
    expect(submitted.status, submitted.stderr).toBe(0);
    if (nextAttempt < 6) {
      const nextFailedCheck = await recordReviewCheck(repo, spec, command, "failed");
      expect(nextFailedCheck.status, nextFailedCheck.stderr).toBe(0);
      const unassessed = await execute(repo, (service) =>
        service.correctionService.correct({
          spec,
          ticket: "T-0001",
          checkFailure: command,
          details: `Address the newly observed behavior after correction ${nextAttempt}.`,
          decision: "continue",
          author: "controller",
        }),
      );
      expect(unassessed.status).not.toBe(0);
      expect(unassessed.stderr).toMatch(/assessment/i);
      correction = await execute(repo, (service) =>
        service.correctionService.correct({
          spec,
          ticket: "T-0001",
          checkFailure: command,
          details: `Address the newly observed behavior after correction ${nextAttempt}.`,
          decision: "continue",
          assessment: `Correction ${nextAttempt} changed the reviewed behavior; continue with the newly assessed failure.`,
          author: "controller",
        }),
      );
      expect(correction.status, correction.stderr).toBe(0);
      attemptNumber = JSON.parse(correction.stdout).attempt.number as number;
    }
  }

  expect(attemptNumber).toBe(6);
  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  const attempts = JSON.parse(resumed.stdout).correctionAttempts as {
    number: number;
    assignment: { status: string };
    progressAssessment?: { decision: string; details: string };
    checks?: unknown[];
  }[];
  expect(attempts.length).toBe(6);
  expect(attempts.map((attempt) => attempt.number)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(attempts.every((attempt) => attempt.assignment.status === "submitted")).toBeTruthy();
  expect(
    attempts.slice(0, 5).every((attempt) => attempt.progressAssessment?.decision === "continue"),
  ).toBeTruthy();
  expect(attempts.every((attempt) => (attempt.checks?.length ?? 0) > 0)).toBeTruthy();
});

test("a progress pause records adjudication and resume preserves it without dispatching a fix", async () => {
  const { repo, spec, command } = await prepareImplementationForReview();
  const failed = await recordReviewCheck(repo, spec, command, "failed");
  expect(failed.status, failed.stderr).toBe(0);

  const paused = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      decision: "pause",
      reason: "no-progress",
      details:
        "The repeated check failure has no demonstrated progress; request controller adjudication.",
      author: "controller",
    }),
  );
  expect(paused.status, paused.stderr).toBe(0);
  const pause = JSON.parse(paused.stdout) as {
    paused: boolean;
    adjudication: { status: string; reason: string; details: string };
    assignment?: unknown;
  };
  expect(pause.paused).toBe(true);
  expect(pause.adjudication.status).toBe("pending");
  expect(pause.adjudication.reason).toBe("no-progress");
  expect(pause.assignment).toBe(undefined);

  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  const resume = JSON.parse(resumed.stdout) as {
    adjudication?: { status: string; reason: string };
    correctionAttempts?: unknown[];
  };
  expect(resume.adjudication?.status).toBe("pending");
  expect(resume.adjudication?.reason).toBe("no-progress");
  expect(resume.correctionAttempts).toEqual([]);
});

test("continuing from a pause before any attempt resolves adjudication and permits later corrections", async () => {
  const { repo, spec, command, ticketWorkspace } = await prepareImplementationForReview();
  const failed = await recordReviewCheck(repo, spec, command, "failed");
  expect(failed.status, failed.stderr).toBe(0);
  const paused = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      decision: "pause",
      reason: "requirements-disagreement",
      details: "The failing check may contradict the requirements; request adjudication.",
      author: "controller",
    }),
  );
  expect(paused.status, paused.stderr).toBe(0);
  const pausedNext = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(pausedNext.status, pausedNext.stderr).toBe(0);
  expect(JSON.parse(pausedNext.stdout).actions).toContainEqual(
    expect.objectContaining({ ticket: "T-0001", action: "correct", continuationRequired: true }),
  );

  const assessment = "The requirements support the check; a correction can make progress.";
  const continued = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      checkFailure: command,
      details: "Satisfy the adjudicated check.",
      decision: "continue",
      assessment,
      author: "controller",
    }),
  );
  expect(continued.status, continued.stderr).toBe(0);
  const first = JSON.parse(continued.stdout) as {
    execution: string;
    attempt: { number: number; progressAssessment?: { details: string } };
    assignment: { id: string; report: string; attempt: number };
  };
  expect(first.execution).toBe("implementing");
  expect(first.attempt.number).toBe(1);
  expect(first.attempt.progressAssessment?.details).toBe(assessment);
  expect(first.assignment.report).toMatch(/round-1-fix\.md$/);

  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  const state = JSON.parse(resumed.stdout) as {
    adjudication: {
      status: string;
      reason: string;
      resolution?: { details: string; recordedBy: string };
    };
    correctionAttempts: { number: number }[];
  };
  expect(state.adjudication.status).toBe("resolved");
  expect(state.adjudication.reason).toBe("requirements-disagreement");
  expect(state.adjudication.resolution).toMatchObject({
    details: assessment,
    recordedBy: "controller",
  });
  expect(state.correctionAttempts.map(({ number }) => number)).toEqual([1]);

  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = 'adjudicated';\n");
  commitTicketWorkspace(ticketWorkspace, "adjudicated correction");
  writeFileSync(first.assignment.report, "# Correction 1\n\nProgress recorded.\n");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const failedAgain = await recordReviewCheck(repo, spec, command, "failed");
  expect(failedAgain.status, failedAgain.stderr).toBe(0);
  const secondAssessment = "Correction 1 changed the failure; continue with the new behavior.";
  const second = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      checkFailure: command,
      details: "Address the remaining check failure.",
      decision: "continue",
      assessment: secondAssessment,
      author: "controller",
    }),
  );
  expect(second.status, second.stderr).toBe(0);
  const secondOutput = JSON.parse(second.stdout) as {
    attempt: { number: number };
    assignment: { report: string };
  };
  expect(secondOutput.attempt.number).toBe(2);
  expect(secondOutput.assignment.report).toMatch(/round-2-fix\.md$/);
  const afterSecond = await execute(repo, (service) =>
    service.assignmentService.resume({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(afterSecond.status, afterSecond.stderr).toBe(0);
  const finalState = JSON.parse(afterSecond.stdout) as {
    adjudication: { status: string; resolution?: { details: string } };
    correctionAttempts: { number: number; progressAssessment?: { details: string } }[];
  };
  expect(finalState.correctionAttempts.map(({ number }) => number)).toEqual([1, 2]);
  expect(finalState.correctionAttempts[0]?.progressAssessment?.details).toBe(secondAssessment);
  expect(finalState.adjudication.status).toBe("resolved");
  expect(finalState.adjudication.resolution?.details).toBe(assessment);
});
