import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  cliOutput,
  execute,
  invokeAsync,
  finalizeDelivery,
  prepareDeliveryReady,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { expect, test, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

test("finish allows optional retrospective without a report and supports repeat finish", async () => {
  const optional = await prepareDeliveryReady();
  const optionalFinalization = await finalizeDelivery(optional);
  expect(optionalFinalization.completed).toMatchObject({ finished: true, cleanup: "complete" });
  expect(optionalFinalization.completed).not.toHaveProperty("retrospective");
  const optionalLedger = JSON.parse(
    readFileSync(
      join(optional.originalRepo, ".spindle/features", "0001-ticket-flow", "sdd.json"),
      "utf8",
    ),
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
});

test("finish attaches an optional retrospective report when provided", async () => {
  const optionalWithReport = await prepareDeliveryReady();
  const optionalReport = join(
    optionalWithReport.repo,
    ".spindle/features",
    "0001-ticket-flow",
    "reports",
    "optional-retrospective.md",
  );
  writeFileSync(optionalReport, "# Optional retrospective\n\nAttached at finish.\n");
  const attachedOptional = await finalizeDelivery(optionalWithReport, { report: optionalReport });
  expect(attachedOptional.completed.retrospective).toMatchObject({
    report: join(
      optionalWithReport.originalRepo,
      ".spindle/features",
      "0001-ticket-flow",
      "reports",
      "optional-retrospective.md",
    ),
  });
});

test("finish validates required retrospective and completes with a valid report", async () => {
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

  const report = join(
    required.repo,
    ".spindle/features",
    "0001-ticket-flow",
    "reports",
    "retrospective.md",
  );
  writeFileSync(report, "# Retrospective\n\nEvidence and outcomes are summarized here.\n");
  const requiredFinalization = await finalizeDelivery(required, { report });
  expect(requiredFinalization.completed).toMatchObject({ finished: true, cleanup: "complete" });
  expect(requiredFinalization.completed.retrospective).toMatchObject({
    report: join(
      required.originalRepo,
      ".spindle/features",
      "0001-ticket-flow",
      "reports",
      "retrospective.md",
    ),
  });
  expect(
    (requiredFinalization.completed.retrospective as { reportSha256: string }).reportSha256,
  ).toMatch(/^[0-9a-f]{64}$/);

  const ledger = JSON.parse(
    readFileSync(
      join(required.originalRepo, ".spindle/features", "0001-ticket-flow", "sdd.json"),
      "utf8",
    ),
  );
  expect(ledger.retrospectiveRequired).toBe(true);
  expect(ledger.tickets[0].worktree).toBe(undefined);
});
