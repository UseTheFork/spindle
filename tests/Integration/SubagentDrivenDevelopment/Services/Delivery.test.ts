import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

import { runCli } from "../../../Helpers/Cli";
import {
  cliOutput,
  claimDelivery,
  commitTicketWorkspace,
  execute,
  commitRequirement,
  invokeAsync,
  integrateReviewedTicket,
  beginDeliveryFinalization,
  completeDeliveryFinalization,
  declareFinalDeliveryChecks,
  finalizeDelivery,
  recordFinalDeliveryCheck,
  recordDeliveryCheck,
  recordReviewCheck,
  prepareIntegratedTicket,
  prepareReviewedTicket,
  prepareDeliveryReady,
} from "../../../Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "../../../Helpers/SubagentDrivenDevelopment/StatusSummary";

vi.setConfig({ testTimeout: 60_000 });

test("finish reports pending final validation without claiming the feature is complete", async () => {
  const prepared = await prepareDeliveryReady();
  await beginDeliveryFinalization(prepared);
  const settingsPath = join(prepared.repo, ".github", "spindle.json");
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  settings.spindle_package_manager = "npm run";
  writeFileSync(settingsPath, JSON.stringify(settings));
  const featureDirectory = prepared.spec.replace(/\/spec\.md$/, "");
  const result = runCli(
    prepared.repo,
    ["sdd", "finish", "--feature", featureDirectory, "--actor", "controller"],
    process.env.PATH ?? "",
  );

  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toMatch(/final validation is pending/i);
  expect(result.stdout).toContain("npm run spindle sdd checks record");
  expect(result.stdout).not.toMatch(/Finished feature delivery/i);
});

test("delivery checks retry unavailable results and recover legacy unavailable state", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await claimDelivery(repo, spec);
  const command = "pnpm run test:delivery";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({
      ticket: "",
      spec,
      scope: "delivery",
      command,
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  const unavailable = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      command,
      result: "unavailable",
      details: "The test service is unavailable.",
      author: "controller",
    }),
  );
  expect(unavailable.status, unavailable.stderr).toBe(0);
  const next = async () => {
    const result = await execute(repo, (service) => service.deliveryService.next({ spec }));
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  };
  let state = await next();
  expect(state.delivery.execution).toBe("unstarted");
  expect(state.delivery.action).toBe("record-final-checks");
  expect(nextSummary(state).join("\n")).toContain(
    "pnpm spindle sdd checks record --feature .scratch/0001-ticket-flow --scope delivery --command 'pnpm run test:delivery' --result passed --actor <acting-agent>",
  );

  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const setLegacyState = () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    ledger.delivery.execution = "changes-requested";
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    execFileSync("git", ["add", ledgerPath], { cwd: repo });
    execFileSync("git", ["commit", "-qm", "record legacy unavailable state"], { cwd: repo });
  };
  setLegacyState();
  state = await next();
  expect(state.delivery.action).toBe("record-final-checks");
  expect(nextSummary(state).join("\n")).toContain("Run delivery check: pnpm run test:delivery");

  const passed = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(passed.status, passed.stderr).toBe(0);
  state = await next();
  expect(state.delivery.execution).toBe("unstarted");
  expect(state.delivery.action).toBe("review");

  setLegacyState();
  state = await next();
  expect(state.delivery.action).toBe("review");
  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ ticket: "", spec, scope: "delivery", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(JSON.parse(resumed.stdout).nextAction).toBe("review");
  const review = await execute(repo, (service) =>
    service.reviewService.review({ spec, scope: "delivery", author: "controller" }),
  );
  expect(review.status, review.stderr).toBe(0);
  const reviewAssignment = JSON.parse(review.stdout).assignments[0] as { id: string };
  const unavailableDuringReview = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      command,
      result: "unavailable",
      details: "The test service is unavailable again.",
      author: "controller",
    }),
  );
  expect(unavailableDuringReview.status, unavailableDuringReview.stderr).toBe(0);
  state = await next();
  expect(state.delivery.execution).toBe("reviewing");
  expect(state.delivery.action).toBe("record-final-checks");
  expect(nextSummary(state).join("\n")).toContain("Run delivery check: pnpm run test:delivery");
  expect(nextSummary(state).join("\n")).not.toContain("Wait for the open assignments.");
  const retriedDuringReview = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(retriedDuringReview.status, retriedDuringReview.stderr).toBe(0);
  state = await next();
  expect(state.delivery.action).toBe("await-review-report");
  expect(state.pendingAssignments).toContainEqual(
    expect.objectContaining({ id: reviewAssignment.id, status: "pending" }),
  );
});

test("retrying an unavailable delivery check preserves a separate failed check", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await claimDelivery(repo, spec);
  for (const command of ["failed check", "unavailable check"]) {
    const required = await execute(repo, (service) =>
      service.checksService.checksRequire({
        ticket: "",
        spec,
        scope: "delivery",
        command,
        author: "controller",
      }),
    );
    expect(required.status, required.stderr).toBe(0);
  }
  for (const [command, result] of [
    ["failed check", "failed"],
    ["unavailable check", "unavailable"],
    ["unavailable check", "passed"],
  ] as const) {
    const recorded = await execute(repo, (service) =>
      service.checksService.checksRecord({
        ticket: "",
        spec,
        scope: "delivery",
        command,
        result,
        ...(result === "passed" ? {} : { details: `${command} did not pass.` }),
        author: "controller",
      }),
    );
    expect(recorded.status, recorded.stderr).toBe(0);
    if (result === "unavailable") {
      const duringRetry = await execute(repo, (service) => service.deliveryService.next({ spec }));
      expect(duringRetry.status, duringRetry.stderr).toBe(0);
      expect(nextSummary(JSON.parse(duringRetry.stdout)).join("\n")).toContain(
        `Run delivery check: ${command}`,
      );
    }
  }
  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(next.status, next.stderr).toBe(0);
  const status = JSON.parse(next.stdout);
  expect(status.delivery.execution).toBe("changes-requested");
  expect(status.delivery.action).toBe("correct");
  expect(nextSummary(status).join("\n")).toContain("--check-failure 'failed check'");
});

