import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  cliOutput,
  execute,
  invokeAsync,
  prepareReviewAssignment,
  prepareImplementationForReview,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "@test/Helpers/SubagentDrivenDevelopment/StatusSummary";
import { expect, test } from "vitest";

test("review submission derives the report and canonical findings from its assignment", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nA blocking issue was found.\n");
  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      blocking: true,
      summary: "Acceptance regression",
      details: "The behavior violates an acceptance requirement.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);

  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "failed",
      details: "The registered blocker needs correction.",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  expect(JSON.parse(submitted.stdout)).toMatchObject({
    assignment: {
      id: assignment.id,
      report: assignment.report,
      result: "failed",
      findingIds: ["F-0001"],
    },
    report: assignment.report,
    execution: "changes-requested",
  });
  expect(JSON.parse(submitted.stdout).assignment).not.toHaveProperty("noFindings");
});

test("review submission derives canonical findings and cannot bypass unresolved blockers", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nA blocking ticket was found.\n");
  const createFinding = async (assignmentId = assignment.id) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        ticket: "T-0001",
        assignment: assignmentId,
        blocking: true,
        summary: "Acceptance regression",
        details: "The behavior violates an acceptance requirement.",
        author: "controller",
      }),
    );
  const created = await createFinding();
  expect(created.status, created.stderr).toBe(0);
  const submit = async () =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: assignment.id,
        result: "passed",
        author: "controller",
      }),
    );

  const wrongAssignment = await createFinding(
    join(repo, ".spindle/features", "0001-ticket-flow", "reports", "T-0001-implementation.md"),
  );
  expect(wrongAssignment.status).not.toBe(0);
  expect(wrongAssignment.stderr).toMatch(/review assignment not found for ticket T-0001/i);

  const registered = await submit();
  expect(registered.status, registered.stderr).toBe(0);
  const result = JSON.parse(registered.stdout).assignment as {
    result: string;
    findingIds?: string[];
  };
  expect(JSON.parse(registered.stdout).execution).toBe("changes-requested");
  expect(result.result).toBe("passed");
  expect(result.findingIds).toEqual(["F-0001"]);
  const repeatedSubmission = await submit();
  expect(repeatedSubmission.status, repeatedSubmission.stderr).toBe(0);
  expect(JSON.parse(repeatedSubmission.stdout).idempotent).toBe(true);

  const ledgerPath = join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].reviewAssignments[0].findingIds).toEqual(["F-0001"]);
  const accepted = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(accepted.status).not.toBe(0);
  expect(accepted.stderr).toMatch(/F-0001.*blocking|blocking.*F-0001/i);

  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(next.status, next.stderr).toBe(0);
  expect(status.status, status.stderr).toBe(0);
  expect(JSON.parse(next.stdout).actions).toEqual([
    { ticket: "T-0001", action: "adjudicate-findings" },
  ]);
  expect(JSON.stringify(JSON.parse(next.stdout).blockers)).toMatch(/F-0001/);
  expect(JSON.stringify(JSON.parse(status.stdout).blockers)).toMatch(/F-0001/);
  expect(JSON.parse(next.stdout).findings[0].finding.id).toBe("F-0001");
  expect(JSON.parse(status.stdout).findings[0].finding.id).toBe("F-0001");
});

test("submit rejects removed role, report, and finding declaration flags", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nNo findings were registered.\n");
  for (const [flag, value] of [
    ["--role", "review"],
    ["--report", assignment.report],
    ["--findings", "F-0001"],
    ["--no-findings", undefined],
  ] as const) {
    const submitted = await invokeAsync(repo, [
      "submit",
      "--feature",
      spec.replace(/\/spec\.md$/, ""),
      "--ticket",
      "T-0001",
      "--assignment",
      assignment.id,
      flag,
      ...(value ? [value] : []),
      "--actor",
      "controller",
    ]);
    expect(submitted.status).not.toBe(0);
    expect(submitted.stderr).toMatch(/unknown option/i);
  }
});

test("review submission permits flag-like text in a parsed option value", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nThe report is unavailable for review.\n");
  const details = "--findings";
  const submitted = await invokeAsync(repo, [
    "submit",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--assignment",
    assignment.id,
    "--result",
    "unavailable",
    "--details",
    details,
    "--actor",
    "controller",
  ]);

  expect(submitted.status, submitted.stderr).toBe(0);
  const result = cliOutput(submitted) as {
    execution: string;
    assignment: { findingIds?: string[]; details?: string };
  };
  expect(result.execution).toBe("reviewing");
  expect(result.assignment.findingIds).toEqual([]);
  expect(result.assignment.details).toBe(details);
});

