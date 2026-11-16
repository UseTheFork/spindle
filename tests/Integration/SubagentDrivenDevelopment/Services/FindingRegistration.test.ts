import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  cliOutput,
  commitTicketWorkspace,
  execute,
  invokeAsync,
  prepareReviewAssignment,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import type { WorkflowServices } from "@test/Helpers/SubagentDrivenDevelopment/WorkflowServices";
import { expect, test } from "vitest";

test("finding registration is explicit, canonical, ticket-local, and idempotent", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nThe change has a defect.\n");
  const create = async (
    extra: Partial<Parameters<WorkflowServices["findingService"]["findingCreate"]>[0]> = {},
  ) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        ticket: "T-0001",
        assignment: assignment.id,
        blocking: true,
        summary: "Incorrect result for empty input",
        details: "The implementation returns a success result for empty input.",
        author: "controller",
        ...extra,
      }),
    );

  const registered = await create();
  expect(registered.status, registered.stderr).toBe(0);
  const output = JSON.parse(registered.stdout) as {
    finding: {
      id: string;
      blocking: boolean;
      status: string;
      summary: string;
      details: string;
      author: string;
      provenance: { report: string; headSha: string }[];
    };
  };
  expect(output.finding.id).toBe("F-0001");
  expect(output.finding).not.toHaveProperty("severity");
  expect(output.finding.blocking).toBe(true);
  expect(output.finding.status).toBe("open");
  expect(output.finding.summary).toBe("Incorrect result for empty input");
  expect(output.finding.details).toMatch(/empty input/);
  expect(output.finding.author).toBe("controller");
  expect(output.finding.provenance).toEqual([
    {
      report: assignment.report,
      headSha: assignment.headSha,
      author: "controller",
      summary: "Incorrect result for empty input",
      details: "The implementation returns a success result for empty input.",
    },
  ]);

  const repeated = await create();
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).finding.id).toBe("F-0001");
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);

  const cliRegistered = await invokeAsync(repo, [
    "finding",
    "create",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--assignment",
    assignment.id,
    "--non-blocking",
    "--summary",
    "A CLI-registered observation",
    "--details",
    "The orchestrator registered this from the assigned review.",
    "--actor",
    "controller",
  ]);
  expect(cliRegistered.status, cliRegistered.stderr).toBe(0);
  expect(cliOutput(cliRegistered).finding.provenance[0].report).toBe(assignment.report);

  const beforeLegacyOptions = readFileSync(
    join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"),
    "utf8",
  );
  const legacyOptions = await invokeAsync(repo, [
    "finding",
    "create",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--assignment",
    assignment.id,
    "--source",
    assignment.report,
    "--severity",
    "high",
    "--blocking",
    "--summary",
    "Legacy options",
    "--details",
    "This command must be rejected.",
    "--actor",
    "controller",
  ]);
  expect(legacyOptions.status).not.toBe(0);
  expect(legacyOptions.stderr).toMatch(/unknown option.*--source/i);
  expect(
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
  ).toBe(beforeLegacyOptions);
  const legacySeverity = await invokeAsync(repo, [
    "finding",
    "create",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--assignment",
    assignment.id,
    "--severity",
    "high",
    "--blocking",
    "--summary",
    "Legacy severity",
    "--details",
    "Severity is no longer an input.",
    "--actor",
    "controller",
  ]);
  expect(legacySeverity.status).not.toBe(0);
  expect(legacySeverity.stderr).toMatch(/unknown option.*--severity/i);
  expect(
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
  ).toBe(beforeLegacyOptions);

  const ledger = JSON.parse(
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.tickets[0].findings.length).toBe(2);
  expect(ledger.tickets[0].findings[0].id).toBe("F-0001");
  const ticketText = readFileSync(
    join(repo, ".spindle/features", "0001-ticket-flow", "tickets", "T-0001.md"),
    "utf8",
  );
  expect(ticketText).toMatch(/Finding F-0001 registered by controller/);

  const missingBlockingChoice = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      summary: "Missing blocking choice",
      details: "The blocking policy was omitted.",
      author: "controller",
    }),
  );
  expect(missingBlockingChoice.status).not.toBe(0);
  expect(missingBlockingChoice.stderr).toMatch(/--blocking or --non-blocking/);
  expect(
    JSON.parse(
      readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
    ).tickets[0].findings.length,
  ).toBe(2);
});