test("delivery next ignores a superseded failure on the same check", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await claimDelivery(repo, spec);
  const command = "pnpm run test:delivery";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({
      ticket: "",
      spec,
      scope: "delivery",
      command,
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  for (const result of ["failed", "unavailable", "passed"] as const) {
    const recorded = await execute(repo, (service) =>
      service.checksService.checksRecord({
        ticket: "",
        spec,
        scope: "delivery",
        command,
        result,
        ...(result === "passed" ? {} : { details: `${result} result` }),
        author: "controller",
      }),
    );
    expect(recorded.status, recorded.stderr).toBe(0);
    const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
    expect(next.status, next.stderr).toBe(0);
    const state = JSON.parse(next.stdout);
    const summary = nextSummary(state).join("\n");
    if (result === "failed") {
      expect(state.delivery.action).toBe("correct");
      expect(summary).toContain("--check-failure 'pnpm run test:delivery'");
    } else {
      expect(summary).not.toContain("--check-failure 'pnpm run test:delivery'");
      expect(state.delivery.action).toBe(
        result === "unavailable" ? "record-final-checks" : "review",
      );
      if (result === "unavailable") expect(summary).toContain(`Run delivery check: ${command}`);
    }
  }
});

test("delivery review requires an exclusive delivery scope and assigns all required reviewers", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await recordDeliveryCheck(repo, spec);

  const required = await execute(repo, (service) =>
    service.reviewService.reviewRequire({
      spec,
      scope: "delivery",
      type: "sdd-code-reviewer",
      details: "Review compatibility across the integrated ticket boundaries.",
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);

  const conflictingScope = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(conflictingScope.status).not.toBe(0);
  expect(conflictingScope.stderr).toMatch(/mutually exclusive|exactly one.*scope/i);

  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const output = JSON.parse(dispatched.stdout) as {
    scope: string;
    assignments: {
      id: string;
      agent: string;
      headSha: string;
      role: string;
      scope: string;
      report: string;
      status: string;
    }[];
  };
  expect(output.scope).toBe("delivery");
  expect(
    output.assignments.map(({ agent, role, scope, status }) => ({
      agent,
      role,
      scope,
      status,
    })),
  ).toEqual([
    { agent: "sdd-reviewer", role: "review", scope: "delivery", status: "pending" },
    { agent: "sdd-code-reviewer", role: "review", scope: "delivery", status: "pending" },
  ]);
  expect(new Set(output.assignments.map(({ id }) => id)).size).toBe(2);
  expect(new Set(output.assignments.map(({ report }) => report)).size).toBe(2);
  expect(output.assignments.every(({ headSha }) => /^[0-9a-f]{40,64}$/.test(headSha))).toBeTruthy();

  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.reviewAssignments.length).toBe(2);
  expect(
    ledger.tickets[0].reviewAssignments.every(
      (assignment: { scope: string }) => assignment.scope !== "delivery",
    ),
  ).toBeTruthy();
});

test("delivery review requires passing post-merge evidence for each ticket's current merge", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await claimDelivery(repo, spec);
  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const validLedger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const validIntegration = JSON.parse(JSON.stringify(validLedger.tickets[0].integration));
  expect(validIntegration.postMerge.status).toBe("passed");
  expect(validIntegration.postMerge.mergeSha).toBe(validIntegration.mergeSha);
  const review = () =>
    execute(repo, (service) =>
      service.reviewService.review({
        spec,
        scope: "delivery",
        author: "controller",
      }),
    );
  const saveLedger = (ledger: unknown) =>
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

  delete validLedger.tickets[0].integration.postMerge;
  saveLedger(validLedger);
  const missingEvidence = await review();
  expect(missingEvidence.status).not.toBe(0);
  expect(missingEvidence.stderr).toMatch(/passing ticket post-merge validation: T-0001/i);

  validLedger.tickets[0].integration.postMerge = {
    ...validIntegration.postMerge,
    status: "pending",
  };
  saveLedger(validLedger);
  const pendingEvidence = await review();
  expect(pendingEvidence.status).not.toBe(0);
  expect(pendingEvidence.stderr).toMatch(/passing ticket post-merge validation: T-0001/i);

  validLedger.tickets[0].integration = validIntegration;
  saveLedger(validLedger);
  await recordDeliveryCheck(repo, spec);
  const acceptedEvidence = await review();
  expect(acceptedEvidence.status, acceptedEvidence.stderr).toBe(0);
});

test("blocking delivery findings reopen their related ticket after all required reviews submit", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await recordDeliveryCheck(repo, spec);

  const requested = await execute(repo, (service) =>
    service.reviewService.reviewRequire({
      spec,
      scope: "delivery",
      type: "sdd-code-reviewer",
      details: "Check cross-ticket compatibility.",
      author: "controller",
    }),
  );
  expect(requested.status, requested.stderr).toBe(0);
  const reviewed = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);
  const assignments = JSON.parse(reviewed.stdout).assignments as {
    id: string;
    agent: string;
    headSha: string;
    report: string;
  }[];
  const comprehensive = assignments.find(({ agent }) => agent === "sdd-reviewer")!;
  const specialist = assignments.find(({ agent }) => agent === "sdd-code-reviewer")!;
  writeFileSync(comprehensive.report, "# Aggregate review\n\nCross-ticket note.\n");
  writeFileSync(specialist.report, "# Specialist review\n\nNo additional findings.\n");

  const registered = await execute(repo, (service) =>
    service.findingService.findingCreate({
      ticket: "",
      spec,
      scope: "delivery",
      relatedTicket: "T-0001",
      assignment: comprehensive.id,
      blocking: true,
      summary: "Cross-ticket behavior needs documentation",
      details: "The integrated tickets use inconsistent names for the same behavior.",
      author: "controller",
    }),
  );
  expect(registered.status, registered.stderr).toBe(0);
  const finding = JSON.parse(registered.stdout).finding as {
    id: string;
    provenance: { report: string; headSha: string }[];
  };
  expect(finding.id).toBe("F-0001");
  expect(finding.provenance.map(({ report, headSha }) => ({ report, headSha }))).toEqual([
    { report: comprehensive.report, headSha: comprehensive.headSha },
  ]);

  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: comprehensive.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const repeated = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: comprehensive.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);

  const specialistSubmission = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: specialist.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(specialistSubmission.status, specialistSubmission.stderr).toBe(0);
  const confirmed = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      ticket: "",
      spec,
      scope: "delivery",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmed.status, confirmed.stderr).toBe(0);
  expect(JSON.parse(confirmed.stdout).finding.status).toBe("confirmed");
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.findings.map((item: { id: string }) => item.id)).toEqual(["F-0001"]);
  expect(ledger.delivery.findings[0].relatedTicket).toBe("T-0001");
  expect(ledger.tickets[0].status).toBe("open");
  expect(ledger.tickets[0].findings).toBe(undefined);
  expect(ledger.delivery.findings[0].history.at(-1).action).toBe("status:confirmed");
  expect(ledger.delivery.reviewAssignments.map((item: { status: string }) => item.status)).toEqual([
    "submitted",
    "submitted",
  ]);
});

test("delivery checks use their own current commit and stale aggregate checks block review", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await claimDelivery(repo, spec);

  const command = "just test::test tests/whole-feature.test.ts";
  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({
      ticket: "",
      spec,
      scope: "delivery",
      command,
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  const requiredIdentity = JSON.parse(required.stdout) as { headSha: string };
  expect(requiredIdentity.headSha).toMatch(/^[0-9a-f]{40,64}$/);

  const failed = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      command,
      result: "failed",
      details: "The aggregate test failed.",
      author: "controller",
    }),
  );
  expect(failed.status, failed.stderr).toBe(0);
  const failureNext = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(failureNext.status, failureNext.stderr).toBe(0);
  expect(JSON.parse(failureNext.stdout)).toMatchObject({
    delivery: { action: "correct" },
  });

  const recorded = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      command,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);
  expect(JSON.parse(recorded.stdout).record.result).toBe("passed");

  writeFileSync(
    join(repo, "feature.ts"),
    "export const feature = 'changed after aggregate check';\n",
  );
  execFileSync("git", ["add", "feature.ts"], { cwd: repo });
  execFileSync("git", ["commit", "-qm", "change code after aggregate check"], { cwd: repo });
  const staleReview = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(staleReview.status).not.toBe(0);
  expect(staleReview.stderr).toMatch(/delivery check .*stale|current.*checks/i);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.checks.records.length).toBe(2);
  expect(ledger.delivery.reviewAssignments).toBe(undefined);
});

