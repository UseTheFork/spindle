import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { execute, prepareReviewAssignment } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect, test } from "vitest";

test("review submission derives an empty findings list from assignment provenance and is idempotent", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nNo defects found.\n");
  const submit = async (assignmentId: string, result?: string) =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: assignmentId,
        ...(result ? { result } : {}),
        author: "controller",
      }),
    );

  const wrongAssignment = await submit(`${assignment.id}-other`, "passed");
  expect(wrongAssignment.status).not.toBe(0);
  expect(wrongAssignment.stderr).toMatch(/assignment/i);

  const missingResult = await submit(assignment.id);
  expect(missingResult.status).not.toBe(0);
  expect(missingResult.stderr).toMatch(/explicit --result/);

  const registered = await submit(assignment.id, "passed");
  expect(registered.status, registered.stderr).toBe(0);
  const result = JSON.parse(registered.stdout) as {
    execution: string;
    assignment: {
      id: string;
      status: string;
      result: string;
      findingIds: string[];
      headSha: string;
      reportSha256: string;
    };
  };
  expect(result.execution).toBe("reviewing");
  expect(result.assignment.id).toBe(assignment.id);
  expect(result.assignment.status).toBe("submitted");
  expect(result.assignment.result).toBe("passed");
  expect(result.assignment.findingIds).toEqual([]);
  expect(result.assignment.headSha).toBe(assignment.headSha);
  expect(result.assignment.reportSha256).toMatch(/^[0-9a-f]{64}$/);

  const repeated = await submit(assignment.id, "passed");
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  const ticketText = readFileSync(
    join(repo, ".spindle/features", "0001-ticket-flow", "tickets", "T-0001.md"),
    "utf8",
  );
  expect(ticketText.match(/Review report submitted for assignment/g)?.length).toBe(1);

  writeFileSync(assignment.report, "# Changed review report\n");
  const altered = await submit(assignment.id, "passed");
  expect(altered.status).not.toBe(0);
  expect(altered.stderr).toMatch(/changed after submission/);
});

test("failed review requires details and blocks integration", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nA blocking defect was found.\n");
  const submit = async (details?: string) =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: assignment.id,
        result: "failed",
        ...(details ? { details } : {}),
        author: "controller",
      }),
    );

  const missingDetails = await submit();
  expect(missingDetails.status).not.toBe(0);
  expect(missingDetails.stderr).toMatch(/--details/);
  const missingFinding = await submit("A blocking defect was found in the implementation.");
  expect(missingFinding.status).not.toBe(0);
  expect(missingFinding.stderr).toMatch(/failed review requires at least one registered finding/i);
  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      blocking: true,
      summary: "Blocking defect",
      details: "A blocking defect was found in the implementation.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const recordedFailure = await submit("A blocking defect was found in the implementation.");
  expect(recordedFailure.status, recordedFailure.stderr).toBe(0);
  const submitted = JSON.parse(recordedFailure.stdout).assignment;
  expect(submitted.result).toBe("failed");
  expect(submitted.findingIds).toEqual(["F-0001"]);
  expect(submitted.details).toBe("A blocking defect was found in the implementation.");
  expect(
    JSON.parse(
      readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
    ).tickets[0].reviewAssignments[0].details,
  ).toBe("A blocking defect was found in the implementation.");

  const integrated = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(integrated.status).not.toBe(0);
  expect(integrated.stderr).toMatch(/failed/);
});

test("unavailable review requires details and blocks integration", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nReview could not be completed.\n");
  const submit = async (details?: string) =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: assignment.id,
        result: "unavailable",
        ...(details ? { details } : {}),
        author: "controller",
      }),
    );

  const missingDetails = await submit();
  expect(missingDetails.status).not.toBe(0);
  expect(missingDetails.stderr).toMatch(/--details/);
  const recordedUnavailable = await submit("The reviewer could not assess whether findings exist.");
  expect(recordedUnavailable.status, recordedUnavailable.stderr).toBe(0);
  const submitted = JSON.parse(recordedUnavailable.stdout).assignment;
  expect(submitted.result).toBe("unavailable");
  expect(submitted.findingIds).toEqual([]);
  expect(submitted.details).toBe("The reviewer could not assess whether findings exist.");
  expect(
    JSON.parse(
      readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
    ).tickets[0].reviewAssignments[0].details,
  ).toBe("The reviewer could not assess whether findings exist.");

  const integrated = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(integrated.status).not.toBe(0);
  expect(integrated.stderr).toMatch(/unavailable/);
});

test("integration requires current checks and complete passing finding-free reviews", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nNo defects found.\n");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);

  const integrated = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(integrated.status, integrated.stderr).toBe(0);
  const result = JSON.parse(integrated.stdout) as {
    ticket: string;
    ticketCommit: string;
    mergeCommit: string;
    postMerge: string;
  };
  expect(result.ticket).toBe("T-0001");
  expect(result.ticketCommit).toMatch(/^[0-9a-f]{40,64}$/);
  expect(result.mergeCommit).toMatch(/^[0-9a-f]{40,64}$/);
  expect(result.postMerge).toBe("pending");
  expect(
    JSON.parse(
      readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
    ).tickets[0].execution,
  ).toBe("integrated");
  const repeated = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
});
