import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { ReportEvidence } from "@/SubagentDrivenDevelopment/Evidence/ReportEvidence";

import { serviceFixture } from "../helpers/helpers";

test("report evidence hashes current bytes and rejects symlinked report paths", async () => {
  const { app, service } = await serviceFixture();
  const feature = service.featureCreationService.create({ title: "Reports", author: "controller" });
  const evidence = await app.make(ReportEvidence);
  const report = join(feature.workspace, "reports", "review.md");
  writeFileSync(report, "first\n");
  const before = evidence.readReportDigest(feature, report);
  expect(before).toMatch(/^[0-9a-f]{64}$/);
  writeFileSync(report, "second\n");
  expect(evidence.readReportDigest(feature, report)).not.toBe(before);
  const link = join(feature.workspace, "reports", "link.md");
  symlinkSync(report, link);
  expect(() => evidence.readReportDigest(feature, link)).toThrow(/regular file/);
});