test("a failed review needs a registered finding and an unavailable review re-dispatches its reviewer", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  const ledgerPath = join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json");
  writeFileSync(assignment.report, "# Review report\n\nThe reviewer stopped early.\n");
  const submit = async (id: string, result: "passed" | "failed" | "unavailable") =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: id,
        result,
        ...(result === "passed" ? {} : { details: "The reviewer could not finish." }),
        author: "controller",
      }),
    );
  const next = async () => {
    const result = await execute(repo, (service) => service.deliveryService.next({ spec }));
    expect(result.status, result.stderr).toBe(0);
    return nextSummary(JSON.parse(result.stdout)).join("\n");
  };

  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const failed = await submit(assignment.id, "failed");
  expect(failed.status).not.toBe(0);
  expect(failed.stderr).toMatch(/failed review requires at least one registered finding/i);
  expect(failed.stderr).toContain(`--assignment ${assignment.id}`);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);

  const unavailable = await submit(assignment.id, "unavailable");
  expect(unavailable.status, unavailable.stderr).toBe(0);
  expect(JSON.parse(unavailable.stdout).execution).toBe("reviewing");
  const guidance = await next();
  expect(guidance).toContain("T-0001: step ticket:review (ready)");
  expect(guidance).toContain(
    `Review ${assignment.id} (${assignment.agent}) was unavailable; dispatch a new review round for that reviewer.`,
  );
  expect(guidance).toContain(
    "Next: pnpm spindle sdd review --feature .spindle/features/0001-ticket-flow --ticket T-0001 --actor <acting-agent>",
  );
  expect(guidance).not.toContain("cannot accept findings");
  expect(guidance).not.toContain("sdd correct");

  const redispatched = await execute(repo, (service) =>
    service.reviewService.review({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(redispatched.status, redispatched.stderr).toBe(0);
  const replacement = JSON.parse(redispatched.stdout).assignments[0] as typeof assignment;
  expect(replacement.id).not.toBe(assignment.id);
  expect(replacement.report).not.toBe(assignment.report);
  expect(replacement).toMatchObject({
    agent: assignment.agent,
    scope: "initial",
    status: "pending",
  });
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].reviewHistory.map((item: { id: string }) => item.id)).toEqual([
    assignment.id,
  ]);
  expect(ledger.tickets[0].reviewAssignments.map((item: { id: string }) => item.id)).toEqual([
    replacement.id,
  ]);
  const repeated = await execute(repo, (service) =>
    service.reviewService.review({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout)).toMatchObject({ idempotent: true });
  expect(JSON.parse(repeated.stdout).assignments[0].id).toBe(replacement.id);

  writeFileSync(replacement.report, "# Review report\n\nNo defects found.\n");
  const passed = await submit(replacement.id, "passed");
  expect(passed.status, passed.stderr).toBe(0);
  expect(await next()).toContain(
    "Next: pnpm spindle sdd integrate --feature .spindle/features/0001-ticket-flow --ticket T-0001 --actor <acting-agent>",
  );
});

test("parallel ticket reviews all submit before the failed result requests correction", async () => {
  const { repo, spec, command } = await prepareImplementationForReview();
  const ledgerPath = join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json");
  const required = await execute(repo, (service) =>
    service.reviewService.reviewRequire({
      spec,
      ticket: "T-0001",
      type: "sdd-code-reviewer",
      details: "Check exported API compatibility.",
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  expect((await recordReviewCheck(repo, spec, command, "passed")).status).toBe(0);
  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({ spec, ticket: "T-0001", author: "controller" }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignments = JSON.parse(dispatched.stdout).assignments as {
    id: string;
    agent: string;
    report: string;
  }[];
  const general = assignments.find(({ agent }) => agent === "sdd-task-reviewer")!;
  const specialist = assignments.find(({ agent }) => agent === "sdd-code-reviewer")!;
  writeFileSync(general.report, "# Review\n\nA blocking defect.\n");
  writeFileSync(specialist.report, "# Specialist review\n\nNo API defects found.\n");
  const submit = async (id: string, result: "passed" | "failed") =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: id,
        result,
        ...(result === "failed" ? { details: "A blocking defect needs correction." } : {}),
        author: "controller",
      }),
    );
  const next = async () => {
    const result = await execute(repo, (service) => service.deliveryService.next({ spec }));
    expect(result.status, result.stderr).toBe(0);
    return nextSummary(JSON.parse(result.stdout)).join("\n");
  };

  const finding = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "T-0001",
      assignment: general.id,
      blocking: true,
      summary: "Blocking defect",
      details: "The implementation rejects valid input.",
      author: "controller",
    }),
  );
  expect(finding.status, finding.stderr).toBe(0);
  const failed = await submit(general.id, "failed");
  expect(failed.status, failed.stderr).toBe(0);
  expect(JSON.parse(failed.stdout).execution).toBe("reviewing");

  const waiting = await next();
  expect(waiting).toContain("T-0001: step ticket:review (awaiting report)");
  expect(waiting).toContain(
    `pnpm spindle sdd submit --feature .spindle/features/0001-ticket-flow --ticket T-0001 --assignment ${specialist.id} --result passed --actor <acting-agent>`,
  );
  expect(waiting).not.toContain("sdd correct");
  const earlyCorrection = await execute(repo, (service) =>
    service.correctionService.correct({
      spec,
      ticket: "T-0001",
      findings: ["F-0001"],
      details: "Accept valid input.",
      author: "controller",
    }),
  );
  expect(earlyCorrection.status).not.toBe(0);

  // Older ledgers entered changes-requested on the first failed review of a parallel batch.
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.tickets[0].execution = "changes-requested";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  execFileSync("git", ["add", ledgerPath], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "record legacy changes-requested review batch"], {
    cwd: repo,
  });
  const legacyStatus = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(legacyStatus.status, legacyStatus.stderr).toBe(0);
  const legacy = JSON.parse(legacyStatus.stdout) as {
    actions: { ticket: string; action: string }[];
    pendingAssignments: { id: string }[];
  };
  expect(legacy.actions).toEqual([{ ticket: "T-0001", action: "await-review-report" }]);
  expect(legacy.pendingAssignments.map(({ id }) => id)).toEqual([specialist.id]);
  const legacyNext = await next();
  expect(legacyNext).toContain(`--assignment ${specialist.id} --result passed`);
  expect(legacyNext).not.toContain("sdd correct");

  const remaining = await submit(specialist.id, "passed");
  expect(remaining.status, remaining.stderr).toBe(0);
  expect(JSON.parse(remaining.stdout).execution).toBe("changes-requested");
  const correction = await next();
  expect(correction).toContain("Unresolved findings need a disposition on T-0001:");
  expect(correction).toContain("--finding F-0001 --status confirmed");
});
