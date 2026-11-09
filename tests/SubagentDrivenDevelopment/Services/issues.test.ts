import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import matter from "gray-matter";
import { expect, test } from "vitest";

import { runCli } from "../../helpers/Cli.ts";
import { createIssue, issueFixture } from "../helpers/issue-helpers";

test("issue create persists attributed metadata and unstarted progress without overwriting", async () => {
  const { service, feature } = await issueFixture("Issue Lifecycle");
  const options = {
    spec: feature.spec,
    title: "Preserve issue requirements",
    reporter: "A maintainer",
    category: "enhancement",
    author: "controller",
  };
  const output = service.issueService.issueCreate(options);
  expect(output.issue).toBe("I-0001");
  const issuePath = join(feature.workspace, "issues", "I-0001.md");
  expect(output.path).toBe(issuePath);
  expect(statSync(issuePath).mode & 0o777).toBe(0o666 & ~process.umask());
  const createdDocument = matter(readFileSync(issuePath, "utf8"));
  expect(createdDocument.data).toEqual({ id: "I-0001" });
  expect("execution" in createdDocument.data).toBe(false);
  expect(createdDocument.content).toMatch(
    /^\n## Requirements\n\n## Acceptance Criteria\n\n## Comments\n/,
  );
  expect(createdDocument.content).toMatch(
    /\*\*\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z - controller\*\*/,
  );
  expect(createdDocument.content).toMatch(/Issue created\./);
  const ledgerPath = join(feature.workspace, "sdd.json");
  const firstIssue = readFileSync(issuePath, "utf8");
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).issues).toEqual([
    {
      id: "I-0001",
      title: options.title,
      reporter: options.reporter,
      category: "enhancement",
      status: "open",
      blockedBy: [],
      execution: "unstarted",
    },
  ]);
  expect(firstIssue).not.toContain("execution:");
  expect(service.issueService.issueCreate(options).issue).toBe("I-0002");
  expect(existsSync(issuePath)).toBe(true);
  expect(readFileSync(issuePath, "utf8")).toBe(firstIssue);
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).issues).toHaveLength(2);
});

test("issue IDs restart independently for each feature", async () => {
  const { service, feature } = await issueFixture("First Feature");
  const second = service.featureCreationService.create({
    title: "Second Feature",
    author: "maintainer",
  });
  for (const item of [feature, second]) {
    expect(
      service.issueService.issueCreate({
        spec: item.spec,
        title: "Independent issue",
        reporter: "reporter",
        category: "bug",
        author: "author",
      }).issue,
    ).toBe("I-0001");
    expect(existsSync(join(item.workspace, "issues", "I-0001.md"))).toBe(true);
  }
});

test("issue creation rejects invalid categories and missing attribution without creating files", async () => {
  const { repo, service, feature } = await issueFixture("Invalid Issue Inputs");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  expect(() =>
    service.issueService.issueCreate({
      spec: feature.spec,
      title: "Invalid issue",
      reporter: "reporter",
      category: "task",
      author: "maintainer",
    }),
  ).toThrow(/category/i);
  const missingAuthor = runCli(
    repo,
    [
      "sdd",
      "issue",
      "create",
      "--spec",
      feature.spec,
      "--title",
      "Invalid issue",
      "--reporter",
      "reporter",
      "--category",
      "bug",
    ],
    process.env.PATH ?? "",
  );
  expect(missingAuthor.status).not.toBe(0);
  expect(missingAuthor.stdout).toBe("");
  expect(missingAuthor.stderr.trim()).not.toBe("");
  expect(existsSync(join(feature.workspace, "issues", "I-0001.md"))).toBe(false);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);
});

test("issue creation rejects ignored destinations without changing issue or ledger files", async () => {
  const { repo, service, feature } = await issueFixture("Ignored Issue");
  writeFileSync(join(repo, ".gitignore"), ".scratch/*/issues/I-*.md\n");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const before = readFileSync(ledgerPath, "utf8");
  expect(() => createIssue(service, feature.spec, "Must not be ignored")).toThrow(/ignored/i);
  expect(existsSync(join(feature.workspace, "issues", "I-0001.md"))).toBe(false);
  expect(readFileSync(ledgerPath, "utf8")).toBe(before);
});

test("issue creation rejects a symlinked issues directory without touching outside content", async () => {
  const { repo, service, feature } = await issueFixture("Unsafe Issue Path");
  const outside = join(repo, "..", "outside-issues");
  mkdirSync(outside);
  writeFileSync(join(outside, "keep.md"), "outside content\n");
  const issuesDirectory = join(feature.workspace, "issues");
  rmSync(issuesDirectory, { recursive: true });
  symlinkSync(outside, issuesDirectory);
  const ledgerPath = join(feature.workspace, "sdd.json");
  const before = readFileSync(ledgerPath, "utf8");
  expect(() => createIssue(service, feature.spec, "Must remain inside")).toThrow(/real directory/i);
  expect(readFileSync(join(outside, "keep.md"), "utf8")).toBe("outside content\n");
  expect(readFileSync(ledgerPath, "utf8")).toBe(before);
});

test("issue creation preserves a non-regular lock path and its target", async () => {
  const { repo, service, feature } = await issueFixture("Unsafe Issue Lock");
  const outside = join(repo, "outside-lock");
  writeFileSync(outside, "preserve this file\n");
  const lockPath = join(feature.workspace, ".sdd-issues.lock");
  symlinkSync(outside, lockPath);
  expect(() => createIssue(service, feature.spec, "Must not claim an unsafe lock")).toThrow(
    /lock path/i,
  );
  expect(existsSync(lockPath)).toBe(true);
  expect(readFileSync(outside, "utf8")).toBe("preserve this file\n");
  expect(existsSync(join(feature.workspace, "issues", "I-0001.md"))).toBe(false);
});