test("pending delivery review waits for its report and guides finding registration before submission", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await recordDeliveryCheck(repo, spec);
  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  writeFileSync(assignment.report, "# Whole-feature review\n\nA blocking issue.\n");

  const pending = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(pending.status, pending.stderr).toBe(0);
  const status = JSON.parse(pending.stdout);
  expect(status.delivery.action).toBe("await-review-report");
  expect(status.pendingAssignments).toContainEqual(
    expect.objectContaining({
      id: assignment.id,
      reportPresent: true,
      scope: "delivery",
    }),
  );
  const summary = nextSummary(status).join("\n");
  expect(summary).toContain(
    "register each accepted finding against this assignment before submission",
  );
  expect(summary).toContain(
    `pnpm spindle sdd finding create --feature .scratch/0001-ticket-flow --scope delivery --assignment ${assignment.id} --blocking --summary <summary> --details <impact> --actor <acting-agent>`,
  );
  expect(summary).toContain(
    `pnpm spindle sdd finding create --feature .scratch/0001-ticket-flow --scope delivery --assignment ${assignment.id} --non-blocking --summary <summary> --details <impact> --actor <acting-agent>`,
  );
  expect(summary.indexOf("finding create")).toBeLessThan(summary.indexOf("sdd submit"));
  expect(summary).not.toContain("sdd review --feature");

  const created = await execute(repo, (service) =>
    service.findingService.findingCreate({
      spec,
      ticket: "",
      scope: "delivery",
      assignment: assignment.id,
      blocking: true,
      summary: "Integrated behavior is inconsistent",
      details: "The feature-level report identifies a cross-ticket behavior mismatch.",
      author: "controller",
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const afterRegistration = await execute(repo, (service) =>
    service.deliveryService.next({ spec }),
  );
  expect(afterRegistration.status, afterRegistration.stderr).toBe(0);
  expect(nextSummary(JSON.parse(afterRegistration.stdout)).join("\n")).toContain(
    "Findings already registered from this report: F-0001.",
  );
});

test("delivery correction attempts resume independently with the same assignment and finding history", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await recordDeliveryCheck(repo, spec);

  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  writeFileSync(assignment.report, "# Aggregate review\n\nA whole-feature blocker.\n");
  const created = await execute(repo, (service) =>
    service.findingService.findingCreate({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: assignment.id,
      blocking: true,
      summary: "Integrated behaviors disagree",
      details: "The independently accepted ticket implementations conflict at their boundary.",
      author: "controller",
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: assignment.id,
      result: "failed",
      details: "The aggregate finding must be corrected.",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const checkCommand = "just test::test tests/whole-feature.test.ts";
  for (const result of ["unavailable", "passed"] as const) {
    const recorded = await execute(repo, (service) =>
      service.checksService.checksRecord({
        ticket: "",
        spec,
        scope: "delivery",
        command: checkCommand,
        result,
        ...(result === "unavailable" ? { details: "The test service is unavailable." } : {}),
        author: "controller",
      }),
    );
    expect(recorded.status, recorded.stderr).toBe(0);
    if (result === "unavailable") {
      const duringRetry = await execute(repo, (service) => service.deliveryService.next({ spec }));
      expect(duringRetry.status, duringRetry.stderr).toBe(0);
      expect(nextSummary(JSON.parse(duringRetry.stdout)).join("\n")).toContain(
        `Run delivery check: ${checkCommand}`,
      );
    }
  }
  const afterRetry = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(afterRetry.status, afterRetry.stderr).toBe(0);
  expect(JSON.parse(afterRetry.stdout).delivery.execution).toBe("changes-requested");
  const confirmed = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      ticket: "",
      spec,
      scope: "delivery",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmed.status, confirmed.stderr).toBe(0);

  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(next.status, next.stderr).toBe(0);
  expect(JSON.parse(next.stdout).delivery.action).toBe("correct");

  const correction = await execute(repo, (service) =>
    service.correctionService.correct({
      ticket: "",
      spec,
      scope: "delivery",
      findings: ["F-0001"],
      details: "Reconcile the cross-ticket behavior without weakening either criterion.",
      author: "controller",
    }),
  );
  expect(correction.status, correction.stderr).toBe(0);
  const output = JSON.parse(correction.stdout) as {
    scope: string;
    attempt: { number: number; findingIds: string[] };
    assignment: { id: string; report: string; action: string };
  };
  expect(output.scope).toBe("delivery");
  expect(output.attempt.number).toBe(1);
  expect(output.attempt.findingIds).toEqual(["F-0001"]);
  expect(output.assignment.action).toBe("correct");
  expect(output.assignment.report).toMatch(/final-round-1-fix\.md$/);

  const resumed = await execute(repo, (service) =>
    service.assignmentService.resume({ ticket: "", spec, scope: "delivery", author: "controller" }),
  );
  expect(resumed.status, resumed.stderr).toBe(0);
  const resumedOutput = JSON.parse(resumed.stdout) as {
    scope: string;
    nextAction: string;
    assignment: { id: string };
    correctionAttempts: { number: number; assignmentId: string }[];
  };
  expect(resumedOutput.scope).toBe("delivery");
  expect(resumedOutput.nextAction).toBe("await-implementation-report");
  expect(resumedOutput.assignment.id).toBe(output.assignment.id);
  expect(resumedOutput.correctionAttempts.map(({ number }) => number)).toEqual([1]);
  expect(resumedOutput.correctionAttempts[0]?.assignmentId).toBe(output.assignment.id);
  const unavailable = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: output.assignment.id,
      result: "unavailable",
      details: "The worker could not return a report.",
      author: "controller",
    }),
  );
  expect(unavailable.status, unavailable.stderr).toBe(0);
  const missing = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(missing.status, missing.stderr).toBe(0);
  const missingStatus = JSON.parse(missing.stdout);
  expect(missingStatus.pendingAssignments).toContainEqual(
    expect.objectContaining({
      id: output.assignment.id,
      status: "unavailable",
      reportPresent: false,
      scope: "delivery",
    }),
  );
  expect(nextSummary(missingStatus).join("\n")).toContain("assignment: unavailable");
  writeFileSync(
    join(repo, "feature.ts"),
    "export const feature = 'corrected whole-spec behavior';\n",
  );
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("add", "feature.ts");
  git("commit", "-qm", "commit delivery correction");
  writeFileSync(output.assignment.report, "# Delivery correction\n\nProgress recorded.\n");
  const present = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(present.status, present.stderr).toBe(0);
  expect(nextSummary(JSON.parse(present.stdout)).join("\n")).toContain(
    `pnpm spindle sdd submit --feature .scratch/0001-ticket-flow --scope delivery --assignment ${output.assignment.id} --actor <acting-agent>`,
  );
  const implementation = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: output.assignment.id,
      author: "controller",
    }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  await recordDeliveryCheck(repo, spec);
  const correctiveReview = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(correctiveReview.status, correctiveReview.stderr).toBe(0);
  const correctiveAssignment = JSON.parse(correctiveReview.stdout).assignments[0] as {
    id: string;
    attempt: number;
    scope: string;
    report: string;
  };
  expect(correctiveAssignment.scope).toBe("delivery");
  expect(correctiveAssignment.attempt).toBe(1);
  expect(correctiveAssignment.report).toMatch(/final-round-1-review-/);
  writeFileSync(correctiveAssignment.report, "# Corrective aggregate review\n\nNo regressions.\n");
  const correctiveReviewSubmission = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: correctiveAssignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(correctiveReviewSubmission.status, correctiveReviewSubmission.stderr).toBe(0);

  const paused = await execute(repo, (service) =>
    service.correctionService.correct({
      ticket: "",
      spec,
      scope: "delivery",
      decision: "pause",
      reason: "no-progress",
      details: "The first correction attempt made no demonstrable progress.",
      author: "controller",
    }),
  );
  expect(paused.status, paused.stderr).toBe(0);
  expect(JSON.parse(paused.stdout).adjudication.status).toBe("pending");
  const adjudicationResume = await execute(repo, (service) =>
    service.assignmentService.resume({ ticket: "", spec, scope: "delivery", author: "controller" }),
  );
  expect(adjudicationResume.status, adjudicationResume.stderr).toBe(0);
  const adjudicationState = JSON.parse(adjudicationResume.stdout) as {
    nextAction: string;
    adjudication: { status: string; reason: string };
  };
  expect(adjudicationState.nextAction).toBe("adjudicate");
  expect(adjudicationState.adjudication.status).toBe("pending");
  expect(adjudicationState.adjudication.reason).toBe("no-progress");

  const continued = await execute(repo, (service) =>
    service.correctionService.correct({
      ticket: "",
      spec,
      scope: "delivery",
      findings: ["F-0001"],
      details: "Continue with an independently reviewed plan.",
      decision: "continue",
      assessment:
        "The revised plan isolates the cross-ticket contract and can demonstrate progress.",
      author: "controller",
    }),
  );
  expect(continued.status, continued.stderr).toBe(0);
  const secondAttempt = JSON.parse(continued.stdout) as {
    attempt: { number: number };
    assignment: { id: string; report: string };
    adjudication: { status: string };
  };
  expect(secondAttempt.attempt.number).toBe(2);
  expect(secondAttempt.assignment.report).toMatch(/final-round-2-fix\.md$/);
  expect(secondAttempt.adjudication.status).toBe("resolved");
  const resumedSecond = await execute(repo, (service) =>
    service.assignmentService.resume({ ticket: "", spec, scope: "delivery", author: "controller" }),
  );
  expect(resumedSecond.status, resumedSecond.stderr).toBe(0);
  expect(JSON.parse(resumedSecond.stdout).assignment.id).toBe(secondAttempt.assignment.id);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.correctionAttempts.length).toBe(2);
  expect(ledger.delivery.correctionAttempts[0].progressAssessment.result).toBe("productive");
  expect(ledger.delivery.adjudication.status).toBe("resolved");
  expect(ledger.tickets[0].correctionAttempts).toBe(undefined);
});

