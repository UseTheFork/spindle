import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { createIssue, issueFixture, workspaceSnapshot } from "../helpers/issue-helpers";

test("ready rejects duplicated ledger issue progress records", async () => {
  const { service, feature } = await issueFixture("Duplicate Ledger Issue");
  createIssue(service, feature.spec, "One issue");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.issues.push({ ...ledger.issues[0] });
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
  writeFileSync(
    journal,
    JSON.stringify({
      version: 1,
      writes: [{ path: "issues/I-0001.md", before: null, after: "Pending issue content\n" }],
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
  const second = join(feature.workspace, "issues", "I-0002.md");
  service.issueService.issueUpdate({
    spec: feature.spec,
    issue: "I-0002",
    blockedBy: ["I-0001"],
    author: "maintainer",
  });
  service.issueService.issueUpdate({
    spec: feature.spec,
    issue: "I-0003",
    blockedBy: ["I-0002"],
    author: "maintainer",
  });
  service.issueService.issueUpdate({
    spec: feature.spec,
    issue: "I-0004",
    blocker: "Waiting for a product decision.",
    author: "maintainer",
  });
  service.issueService.issueUpdate({
    spec: feature.spec,
    issue: "I-0005",
    status: "in-progress",
    author: "maintainer",
  });
  expect(service.readinessService.ready({ spec: feature.spec })).toEqual({
    ready: ["I-0001"],
    unready: [
      { issue: "I-0002", blockedBy: ["I-0001"] },
      { issue: "I-0003", blockedBy: ["I-0002"] },
    ],
  });
  service.issueService.issueUpdate({
    spec: feature.spec,
    issue: "I-0001",
    status: "closed",
    author: "maintainer",
  });
  expect(service.readinessService.ready({ spec: feature.spec })).toEqual({
    ready: ["I-0002"],
    unready: [{ issue: "I-0003", blockedBy: ["I-0002"] }],
  });
  service.issueService.issueUpdate({
    spec: feature.spec,
    issue: "I-0002",
    status: "closed",
    author: "maintainer",
  });
  expect(service.readinessService.ready({ spec: feature.spec })).toEqual({
    ready: ["I-0003"],
    unready: [],
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
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.issues[1].blockedBy = ["I-0099"];
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  expect(() => service.readinessService.ready({ spec: feature.spec })).toThrow(
    /missing dependency I-0099/,
  );
  ledger.issues[1].blockedBy = ["I-0003"];
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  expect(() => service.readinessService.ready({ spec: feature.spec })).toThrow(/cycle/i);
});
