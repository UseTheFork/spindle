import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  claimDelivery,
  execute,
  recordDeliveryCheck,
  prepareIntegratedTicket,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "@test/Helpers/SubagentDrivenDevelopment/StatusSummary";
import { expect, test, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

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
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
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
  const ledgerPath = join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json");
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
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
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
    `pnpm spindle sdd finding create --feature .spindle/features/0001-ticket-flow --scope delivery --assignment ${assignment.id} --blocking --summary <summary> --details <impact> --actor <acting-agent>`,
  );
  expect(summary).toContain(
    `pnpm spindle sdd finding create --feature .spindle/features/0001-ticket-flow --scope delivery --assignment ${assignment.id} --non-blocking --summary <summary> --details <impact> --actor <acting-agent>`,
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
  const ledgerPath = join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json");

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
  expect(text).toContain(
    "sdd review --feature .spindle/features/0001-ticket-flow --scope delivery",
  );
  expect(text).not.toContain("cannot accept findings");

  const redispatched = await execute(repo, (service) =>
    service.reviewService.review({ spec, scope: "delivery", author: "controller" }),
  );
  expect(redispatched.status, redispatched.stderr).toBe(0);
  const replacement = JSON.parse(redispatched.stdout).assignments[0] as typeof assignment;
  expect(replacement.id).not.toBe(assignment.id);
  expect(replacement.agent).toBe(assignment.agent);
  const ledger = JSON.parse(
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.reviewHistory.map(({ id }: { id: string }) => id)).toEqual([
    assignment.id,
  ]);
  expect(ledger.delivery.reviewAssignments).toEqual([
    expect.objectContaining({ id: replacement.id, status: "pending" }),
  ]);
});