test("delivery requirements rulings authorize only a freshly reviewed deferral", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await claimDelivery(repo, spec);
  const checkCommand = "just test::test tests/whole-feature.test.ts";
  const requiredBeforeReview = await execute(repo, (service) =>
    service.checksService.checksRequire({
      ticket: "",
      spec,
      scope: "delivery",
      command: checkCommand,
      author: "controller",
    }),
  );
  expect(requiredBeforeReview.status, requiredBeforeReview.stderr).toBe(0);
  const recordedBeforeReview = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      command: checkCommand,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recordedBeforeReview.status, recordedBeforeReview.stderr).toBe(0);
  const firstReview = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(firstReview.status, firstReview.stderr).toBe(0);
  const initialAssignment = JSON.parse(firstReview.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  writeFileSync(
    initialAssignment.report,
    "# Initial aggregate review\n\nFinding recorded below.\n",
  );
  const findingResult = await execute(repo, (service) =>
    service.findingService.findingCreate({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: initialAssignment.id,
      blocking: true,
      summary: "A feature acceptance requirement is no longer applicable",
      details: "The feature spec has not yet been amended to reflect the approved change.",
      author: "controller",
    }),
  );
  expect(findingResult.status, findingResult.stderr).toBe(0);
  const findingId = JSON.parse(findingResult.stdout).finding.id as string;
  const initialSubmission = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: initialAssignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(initialSubmission.status, initialSubmission.stderr).toBe(0);
  writeFileSync(join(repo, "feature.ts"), "export const feature = 'code-only change';\n");
  commitRequirement(repo, "feature.ts", "change code without changing requirements");
  const codeOnlyDecision = await execute(repo, (service) =>
    service.requirementsService.requirementsDecide({
      ticket: "",
      spec,
      scope: "delivery",
      finding: findingId,
      decision: "approved",
      details: "Code changes do not authorize a scope change.",
      author: "controller",
    }),
  );
  expect(codeOnlyDecision.status).not.toBe(0);
  expect(codeOnlyDecision.stderr).toMatch(/explicit requirements change after review/i);
  writeFileSync(
    spec,
    `${readFileSync(spec, "utf8")}\n## Approved delivery change\n\nThe affected behavior is out of scope.\n`,
  );
  commitRequirement(repo, ".scratch/0001-ticket-flow/spec.md", "revise delivery requirements");

  const unapprovedDeferral = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      ticket: "",
      spec,
      scope: "delivery",
      finding: findingId,
      status: "deferred",
      details: "Attempted without a requirements ruling.",
      followUp: "Feature proposal 17",
      requirementsDecision: "R-9999",
      author: "controller",
    }),
  );
  expect(unapprovedDeferral.status).not.toBe(0);

  const decision = await execute(repo, (service) =>
    service.requirementsService.requirementsDecide({
      spec,
      scope: "delivery",
      finding: findingId,
      decision: "approved",
      details: "The feature acceptance criteria were explicitly revised.",
      author: "controller",
    }),
  );
  expect(decision.status, decision.stderr).toBe(0);
  const decisionId = JSON.parse(decision.stdout).decision.id as string;
  expect(decisionId).toBe("R-0001");
  const repeatedDecision = await execute(repo, (service) =>
    service.requirementsService.requirementsDecide({
      spec,
      scope: "delivery",
      finding: findingId,
      decision: "approved",
      details: "The feature acceptance criteria were explicitly revised.",
      author: "controller",
    }),
  );
  expect(repeatedDecision.status, repeatedDecision.stderr).toBe(0);
  expect(JSON.parse(repeatedDecision.stdout).idempotent).toBe(true);

  const beforeFreshReview = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      ticket: "",
      spec,
      scope: "delivery",
      finding: findingId,
      status: "deferred",
      details: "Attempted before fresh aggregate review.",
      followUp: "Feature proposal 17",
      requirementsDecision: decisionId,
      author: "controller",
    }),
  );
  expect(beforeFreshReview.status).not.toBe(0);
  expect(beforeFreshReview.stderr).toMatch(/fresh passing aggregate review/i);

  const required = await execute(repo, (service) =>
    service.checksService.checksRequire({
      ticket: "",
      spec,
      scope: "delivery",
      command: checkCommand,
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  const recorded = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      command: checkCommand,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);
  const review = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(review.status, review.stderr).toBe(0);
  const assignment = JSON.parse(review.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  writeFileSync(assignment.report, "# Fresh aggregate review\n\nApproved scope change reviewed.\n");
  const submitted = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: assignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);

  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(next.status, next.stderr).toBe(0);
  expect(nextSummary(JSON.parse(next.stdout)).join("\n")).toContain(
    `pnpm spindle sdd finding update --feature .scratch/0001-ticket-flow --scope delivery --finding ${findingId} --status deferred --details <deferral-rationale> --follow-up <follow-up-reference> --requirements-decision <approved-decision-id> --actor <acting-agent>`,
  );
  const deferred = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      ticket: "",
      spec,
      scope: "delivery",
      finding: findingId,
      status: "deferred",
      details: "The approved requirements change removes this behavior from delivery scope.",
      followUp: "Feature proposal 17",
      requirementsDecision: decisionId,
      author: "controller",
    }),
  );
  expect(deferred.status, deferred.stderr).toBe(0);
  const result = JSON.parse(deferred.stdout) as { finding: { status: string; followUp: string } };
  expect(result.finding.status).toBe("deferred");
  expect(result.finding.followUp).toBe("Feature proposal 17");
});

