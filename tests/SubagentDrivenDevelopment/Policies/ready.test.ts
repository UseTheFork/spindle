import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import matter from "gray-matter";
import { expect, test } from "vitest";

import { createIssue, issueFixture, workspaceSnapshot } from "../helpers/issue-helpers";

test("ready rejects duplicated ledger issue progress records", async () => {
  const { service, feature } = await issueFixture("Duplicate Ledger Issue");
  createIssue(service, feature.spec, "One issue");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.issues.push({ id: "I-0001", execution: "claimed" });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const malformed = readFileSync(ledgerPath, "utf8");
  expect(() => service.readinessService.ready({ spec: feature.spec })).toThrow(
    /issue IDs must be unique/i,
  );
  expect(readFileSync(ledgerPath, "utf8")).toBe(malformed);
});

test("ready leaves workspace files, directories, and Git status unchanged", async () => {
  const { service, feature, git } = await issueFixture("Read Only Ready");
  const before = workspaceSnapshot(feature.workspace);
  const statusBefore = git("status", "--porcelain=v1", "--untracked-files=all");
  expect(service.readinessService.ready({ spec: feature.spec })).toEqual({
    ready: [],
    unready: [],
  });
  expect(workspaceSnapshot(feature.workspace)).toEqual(before);
  expect(git("status", "--porcelain=v1", "--untracked-files=all")).toBe(statusBefore);
});

test("ready refuses a pending journal without changing workspace or Git status", async () => {
  const { service, feature, git } = await issueFixture("Pending Ready");
  const journal = join(feature.workspace, ".sdd-write-recovery.json");
  const ledgerBefore = readFileSync(join(feature.workspace, "sdd.json"), "utf8");
  const ledgerAfter = JSON.parse(ledgerBefore);
  ledgerAfter.issues.push({ id: "I-0001", execution: "unstarted" });
  writeFileSync(
    journal,
    JSON.stringify({
      version: 1,
      writes: [
        { path: "issues/I-0001.md", before: null, after: "Pending issue content\n" },
        { path: "sdd.json", before: ledgerBefore, after: `${JSON.stringify(ledgerAfter)}\n` },
      ],
    }),
  );
  const before = workspaceSnapshot(feature.workspace);
  const statusBefore = git("status", "--porcelain=v1", "--untracked-files=all");
  expect(() => service.readinessService.ready({ spec: feature.spec })).toThrow(
    /pending.*(journal|recover)/i,
  );
  expect(workspaceSnapshot(feature.workspace)).toEqual(before);
  expect(git("status", "--porcelain=v1", "--untracked-files=all")).toBe(statusBefore);
});

test("ready exposes unmet dependencies and rejects missing references and cycles", async () => {
  const { service, feature } = await issueFixture("Issue Dependencies");
  for (const title of [
    "Prerequisite",
    "Dependent",
    "Downstream",
    "Human-ready",
    "Already claimed",
  ]) {
    createIssue(service, feature.spec, title);
  }
  for (const issue of ["I-0001", "I-0002", "I-0003", "I-0004", "I-0005"]) {
    service.issueService.triage({
      spec: feature.spec,
      issue,
      status: "ready-for-agent",
      category: "enhancement",
      details: "Requirements are complete.",
      author: "maintainer",
    });
  }
  const second = join(feature.workspace, "issues", "I-0002.md");
  const third = join(feature.workspace, "issues", "I-0003.md");
  const initialSecond = matter(readFileSync(second, "utf8"));
  writeFileSync(
    second,
    matter.stringify(initialSecond.content, { ...initialSecond.data, blocked_by: ["I-0001"] }),
  );
  const initialThird = matter(readFileSync(third, "utf8"));
  writeFileSync(
    third,
    matter.stringify(initialThird.content, { ...initialThird.data, blocked_by: ["I-0002"] }),
  );
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.issues[4].execution = "claimed";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const humanPath = join(feature.workspace, "issues", "I-0004.md");
  const humanReady = matter(readFileSync(humanPath, "utf8"));
  humanReady.data.status = "ready-for-human";
  writeFileSync(humanPath, matter.stringify(humanReady.content, humanReady.data));
  expect(service.readinessService.ready({ spec: feature.spec })).toEqual({
    ready: ["I-0001"],
    unready: [
      { issue: "I-0002", blockedBy: ["I-0001"] },
      { issue: "I-0003", blockedBy: ["I-0002"] },
    ],
  });
  ledger.issues[0].execution = "integrated";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  expect(service.readinessService.ready({ spec: feature.spec })).toEqual({
    ready: ["I-0002"],
    unready: [{ issue: "I-0003", blockedBy: ["I-0002"] }],
  });
  const before = readFileSync(second, "utf8");
  expect(() =>
    service.issueService.issueUpdate({
      spec: feature.spec,
      issue: "I-0002",
      blockedBy: ["I-0099"],
      author: "maintainer",
    }),
  ).toThrow(/missing dependency I-0099/);
  expect(readFileSync(second, "utf8")).toBe(before);
  expect(() =>
    service.issueService.issueUpdate({
      spec: feature.spec,
      issue: "I-0002",
      blockedBy: ["I-0003"],
      author: "maintainer",
    }),
  ).toThrow(/cycle/i);
  expect(readFileSync(second, "utf8")).toBe(before);
  writeFileSync(
    second,
    matter.stringify(matter(before).content, { ...matter(before).data, blocked_by: ["I-0099"] }),
  );
  expect(() => service.readinessService.ready({ spec: feature.spec })).toThrow(
    /missing dependency I-0099/,
  );
  const secondAfterMissing = matter(readFileSync(second, "utf8"));
  writeFileSync(
    second,
    matter.stringify(secondAfterMissing.content, {
      ...secondAfterMissing.data,
      blocked_by: ["I-0003"],
    }),
  );
  expect(() => service.readinessService.ready({ spec: feature.spec })).toThrow(/cycle/i);
});
