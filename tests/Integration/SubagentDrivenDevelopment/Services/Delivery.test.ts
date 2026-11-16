import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  claimDelivery,
  execute,
  prepareIntegratedTicket,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "@test/Helpers/SubagentDrivenDevelopment/StatusSummary";
import { expect, test, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

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
    "pnpm spindle sdd checks record --feature .spindle/features/0001-ticket-flow --scope delivery --command 'pnpm run test:delivery' --result passed --actor <acting-agent>",
  );

  const ledgerPath = join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json");
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
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(ledger.delivery.checks.records.length).toBe(2);
  expect(ledger.delivery.reviewAssignments).toBe(undefined);
});
