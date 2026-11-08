import { expect, test } from "vitest";

import { IssueRepository } from "@/SubagentDrivenDevelopment/Persistence/IssueRepository";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { ReadinessPolicy } from "@/SubagentDrivenDevelopment/Policies/ReadinessPolicy";

import { serviceFixture } from "../helpers/helpers";

test("readiness policy rejects Markdown issues without matching ledger execution records", async () => {
  const { app, service } = await serviceFixture();
  const feature = service.featureCreationService.create({
    title: "Readiness",
    author: "controller",
  });
  service.issueService.issueCreate({
    spec: feature.spec,
    title: "Work",
    reporter: "requester",
    category: "enhancement",
    author: "controller",
  });
  const ledger = (await app.make(LedgerRepository)).readLedger(feature);
  const issues = (await app.make(IssueRepository)).readIssues(feature.workspace);
  ledger.issues = [];
  const policy = await app.make(ReadinessPolicy);
  expect(() => policy.evaluate(feature, ledger, issues)).toThrow(
    "Issue I-0001 has no ledger execution record.",
  );
});
