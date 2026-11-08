import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import matter from "gray-matter";
import { expect, test } from "vitest";

import { invokeAsync } from "./helpers.ts";
import { createIssue, issueFixture, workspaceSnapshot } from "./issue-helpers.ts";

async function waitForFile(path: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(existsSync(path), `Timed out waiting for ${path}`).toBe(true);
}

test("ready does not combine triage states from interleaved serialized updates", async () => {
  const { repo, service, feature } = await issueFixture("Coherent Ready Queue");
  createIssue(service, feature.spec, "Issue A");
  createIssue(service, feature.spec, "Issue B");
  const triage = (issue: string, status: string) =>
    service.triage({
      spec: feature.spec,
      issue,
      status,
      category: "enhancement",
      details: `Set ${issue} to ${status}.`,
      author: "maintainer",
    });
  triage("I-0001", "ready-for-agent");
  const pausePath = join(repo, "ready-paused");
  const resumePath = join(repo, "ready-resume");
  const preloadPath = join(repo, "ready-pause.mjs");
  writeFileSync(
    preloadPath,
    `
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const originalReadFileSync = fs.readFileSync;
const originalWriteFileSync = fs.writeFileSync;
const originalExistsSync = fs.existsSync;
let paused = false;
fs.readFileSync = function (path, ...args) {
  if (!paused && String(path) === ${JSON.stringify(join(feature.workspace, "issues", "I-0002.md"))}) {
    paused = true;
    originalWriteFileSync(${JSON.stringify(pausePath)}, "paused");
    const signal = new Int32Array(new SharedArrayBuffer(4));
    const deadline = Date.now() + 15000;
    while (!originalExistsSync(${JSON.stringify(resumePath)}) && Date.now() < deadline) {
      Atomics.wait(signal, 0, 0, 10);
    }
  }
  return originalReadFileSync.apply(this, [path, ...args]);
};
syncBuiltinESMExports();
`,
  );
  const ready = invokeAsync(repo, ["ready", "--spec", feature.spec], { preload: preloadPath });
  try {
    await waitForFile(pausePath, 10_000);
    triage("I-0001", "needs-info");
    triage("I-0002", "ready-for-agent");
    const afterTriage = workspaceSnapshot(feature.workspace);
    writeFileSync(resumePath, "resume");
    const result = await ready;
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ready: ["I-0002"], unready: [] });
    expect(workspaceSnapshot(feature.workspace)).toEqual(afterTriage);
  } finally {
    writeFileSync(resumePath, "resume");
    await ready;
  }
});

test("concurrent issue creation serializes per-feature IDs and ledger updates", async () => {
  const { repo, feature } = await issueFixture("Concurrent Issues");
  const results = await Promise.all(
    ["One", "Two", "Three", "Four", "Five"].map((title) =>
      invokeAsync(repo, [
        "issue",
        "create",
        "--spec",
        feature.spec,
        "--title",
        title,
        "--reporter",
        "maintainer",
        "--category",
        "enhancement",
        "--author",
        "controller",
      ]),
    ),
  );
  for (const result of results) {
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
  }
  const ids: string[] = results.map((result) => JSON.parse(result.stdout).issue).sort();
  expect(ids).toEqual(["I-0001", "I-0002", "I-0003", "I-0004", "I-0005"]);
  const ledger = JSON.parse(readFileSync(join(feature.workspace, "sdd.json"), "utf8"));
  expect(
    ledger.issues.sort((left: { id: string }, right: { id: string }) =>
      left.id.localeCompare(right.id),
    ),
  ).toEqual(ids.map((id) => ({ id, execution: "unstarted" })));
  for (const id of ids) {
    expect(existsSync(join(feature.workspace, "issues", `${id}.md`))).toBe(true);
  }
});

test("concurrent issue updates preserve both attributed history entries", async () => {
  const { repo, service, feature } = await issueFixture("Concurrent Updates");
  createIssue(service, feature.spec, "Concurrent target");
  const results = await Promise.all(
    ["First update", "Second update"].map((title) =>
      invokeAsync(repo, [
        "issue",
        "update",
        "--spec",
        feature.spec,
        "--issue",
        "I-0001",
        "--title",
        title,
        "--author",
        title,
      ]),
    ),
  );
  for (const result of results) expect(result.status, result.stderr).toBe(0);
  const issue = matter(readFileSync(join(feature.workspace, "issues", "I-0001.md"), "utf8"));
  expect(["First update", "Second update"]).toContain(issue.data.title);
  expect(issue.content).toMatch(/ - First update\*\*/);
  expect(issue.content).toMatch(/ - Second update\*\*/);
});