test("finding IDs restart per ticket and require provenance from that ticket's review", async () => {
  const { repo, spec, assignment, worktreeParent } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# First ticket review\n\nFinding from the first ticket.\n");
  const firstFinding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      nonBlocking: true,
      summary: "First ticket observation",
      details: "This observation belongs to ticket one.",
      author: "controller",
    }),
  );
  expect(firstFinding.status, firstFinding.stderr).toBe(0);
  expect(JSON.parse(firstFinding.stdout).finding.id).toBe("F-0001");
  const firstStatus = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(firstStatus.status, firstStatus.stderr).toBe(0);
  expect(JSON.parse(firstStatus.stdout).findings[0].finding.blocking).toBe(false);
  expect(
    JSON.parse(firstStatus.stdout).blockers.some((blocker: { reason: string }) =>
      /Finding F-0001/.test(blocker.reason),
    ),
  ).toBe(false);

  const created = await execute(repo, (service) =>
    service.ticketService.ticketCreate({
      spec,
      title: "Second ticket",
      reporter: "requester",
      category: "enhancement",
      author: "controller",
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const command = "just test::test tests/feature-two.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({ spec, ticket: "T-0002", command, author: "controller" }),
  );
  expect(required.status, required.stderr).toBe(0);
  const dispatched = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0002",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const implementation = await execute(repo, (service) =>
    service.assignmentService.implement({
      spec,
      ticket: "T-0002",
      author: "controller",
      workspace: worktreeParent,
    }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  const secondWorktree = JSON.parse(dispatched.stdout).assignment.workspace as string;
  writeFileSync(join(secondWorktree, "feature-two.ts"), "export const second = true;\n");
  commitTicketWorkspace(secondWorktree, "implement second ticket");
  const implementationAssignment = JSON.parse(implementation.stdout).assignment as {
    id: string;
    report: string;
  };
  writeFileSync(implementationAssignment.report, "# Second implementation\n\nCompleted.\n");
  const submittedImplementation = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0002",
      assignment: implementationAssignment.id,
      author: "controller",
    }),
  );
  expect(submittedImplementation.status, submittedImplementation.stderr).toBe(0);
  const check = await execute(repo, (service) =>
    service.checksService.checksRecord({
      spec,
      ticket: "T-0002",
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(check.status, check.stderr).toBe(0);
  expect(JSON.parse(check.stdout).record.headSha).toBe(
    JSON.parse(submittedImplementation.stdout).headSha,
  );
  const review = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0002",
      author: "controller",
    }),
  );
  expect(review.status, review.stderr).toBe(0);
  const secondAssignment = JSON.parse(review.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  writeFileSync(secondAssignment.report, "# Second ticket review\n\nFinding from ticket two.\n");
  const wrongTicketAssignment = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0002",
      assignment: assignment.id,
      blocking: true,
      summary: "Wrong ticket assignment",
      details: "This review assignment belongs to T-0001.",
      author: "controller",
    }),
  );
  expect(wrongTicketAssignment.status).not.toBe(0);
  expect(wrongTicketAssignment.stderr).toMatch(/review assignment not found for ticket T-0002/i);
  const secondFinding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0002",
      assignment: secondAssignment.id,
      blocking: true,
      summary: "Second ticket observation",
      details: "This observation belongs to ticket two.",
      author: "controller",
    }),
  );
  expect(secondFinding.status, secondFinding.stderr).toBe(0);
  expect(JSON.parse(secondFinding.stdout).finding.id).toBe("F-0001");
  expect(JSON.parse(secondFinding.stdout).finding.blocking).toBe(true);
});

test("finding duplicates link explicitly while preserving every source report provenance", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  const ledgerPath = join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const secondId = "review-two";
  const secondReport = join(
    repo,
    ".spindle/features",
    "0001-ticket-flow",
    "reports",
    `T-0001-review-${secondId}.md`,
  );
  const secondAssignment = {
    ...ledger.tickets[0].reviewAssignments[0],
    id: secondId,
    report: secondReport,
  };
  ledger.tickets[0].reviewAssignments.push(secondAssignment);
  const thirdId = "review-three";
  const thirdReport = join(
    repo,
    ".spindle/features",
    "0001-ticket-flow",
    "reports",
    `T-0001-review-${thirdId}.md`,
  );
  ledger.tickets[0].reviewAssignments.push({
    ...secondAssignment,
    id: thirdId,
    report: thirdReport,
  });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  writeFileSync(assignment.report, "# First review\n\nA duplicated observation.\n");
  writeFileSync(secondReport, "# Second review\n\nThe same defect is observed.\n");
  writeFileSync(thirdReport, "# Third review\n\nThe same defect is observed.\n");

  const create = async (
    assignmentId: string,
    extra: Partial<Parameters<WorkflowServices["findingService"]["findingCreate"]>[0]> = {},
  ) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        ticket: "T-0001",
        assignment: assignmentId,
        nonBlocking: true,
        summary: "Same underlying observation",
        details: "Both reports identify the same behavior.",
        ...extra,
        author: "controller",
      }),
    );

  const first = await create(assignment.id);
  expect(first.status, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout).finding.id).toBe("F-0001");

  const linked = await create(secondId, { link: "F-0001" });
  expect(linked.status, linked.stderr).toBe(0);
  expect(JSON.parse(linked.stdout).finding.id).toBe("F-0001");
  expect(JSON.parse(linked.stdout).finding.provenance).toEqual([
    {
      report: assignment.report,
      headSha: assignment.headSha,
      author: "controller",
      summary: "Same underlying observation",
      details: "Both reports identify the same behavior.",
    },
    {
      report: secondReport,
      headSha: assignment.headSha,
      author: "controller",
      summary: "Same underlying observation",
      details: "Both reports identify the same behavior.",
    },
  ]);
  expect(JSON.parse(linked.stdout).idempotent).toBe(undefined);

  const repeatedLink = await create(secondId, { link: "F-0001" });
  expect(repeatedLink.status, repeatedLink.stderr).toBe(0);
  expect(JSON.parse(repeatedLink.stdout).idempotent).toBe(true);

  const independent = await create(thirdId);
  expect(independent.status, independent.stderr).toBe(0);
  expect(JSON.parse(independent.stdout).finding.id).toBe("F-0002");
  const persisted = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(persisted.tickets[0].findings.length).toBe(2);
  expect(persisted.tickets[0].findings[0].provenance.length).toBe(2);
});
