import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import matter from "gray-matter";
import { expect, test } from "vitest";

import { createIssue, issueFixture } from "./issue-helpers.ts";

test("issue comment recovers an interrupted issue/ledger write without losing history", async () => {
  const { service, feature } = await issueFixture("Issue Recovery");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const ledger = JSON.parse(ledgerBefore);
  ledger.issues.push({ id: "I-0001", execution: "unstarted" });
  const ledgerAfter = `${JSON.stringify(ledger, null, 2)}\n`;
  const issueContent = [
    "---",
    "id: I-0001",
    "title: Recovered issue",
    "reporter: Explicit reporter",
    "category: enhancement",
    "status: needs-triage",
    "blocked_by: []",
    "---",
    "",
    "## Requirements",
    "",
    "Keep this recovered requirement.",
    "",
    "## Acceptance Criteria",
    "",
    "Keep this criterion.",
    "",
    "## Comments",
    "",
    "**2026-11-07T16:00:00.000Z - maintainer**",
    "",
    "Existing attributed history.",
    "",
  ].join("\n");
  const issuePath = join(feature.workspace, "issues", "I-0001.md");
  const journal = {
    version: 1,
    writes: [
      { path: "issues/I-0001.md", before: null, after: issueContent },
      { path: "sdd.json", before: ledgerBefore, after: ledgerAfter },
    ],
  };
  writeFileSync(issuePath, issueContent);
  writeFileSync(
    join(feature.workspace, ".sdd-write-recovery.json"),
    `${JSON.stringify(journal, null, 2)}\n`,
  );
  service.issueComment({
    spec: feature.spec,
    issue: "I-0001",
    details: "Recovery followed by a comment.",
    author: "maintainer",
  });
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerAfter);
  expect(existsSync(join(feature.workspace, ".sdd-write-recovery.json"))).toBe(false);
  const recovered = matter(readFileSync(issuePath, "utf8"));
  expect(recovered.content).toMatch(/Keep this recovered requirement\./);
  expect(recovered.content).toMatch(/Keep this criterion\./);
  expect(recovered.content.match(/Existing attributed history\./g) ?? []).toHaveLength(1);
  expect(recovered.content.match(/Recovery followed by a comment\./g) ?? []).toHaveLength(1);
});

test("recovery leaves every target unchanged when a later ledger conflicts", async () => {
  const { service, feature } = await issueFixture("Conflicting Recovery");
  createIssue(service, feature.spec, "Existing issue");
  const issuePath = join(feature.workspace, "issues", "I-0001.md");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const journalPath = join(feature.workspace, ".sdd-write-recovery.json");
  const issueBefore = readFileSync(issuePath, "utf8");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const ledgerConflict = `${ledgerBefore} \n`;
  writeFileSync(ledgerPath, ledgerConflict);
  const journal = JSON.stringify({
    version: 1,
    writes: [
      { path: "issues/I-0001.md", before: issueBefore, after: `${issueBefore}\nPending entry.\n` },
      { path: "sdd.json", before: ledgerBefore, after: `${ledgerBefore}\n` },
    ],
  });
  writeFileSync(journalPath, journal);
  expect(() =>
    service.issueComment({
      spec: feature.spec,
      issue: "I-0001",
      details: "Must not be written.",
      author: "maintainer",
    }),
  ).toThrow(/conflict/i);
  expect(readFileSync(issuePath, "utf8")).toBe(issueBefore);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerConflict);
  expect(readFileSync(journalPath, "utf8")).toBe(journal);
});