test("issue update stores structured fields in the ledger and preserves local metadata and body", async () => {
  const { service, feature } = await issueFixture("Issue Update");
  createIssue(service, feature.spec, "Foundation");
  createIssue(service, feature.spec, "Follow-up");
  const target = join(feature.workspace, "issues", "I-0002.md");
  chmodSync(target, 0o640);
  const source = readFileSync(target, "utf8").replace(
    "## Requirements\n\n## Acceptance Criteria\n\n## Comments\n",
    "## Requirements\n\nKeep this requirement.\n\n## Acceptance Criteria\n\nKeep this criterion.\n\n## Comments\n\nHistorical comment.\n",
  );
  const withLocalMetadata = matter(source);
  writeFileSync(
    target,
    matter.stringify(withLocalMetadata.content, {
      ...withLocalMetadata.data,
      local_reference: "preserve this value",
    }),
  );
  const ledgerPath = join(feature.workspace, "sdd.json");
  service.issueService.issueUpdate({
    spec: feature.spec,
    issue: "I-0002",
    title: "Updated Follow-up",
    reporter: "different reporter",
    blockedBy: ["I-0001"],
    author: "maintainer",
  });
  const updated = matter(readFileSync(target, "utf8"));
  expect(updated.data).toEqual({ id: "I-0002", local_reference: "preserve this value" });
  const updatedLedger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(updatedLedger.issues[1]).toMatchObject({
    title: "Updated Follow-up",
    reporter: "different reporter",
    status: "open",
    blockedBy: ["I-0001"],
  });
  expect(updated.data.local_reference).toBe("preserve this value");
  expect(statSync(target).mode & 0o777).toBe(0o640);
  expect(updated.content).toMatch(/Keep this requirement\./);
  expect(updated.content).toMatch(/Keep this criterion\./);
  expect(updated.content).toMatch(/Historical comment\./);
  expect(updated.content).toMatch(/\*\*\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z - maintainer\*\*/);
  expect(updatedLedger.issues[1].category).toBe("enhancement");
  service.issueService.issueUpdate({
    spec: feature.spec,
    issue: "I-0002",
    clearBlockedBy: true,
    author: "maintainer",
  });
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).issues[1].blockedBy).toEqual([]);
});

test("issue tracker transitions enforce blockers before closure", async () => {
  const { service, feature } = await issueFixture("Issue Tracker");
  createIssue(service, feature.spec, "Track work");
  service.issueService.issueUpdate({
    spec: feature.spec,
    issue: "I-0001",
    status: "in-progress",
    author: "worker",
  });
  service.issueService.issueUpdate({
    spec: feature.spec,
    issue: "I-0001",
    status: "open",
    blocker: "Waiting for a decision.",
    author: "worker",
  });
  const ledgerPath = join(feature.workspace, "sdd.json");
  const beforeClose = readFileSync(ledgerPath, "utf8");
  expect(() =>
    service.issueService.issueUpdate({
      spec: feature.spec,
      issue: "I-0001",
      status: "closed",
      author: "worker",
    }),
  ).toThrow(/cannot close a blocked issue/i);
  expect(readFileSync(ledgerPath, "utf8")).toBe(beforeClose);
  service.issueService.issueUpdate({
    spec: feature.spec,
    issue: "I-0001",
    status: "closed",
    clearBlocker: true,
    author: "worker",
  });
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).issues[0]).toMatchObject({
    status: "closed",
  });
});

test("issue comment appends explicit UTC attribution without inferring reporter", async () => {
  const { repo, service, feature } = await issueFixture("Issue Comments");
  service.issueService.issueCreate({
    spec: feature.spec,
    title: "Record discussion",
    reporter: "Reporter Name",
    category: "bug",
    author: "creator",
  });
  const path = join(feature.workspace, "issues", "I-0001.md");
  const original =
    readFileSync(path, "utf8").replace(
      "## Comments\n",
      "## Comments\n\nHistorical comment from before this command.\n",
    ) + "\n## Follow-up\n\nPreserve this later section.\n";
  writeFileSync(path, original);
  service.issueService.issueComment({
    spec: feature.spec,
    issue: "I-0001",
    details: "The investigation is complete.\nNo content should be inferred.",
    author: "investigator",
  });
  const document = matter(readFileSync(path, "utf8"));
  expect(document.content).toMatch(/Historical comment from before this command\./);
  expect(document.content).toMatch(
    /The investigation is complete\.\nNo content should be inferred\./,
  );
  expect(document.content).toMatch(/\*\*\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z - investigator\*\*/);
  expect(document.content).not.toMatch(/Reporter Name/);
  expect(document.content.match(/investigator\*\*/g) ?? []).toHaveLength(1);
  const [comments, followUp] = document.content.split("## Follow-up\n");
  expect(comments).toMatch(/The investigation is complete\./);
  expect(followUp).toBe("\nPreserve this later section.\n");
  const missingAuthor = runCli(
    repo,
    [
      "sdd",
      "issue",
      "comment",
      "--spec",
      feature.spec,
      "--issue",
      "I-0001",
      "--details",
      "Unattributed comment",
    ],
    process.env.PATH ?? "",
  );
  expect(missingAuthor.status).not.toBe(0);
  expect(missingAuthor.stderr.trim()).not.toBe("");
  expect(readFileSync(path, "utf8")).not.toMatch(/Unattributed comment/);
});