test("finish gates integrated delivery on current aggregate evidence and stored retrospective policy", async () => {
  const optional = await prepareDeliveryReady();
  const optionalFinalization = await finalizeDelivery(optional);
  expect(optionalFinalization.completed).toMatchObject({ finished: true, cleanup: "complete" });
  expect(optionalFinalization.completed).not.toHaveProperty("retrospective");
  const optionalLedger = JSON.parse(
    readFileSync(join(optional.originalRepo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(optionalLedger.retrospectiveRequired).toBe(false);
  const repeatedOptional = await invokeAsync(optional.originalRepo, [
    "finish",
    "--feature",
    optionalFinalization.pending.originalSpec.replace(/\/spec\.md$/, ""),
    "--actor",
    "controller",
  ]);
  expect(repeatedOptional.status, repeatedOptional.stderr).toBe(0);
  expect(cliOutput(repeatedOptional)).toMatchObject({
    finished: true,
    cleanup: "complete",
  });

  const optionalWithReport = await prepareDeliveryReady();
  const optionalReport = join(
    optionalWithReport.repo,
    ".scratch",
    "0001-ticket-flow",
    "reports",
    "optional-retrospective.md",
  );
  writeFileSync(optionalReport, "# Optional retrospective\n\nAttached at finish.\n");
  const attachedOptional = await finalizeDelivery(optionalWithReport, { report: optionalReport });
  expect(attachedOptional.completed.retrospective).toMatchObject({
    report: join(
      optionalWithReport.originalRepo,
      ".scratch",
      "0001-ticket-flow",
      "reports",
      "optional-retrospective.md",
    ),
  });

  const required = await prepareDeliveryReady(true);
  const missingRetrospective = await execute(required.repo, (service) =>
    service.deliveryService.finish({
      spec: required.spec,
      author: "controller",
    }),
  );
  expect(missingRetrospective.status).not.toBe(0);
  expect(missingRetrospective.stderr).toMatch(/retrospective report is required/i);

  const outsideReport = join(required.repo, "tracked.txt");
  const unsafeReport = await execute(required.repo, (service) =>
    service.deliveryService.finish({
      spec: required.spec,
      report: outsideReport,
      author: "controller",
    }),
  );
  expect(unsafeReport.status).not.toBe(0);
  expect(unsafeReport.stderr).toMatch(/inside feature reports/i);

  const report = join(required.repo, ".scratch", "0001-ticket-flow", "reports", "retrospective.md");
  writeFileSync(report, "# Retrospective\n\nEvidence and outcomes are summarized here.\n");
  const requiredFinalization = await finalizeDelivery(required, { report });
  expect(requiredFinalization.completed).toMatchObject({ finished: true, cleanup: "complete" });
  expect(requiredFinalization.completed.retrospective).toMatchObject({
    report: join(
      required.originalRepo,
      ".scratch",
      "0001-ticket-flow",
      "reports",
      "retrospective.md",
    ),
  });
  expect(
    (requiredFinalization.completed.retrospective as { reportSha256: string }).reportSha256,
  ).toMatch(/^[0-9a-f]{64}$/);

  const ledger = JSON.parse(
    readFileSync(join(required.originalRepo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.retrospectiveRequired).toBe(true);
  expect(ledger.tickets[0].worktree).toBe(undefined);
});

test("aggregate review covers every closed ticket and stale requirements block finish", async () => {
  const first = await prepareReviewedTicket({ ticketCount: 2 });
  await integrateReviewedTicket(first, true);

  const secondId = "T-0002";
  const secondFile = "feature-two.ts";
  const command = "just test::test tests/feature.test.ts";
  const required = await execute(first.repo, (service) =>
    service.checksService.checksRequire({
      spec: first.spec,
      ticket: secondId,
      command,
      author: "controller",
    }),
  );
  expect(required.status, required.stderr).toBe(0);
  const dispatched = await execute(first.repo, (service) =>
    service.assignmentService.implement({
      spec: first.spec,
      ticket: secondId,
      author: "controller",
      workspace: first.worktreeParent,
    }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const implementation = await execute(first.repo, (service) =>
    service.assignmentService.implement({
      spec: first.spec,
      ticket: secondId,
      author: "controller",
      workspace: first.worktreeParent,
    }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  const implementationAssignment = JSON.parse(implementation.stdout).assignment as {
    id: string;
    report: string;
    workspace: string;
  };
  writeFileSync(
    join(implementationAssignment.workspace, secondFile),
    "export const secondFeature = true;\n",
  );
  commitTicketWorkspace(implementationAssignment.workspace, "implement second ticket");
  writeFileSync(implementationAssignment.report, "# Implementation\n\nSecond ticket complete.\n");
  const submittedImplementation = await execute(first.repo, (service) =>
    service.submissionService.submit({
      spec: first.spec,
      ticket: secondId,
      assignment: implementationAssignment.id,
      author: "controller",
    }),
  );
  expect(submittedImplementation.status, submittedImplementation.stderr).toBe(0);
  const check = await recordReviewCheck(first.repo, first.spec, command, "passed", secondId);
  expect(check.status, check.stderr).toBe(0);
  const review = await execute(first.repo, (service) =>
    service.reviewService.review({
      spec: first.spec,
      ticket: secondId,
      author: "controller",
    }),
  );
  expect(review.status, review.stderr).toBe(0);
  const ticketAssignment = JSON.parse(review.stdout).assignments[0] as {
    id: string;
    report: string;
  };
  writeFileSync(ticketAssignment.report, "# Ticket review\n\nNo findings.\n");
  const submittedReview = await execute(first.repo, (service) =>
    service.submissionService.submit({
      spec: first.spec,
      ticket: secondId,
      assignment: ticketAssignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(submittedReview.status, submittedReview.stderr).toBe(0);
  await integrateReviewedTicket(
    { ...first, ticketId: secondId, ticketWorkspace: implementationAssignment.workspace },
    true,
  );

  await claimDelivery(first.repo, first.spec);
  const deliveryCommand = "just test::test tests/whole-feature.test.ts";
  const deliveryCheck = await execute(first.repo, (service) =>
    service.checksService.checksRequire({
      ticket: "",
      spec: first.spec,
      scope: "delivery",
      command: deliveryCommand,
      author: "controller",
    }),
  );
  expect(deliveryCheck.status, deliveryCheck.stderr).toBe(0);
  const recordedDeliveryCheck = await execute(first.repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec: first.spec,
      scope: "delivery",
      command: deliveryCommand,
      result: "passed",
      author: "controller",
    }),
  );
  expect(recordedDeliveryCheck.status, recordedDeliveryCheck.stderr).toBe(0);
  const aggregate = await execute(first.repo, (service) =>
    service.reviewService.review({
      spec: first.spec,
      scope: "delivery",
      author: "controller",
    }),
  );
  expect(aggregate.status, aggregate.stderr).toBe(0);
  const aggregateAssignment = JSON.parse(aggregate.stdout).assignments[0] as {
    id: string;
    report: string;
    inventory: string[];
  };
  expect(aggregateAssignment.inventory).toEqual(["feature-two.ts", "feature.ts"]);
  writeFileSync(aggregateAssignment.report, "# Whole feature review\n\nNo findings.\n");
  const aggregateSubmission = await execute(first.repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec: first.spec,
      scope: "delivery",
      assignment: aggregateAssignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(aggregateSubmission.status, aggregateSubmission.stderr).toBe(0);

  const secondTicketPath = join(
    first.repo,
    ".scratch",
    "0001-ticket-flow",
    "tickets",
    `${secondId}.md`,
  );
  const originalTicket = readFileSync(secondTicketPath, "utf8");
  writeFileSync(
    secondTicketPath,
    originalTicket.replace(
      "## Acceptance Criteria\n\n",
      "## Acceptance Criteria\n\nA whole-feature requirement added after aggregate review.\n\n",
    ),
  );
  commitRequirement(
    first.repo,
    ".scratch/0001-ticket-flow/tickets/T-0002.md",
    "revise second ticket requirements",
  );
  const staleFinish = await execute(first.repo, (service) =>
    service.deliveryService.finish({
      spec: first.spec,
      author: "controller",
    }),
  );
  expect(staleFinish.status).not.toBe(0);
  expect(staleFinish.stderr).toMatch(
    /final delivery checks are not current and passing|aggregate required reviews are not current and passing/i,
  );
  writeFileSync(secondTicketPath, originalTicket);
  commitRequirement(
    first.repo,
    ".scratch/0001-ticket-flow/tickets/T-0002.md",
    "restore second ticket requirements",
  );
  const finished = await finalizeDelivery(first);
  expect(finished.completed).toMatchObject({ finished: true, cleanup: "complete" });
});

test("status and next expose delivery assignments, blockers, and finish action without mutation", async () => {
  const { repo, git, spec } = await prepareDeliveryReady();
  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const gitStatusBefore = git("status", "--porcelain");
  const status = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(status.status, status.stderr).toBe(0);
  expect(next.status, next.stderr).toBe(0);
  const statusDelivery = JSON.parse(status.stdout).delivery as {
    headSha: string;
    scope: string;
    execution: string;
    action: string;
    retrospectiveRequired: boolean;
    finished: boolean;
    findings: unknown[];
    finalChecks: { command: string }[];
    reviewAssignments: { agent: string; status: string; report: string }[];
    blockers: string[];
  };
  const nextDelivery = JSON.parse(next.stdout).delivery as typeof statusDelivery;
  expect(statusDelivery.scope).toBe("delivery");
  expect(statusDelivery.execution).toBe("reviewing");
  expect(statusDelivery.action).toBe("require-final-checks");
  expect(statusDelivery.headSha).toMatch(/^[0-9a-f]{40,64}$/);
  expect(statusDelivery.retrospectiveRequired).toBe(false);
  expect(statusDelivery.finished).toBe(false);
  expect(statusDelivery.findings).toEqual([]);
  expect(statusDelivery.finalChecks).toEqual([]);
  expect(statusDelivery.reviewAssignments.map(({ agent, status }) => ({ agent, status }))).toEqual([
    { agent: "sdd-reviewer", status: "submitted" },
  ]);
  expect(statusDelivery.blockers).toEqual([]);
  expect(nextDelivery).toEqual(statusDelivery);
  expect(nextSummary(JSON.parse(next.stdout)).join("\n")).toContain(
    "checks require --feature .scratch/0001-ticket-flow --scope final --command <check>",
  );
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);
  expect(git("status", "--porcelain")).toBe(gitStatusBefore);
});

test("failed final-merge checks preserve worktrees until passing evidence is recorded", async () => {
  const prepared = await prepareDeliveryReady();
  const command = "fixture final check";
  const pending = await beginDeliveryFinalization(prepared, { finalChecks: [command] });
  await declareFinalDeliveryChecks(pending, [command]);

  const failed = await recordFinalDeliveryCheck(
    pending,
    command,
    "failed",
    "The final-merge fixture check failed.",
  );
  expect(failed.status, failed.stderr).toBe(0);
  const paused = await completeDeliveryFinalization(pending);
  expect(paused.status, paused.stderr).toBe(0);
  expect(cliOutput(paused)).toMatchObject({
    finalValidation: "pending",
    cleanup: "retained",
    records: [{ command, result: "failed" }],
  });
  expect(existsSync(prepared.repo)).toBe(true);

  const passed = await recordFinalDeliveryCheck(pending, command);
  expect(passed.status, passed.stderr).toBe(0);
  const completed = await completeDeliveryFinalization(pending);
  expect(completed.status, completed.stderr).toBe(0);
  expect(cliOutput(completed)).toMatchObject({
    finished: true,
    cleanup: "complete",
  });
  expect(
    JSON.parse(readFileSync(pending.journal, "utf8")).records.map(
      (item: { result: string }) => item.result,
    ),
  ).toEqual(["failed", "passed"]);
});

test("final-merge check requirements are frozen after their initial declaration", async () => {
  const prepared = await prepareDeliveryReady();
  const command = "fixture final check";
  const pending = await beginDeliveryFinalization(prepared, { finalChecks: [command] });
  await declareFinalDeliveryChecks(pending, [command]);
  const journalBefore = readFileSync(pending.journal, "utf8");

  const changedList = await invokeAsync(pending.originalWorkspace, [
    "checks",
    "require",
    "--feature",
    pending.originalSpec.replace(/\/spec\.md$/, ""),
    "--scope",
    "final",
    "--command",
    command,
    "--command",
    "late unreviewed check",
    "--actor",
    "controller",
  ]);
  expect(changedList.status).not.toBe(0);
  expect(changedList.stderr).toMatch(/final declared check list is frozen/i);
  expect(readFileSync(pending.journal, "utf8")).toBe(journalBefore);

  const recorded = await recordFinalDeliveryCheck(pending, command);
  expect(recorded.status, recorded.stderr).toBe(0);
  const completed = await completeDeliveryFinalization(pending);
  expect(completed.status, completed.stderr).toBe(0);
  expect(cliOutput(completed)).toMatchObject({ finished: true, cleanup: "complete" });
});

test("finalization cleanup remains bound to its recorded controller", async () => {
  const prepared = await prepareDeliveryReady();
  const finalization = await finalizeDelivery(prepared);
  const journalBefore = readFileSync(finalization.pending.journal, "utf8");

  const replacementFinish = await invokeAsync(finalization.pending.originalWorkspace, [
    "finish",
    "--feature",
    finalization.pending.originalSpec.replace(/\/spec\.md$/, ""),
    "--actor",
    "replacement",
  ]);
  expect(replacementFinish.status).not.toBe(0);
  expect(replacementFinish.stderr).toContain("is owned by controller");
  expect(replacementFinish.stderr).toContain("--actor replacement");
  expect(replacementFinish.stderr).toContain("finalization journal cannot be handed off");
  expect(readFileSync(finalization.pending.journal, "utf8")).toBe(journalBefore);

  const repeated = await completeDeliveryFinalization(finalization.pending);
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(cliOutput(repeated)).toMatchObject({ finished: true, cleanup: "complete" });
});

test("finalization status and next expose pending checks and completed cleanup", async () => {
  const prepared = await prepareDeliveryReady();
  const report = join(prepared.repo, ".scratch", "0001-ticket-flow", "reports", "retrospective.md");
  writeFileSync(report, "# Retrospective\n\nCompletion evidence.\n");
  const command = "fixture final check";
  const pending = await beginDeliveryFinalization(prepared, {
    report,
    finalChecks: [command],
  });
  const statusPending = await invokeAsync(pending.originalWorkspace, [
    "status",
    "--feature",
    pending.originalSpec.replace(/\/spec\.md$/, ""),
  ]);
  const nextPending = await invokeAsync(pending.originalWorkspace, [
    "next",
    "--feature",
    pending.originalSpec.replace(/\/spec\.md$/, ""),
  ]);
  expect(statusPending.status, statusPending.stderr).toBe(0);
  expect(nextPending.status, nextPending.stderr).toBe(0);
  expect(cliOutput(statusPending)).toMatchObject({
    finalValidation: "pending",
    cleanup: "retained",
  });
  expect(cliOutput(nextPending)).toEqual(cliOutput(statusPending));

  await declareFinalDeliveryChecks(pending, [command]);
  const recorded = await recordFinalDeliveryCheck(pending, command);
  expect(recorded.status, recorded.stderr).toBe(0);
  const completed = await completeDeliveryFinalization(pending);
  expect(completed.status, completed.stderr).toBe(0);
  expect(cliOutput(completed)).toMatchObject({
    finished: true,
    cleanup: "complete",
  });
  expect(existsSync(prepared.repo)).toBe(false);

  const statusComplete = await invokeAsync(pending.originalWorkspace, [
    "status",
    "--feature",
    pending.originalSpec.replace(/\/spec\.md$/, ""),
  ]);
  const nextComplete = await invokeAsync(pending.originalWorkspace, [
    "next",
    "--feature",
    pending.originalSpec.replace(/\/spec\.md$/, ""),
  ]);
  expect(statusComplete.status, statusComplete.stderr).toBe(0);
  expect(nextComplete.status, nextComplete.stderr).toBe(0);
  expect(cliOutput(statusComplete)).toMatchObject({
    finished: true,
    cleanup: "complete",
  });
  expect(cliOutput(nextComplete)).toEqual(cliOutput(statusComplete));

  const journalBeforeLateRecord = readFileSync(pending.journal, "utf8");
  const lateRecord = await recordFinalDeliveryCheck(
    pending,
    command,
    "failed",
    "A post-completion result is not part of final validation.",
  );
  expect(lateRecord.status).not.toBe(0);
  expect(lateRecord.stderr).toMatch(/only accepted during final validation/i);
  expect(readFileSync(pending.journal, "utf8")).toBe(journalBeforeLateRecord);
});

test("delivery continuation from a pause before any attempt resolves adjudication and permits later corrections", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await recordDeliveryCheck(repo, spec);
  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({ spec, scope: "delivery", author: "controller" }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const review = JSON.parse(dispatched.stdout).assignments[0] as { id: string; report: string };
  writeFileSync(review.report, "# Aggregate review\n\nA whole-feature blocker.\n");
  const created = await execute(repo, (service) =>
    service.findingService.findingCreate({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: review.id,
      blocking: true,
      summary: "Integrated behaviors disagree",
      details: "The independently accepted ticket implementations conflict at their boundary.",
      author: "controller",
    }),
  );
  expect(created.status, created.stderr).toBe(0);
  const failedReview = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: review.id,
      result: "failed",
      details: "The aggregate finding must be corrected.",
      author: "controller",
    }),
  );
  expect(failedReview.status, failedReview.stderr).toBe(0);
  const confirmed = await execute(repo, (service) =>
    service.findingService.findingUpdate({
      ticket: "",
      spec,
      scope: "delivery",
      finding: "F-0001",
      status: "confirmed",
      author: "controller",
    }),
  );
  expect(confirmed.status, confirmed.stderr).toBe(0);

  const paused = await execute(repo, (service) =>
    service.correctionService.correct({
      ticket: "",
      spec,
      scope: "delivery",
      decision: "pause",
      reason: "requirements-disagreement",
      details: "The finding may contradict the accepted requirements; request adjudication.",
      author: "controller",
    }),
  );
  expect(paused.status, paused.stderr).toBe(0);
  expect(JSON.parse(paused.stdout).adjudication.status).toBe("pending");

  const assessment = "The requirements support the finding; a correction can make progress.";
  const continued = await execute(repo, (service) =>
    service.correctionService.correct({
      ticket: "",
      spec,
      scope: "delivery",
      findings: ["F-0001"],
      details: "Reconcile the cross-ticket behavior.",
      decision: "continue",
      assessment,
      author: "controller",
    }),
  );
  expect(continued.status, continued.stderr).toBe(0);
  const first = JSON.parse(continued.stdout) as {
    execution: string;
    attempt: { number: number; progressAssessment?: { details: string } };
    assignment: { id: string; report: string };
    adjudication: { status: string; resolution?: { details: string; recordedBy: string } };
  };
  expect(first.execution).toBe("implementing");
  expect(first.attempt.number).toBe(1);
  expect(first.attempt.progressAssessment?.details).toBe(assessment);
  expect(first.assignment.report).toMatch(/final-round-1-fix\.md$/);
  expect(first.adjudication.status).toBe("resolved");
  expect(first.adjudication.resolution).toMatchObject({
    details: assessment,
    recordedBy: "controller",
  });

  writeFileSync(join(repo, "feature.ts"), "export const feature = 'adjudicated delivery';\n");
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("add", "feature.ts");
  git("commit", "-qm", "commit adjudicated delivery correction");
  writeFileSync(first.assignment.report, "# Delivery correction\n\nProgress recorded.\n");
  const implementation = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(implementation.status, implementation.stderr).toBe(0);
  const checkCommand = "just test::test tests/whole-feature.test.ts";
  await recordDeliveryCheck(repo, spec, checkCommand);
  const failedCheck = await execute(repo, (service) =>
    service.checksService.checksRecord({
      ticket: "",
      spec,
      scope: "delivery",
      command: checkCommand,
      result: "failed",
      details: "The whole-feature check still fails.",
      author: "controller",
    }),
  );
  expect(failedCheck.status, failedCheck.stderr).toBe(0);

  const secondAssessment = "Correction 1 changed the failure; continue with the new behavior.";
  const second = await execute(repo, (service) =>
    service.correctionService.correct({
      ticket: "",
      spec,
      scope: "delivery",
      checkFailure: checkCommand,
      details: "Address the remaining whole-feature failure.",
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
  expect(secondOutput.assignment.report).toMatch(/final-round-2-fix\.md$/);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(
    ledger.delivery.correctionAttempts.map(({ number }: { number: number }) => number),
  ).toEqual([1, 2]);
  expect(ledger.delivery.correctionAttempts[0].progressAssessment.details).toBe(secondAssessment);
  expect(ledger.delivery.adjudication.status).toBe("resolved");
  expect(ledger.delivery.adjudication.resolution.details).toBe(assessment);
});

test("parallel delivery reviews stay submittable after a failed review and require its finding", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await recordDeliveryCheck(repo, spec);
  const requested = await execute(repo, (service) =>
    service.reviewService.reviewRequire({
      spec,
      scope: "delivery",
      type: "sdd-code-reviewer",
      details: "Check cross-ticket compatibility.",
      author: "controller",
    }),
  );
  expect(requested.status, requested.stderr).toBe(0);
  const reviewed = await execute(repo, (service) =>
    service.reviewService.review({ spec, scope: "delivery", author: "controller" }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);
  const assignments = JSON.parse(reviewed.stdout).assignments as {
    id: string;
    agent: string;
    report: string;
  }[];
  const comprehensive = assignments.find(({ agent }) => agent === "sdd-reviewer")!;
  const specialist = assignments.find(({ agent }) => agent === "sdd-code-reviewer")!;
  writeFileSync(comprehensive.report, "# Aggregate review\n\nA blocking issue.\n");
  writeFileSync(specialist.report, "# Specialist review\n\nNo additional findings.\n");
  const submit = async (id: string, result: "passed" | "failed") =>
    await execute(repo, (service) =>
      service.submissionService.submit({
        ticket: "",
        spec,
        scope: "delivery",
        assignment: id,
        result,
        ...(result === "failed" ? { details: "Cross-ticket behavior is inconsistent." } : {}),
        author: "controller",
      }),
    );
  const ledgerPath = join(repo, ".scratch", "0001-ticket-flow", "sdd.json");

  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const unregistered = await submit(comprehensive.id, "failed");
  expect(unregistered.status).not.toBe(0);
  expect(unregistered.stderr).toMatch(/failed review requires at least one registered finding/i);
  expect(unregistered.stderr).toContain("--scope delivery");
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);

  const registered = await execute(repo, (service) =>
    service.findingService.findingCreate({
      ticket: "",
      spec,
      scope: "delivery",
      relatedTicket: "T-0001",
      assignment: comprehensive.id,
      blocking: true,
      summary: "Cross-ticket behavior is inconsistent",
      details: "The integrated tickets use inconsistent names for the same behavior.",
      author: "controller",
    }),
  );
  expect(registered.status, registered.stderr).toBe(0);
  const failed = await submit(comprehensive.id, "failed");
  expect(failed.status, failed.stderr).toBe(0);

  const waiting = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(waiting.status, waiting.stderr).toBe(0);
  const waitingStatus = JSON.parse(waiting.stdout);
  expect(waitingStatus.delivery.action).toBe("await-review-report");
  expect(waitingStatus.pendingAssignments.map(({ id }: { id: string }) => id)).toEqual([
    specialist.id,
  ]);
  const waitingText = nextSummary(waitingStatus).join("\n");
  expect(waitingText).toContain(`--scope delivery --assignment ${specialist.id} --result passed`);
  expect(waitingText).not.toContain("sdd correct");
  let ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.delivery.execution).toBe("reviewing");
  expect(ledger.tickets[0].status).toBe("closed");

  const remaining = await submit(specialist.id, "passed");
  expect(remaining.status, remaining.stderr).toBe(0);
  ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.delivery.execution).toBe("changes-requested");
  expect(ledger.tickets[0].status).toBe("open");
});

test("an unavailable delivery review re-dispatches the same reviewer", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  await recordDeliveryCheck(repo, spec);
  const dispatched = await execute(repo, (service) =>
    service.reviewService.review({ spec, scope: "delivery", author: "controller" }),
  );
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignments[0] as {
    id: string;
    agent: string;
    report: string;
  };
  writeFileSync(assignment.report, "# Aggregate review\n\nThe reviewer stopped early.\n");
  const unavailable = await execute(repo, (service) =>
    service.submissionService.submit({
      ticket: "",
      spec,
      scope: "delivery",
      assignment: assignment.id,
      result: "unavailable",
      details: "The reviewer could not finish.",
      author: "controller",
    }),
  );
  expect(unavailable.status, unavailable.stderr).toBe(0);

  const next = await execute(repo, (service) => service.deliveryService.next({ spec }));
  expect(next.status, next.stderr).toBe(0);
  const status = JSON.parse(next.stdout);
  expect(status.delivery.action).toBe("review");
  const text = nextSummary(status).join("\n");
  expect(text).toContain(
    `Review ${assignment.id} (${assignment.agent}) was unavailable; dispatch a new review round for that reviewer.`,
  );
  expect(text).toContain("sdd review --feature .scratch/0001-ticket-flow --scope delivery");
  expect(text).not.toContain("cannot accept findings");

  const redispatched = await execute(repo, (service) =>
    service.reviewService.review({ spec, scope: "delivery", author: "controller" }),
  );
  expect(redispatched.status, redispatched.stderr).toBe(0);
  const replacement = JSON.parse(redispatched.stdout).assignments[0] as typeof assignment;
  expect(replacement.id).not.toBe(assignment.id);
  expect(replacement.agent).toBe(assignment.agent);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.reviewHistory.map(({ id }: { id: string }) => id)).toEqual([
    assignment.id,
  ]);
  expect(ledger.delivery.reviewAssignments).toEqual([
    expect.objectContaining({ id: replacement.id, status: "pending" }),
  ]);
});
