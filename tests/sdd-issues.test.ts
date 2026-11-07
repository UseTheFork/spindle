import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { pathToFileURL } from "node:url";

import matter from "gray-matter";

import { runCli } from "./helpers.ts";

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "sdd-issues-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repo = join(directory, "checkout");
  mkdirSync(repo);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(repo, "tracked.txt"), "base\n");
  git("add", ".");
  git("commit", "-qm", "base");
  return { repo };
}

function createFeature(repo: string, title: string) {
  const result = runCli(
    repo,
    ["sdd", "create", "--title", title, "--author", "maintainer"],
    process.env.PATH ?? "",
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as { spec: string; workspace: string };
}

function workspaceSnapshot(directory: string): unknown {
  const stat = statSync(directory, { bigint: true });
  return {
    modified: stat.mtimeNs,
    entries: readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => {
        const path = join(directory, entry.name);
        return [
          entry.name,
          entry.isDirectory()
            ? workspaceSnapshot(path)
            : {
                content: readFileSync(path, "utf8"),
                modified: statSync(path, { bigint: true }).mtimeNs,
              },
        ];
      }),
  };
}

function gitStatus(repo: string): string {
  return execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: repo,
    encoding: "utf8",
  });
}

function runCliAsync(repo: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const command = join(process.cwd(), "src", "index.ts");
  return new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolveResult, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", import.meta.resolve("tsx"), command, ...args],
        {
          cwd: repo,
          env: { ...process.env, ...env, FORCE_COLOR: "0" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (status) => resolveResult({ status, stdout, stderr }));
    },
  );
}

async function waitForFile(path: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(existsSync(path), true, `Timed out waiting for ${path}`);
}

test("issue create persists attributed metadata and unstarted progress without overwriting", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Issue Lifecycle");
  const command = [
    "sdd",
    "issue",
    "create",
    "--spec",
    feature.spec,
    "--title",
    "Preserve issue requirements",
    "--reporter",
    "A maintainer",
    "--category",
    "enhancement",
    "--author",
    "controller",
  ];

  const result = runCli(repo, command, process.env.PATH ?? "");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout);
  assert.equal(output.issue, "I-0001");
  const issuePath = join(feature.workspace, "issues", "I-0001.md");
  assert.equal(output.path, issuePath);
  assert.equal(statSync(issuePath).mode & 0o777, 0o666 & ~process.umask());
  const createdDocument = matter(readFileSync(issuePath, "utf8"));
  assert.deepEqual(createdDocument.data, {
    id: "I-0001",
    title: "Preserve issue requirements",
    reporter: "A maintainer",
    category: "enhancement",
    status: "needs-triage",
    blocked_by: [],
  });
  assert.equal("execution" in createdDocument.data, false);
  assert.match(
    createdDocument.content,
    /^\n## Requirements\n\n## Acceptance Criteria\n\n## Comments\n/,
  );
  assert.match(
    createdDocument.content,
    /\*\*\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z - controller\*\*/,
  );
  assert.match(createdDocument.content, /Issue created\./);
  const ledgerPath = join(feature.workspace, "sdd.json");
  const firstIssue = readFileSync(issuePath, "utf8");
  assert.deepEqual(JSON.parse(readFileSync(ledgerPath, "utf8")).issues, [
    { id: "I-0001", execution: "unstarted" },
  ]);
  assert.equal(readFileSync(issuePath, "utf8").includes("execution:"), false);

  const repeated = runCli(repo, command, process.env.PATH ?? "");
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).issue, "I-0002");
  assert.equal(existsSync(issuePath), true);
  assert.equal(readFileSync(issuePath, "utf8"), firstIssue);
  assert.equal(JSON.parse(readFileSync(ledgerPath, "utf8")).issues.length, 2);
});

test("issue IDs restart independently for each feature", (t) => {
  const { repo } = fixture(t);
  const first = createFeature(repo, "First Feature");
  const second = createFeature(repo, "Second Feature");
  for (const feature of [first, second]) {
    const result = runCli(
      repo,
      [
        "sdd",
        "issue",
        "create",
        "--spec",
        feature.spec,
        "--title",
        "Independent issue",
        "--reporter",
        "reporter",
        "--category",
        "bug",
        "--author",
        "author",
      ],
      process.env.PATH ?? "",
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).issue, "I-0001");
    assert.equal(existsSync(join(feature.workspace, "issues", "I-0001.md")), true);
  }
});

test("issue creation rejects invalid categories and missing attribution without creating files", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Invalid Issue Inputs");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const common = [
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
    "task",
  ];
  for (const args of [
    [...common, "--author", "maintainer"],
    [...common.slice(0, -2), "--category", "bug"],
  ]) {
    const result = runCli(repo, args, process.env.PATH ?? "");
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.notEqual(result.stderr.trim(), "");
  }
  assert.equal(existsSync(join(feature.workspace, "issues", "I-0001.md")), false);
  assert.equal(readFileSync(ledgerPath, "utf8"), ledgerBefore);
});

test("issue creation rejects ignored destinations without changing issue or ledger files", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Ignored Issue");
  writeFileSync(join(repo, ".gitignore"), ".scratch/*/issues/I-*.md\n");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");

  const result = runCli(
    repo,
    [
      "sdd",
      "issue",
      "create",
      "--spec",
      feature.spec,
      "--title",
      "Must not be ignored",
      "--reporter",
      "reporter",
      "--category",
      "enhancement",
      "--author",
      "maintainer",
    ],
    process.env.PATH ?? "",
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ignored/i);
  assert.equal(existsSync(join(feature.workspace, "issues", "I-0001.md")), false);
  assert.equal(readFileSync(ledgerPath, "utf8"), ledgerBefore);
});

test("issue creation rejects a symlinked issues directory without touching outside content", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Unsafe Issue Path");
  const outside = join(repo, "..", "outside-issues");
  mkdirSync(outside);
  writeFileSync(join(outside, "keep.md"), "outside content\n");
  const issuesDirectory = join(feature.workspace, "issues");
  rmSync(issuesDirectory, { recursive: true });
  symlinkSync(outside, issuesDirectory);
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");

  const result = runCli(
    repo,
    [
      "sdd",
      "issue",
      "create",
      "--spec",
      feature.spec,
      "--title",
      "Must remain inside",
      "--reporter",
      "reporter",
      "--category",
      "bug",
      "--author",
      "maintainer",
    ],
    process.env.PATH ?? "",
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /real directory/i);
  assert.equal(readFileSync(join(outside, "keep.md"), "utf8"), "outside content\n");
  assert.equal(readFileSync(ledgerPath, "utf8"), ledgerBefore);
});

test("issue creation preserves a non-regular lock path and its target", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Unsafe Issue Lock");
  const outside = join(repo, "outside-lock");
  writeFileSync(outside, "preserve this file\n");
  const lockPath = join(feature.workspace, ".sdd-issues.lock");
  symlinkSync(outside, lockPath);

  const result = runCli(
    repo,
    [
      "sdd",
      "issue",
      "create",
      "--spec",
      feature.spec,
      "--title",
      "Must not claim an unsafe lock",
      "--reporter",
      "reporter",
      "--category",
      "bug",
      "--author",
      "maintainer",
    ],
    process.env.PATH ?? "",
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /lock path/i);
  assert.equal(existsSync(lockPath), true);
  assert.equal(readFileSync(outside, "utf8"), "preserve this file\n");
  assert.equal(existsSync(join(feature.workspace, "issues", "I-0001.md")), false);
});

test("ready rejects duplicated ledger issue progress records", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Duplicate Ledger Issue");
  const created = runCli(
    repo,
    [
      "sdd",
      "issue",
      "create",
      "--spec",
      feature.spec,
      "--title",
      "One issue",
      "--reporter",
      "reporter",
      "--category",
      "enhancement",
      "--author",
      "creator",
    ],
    process.env.PATH ?? "",
  );
  assert.equal(created.status, 0, created.stderr);
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const ledger = JSON.parse(ledgerBefore);
  ledger.issues.push({ id: "I-0001", execution: "claimed" });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const malformed = readFileSync(ledgerPath, "utf8");

  const result = runCli(repo, ["sdd", "ready", "--spec", feature.spec], process.env.PATH ?? "");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /issue IDs must be unique/i);
  assert.equal(readFileSync(ledgerPath, "utf8"), malformed);
});

test("ready leaves workspace files, directories, and Git status unchanged", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Read Only Ready");
  const before = workspaceSnapshot(feature.workspace);
  const statusBefore = gitStatus(repo);

  const result = runCli(repo, ["sdd", "ready", "--spec", feature.spec], process.env.PATH ?? "");

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { ready: [], unready: [] });
  assert.deepEqual(workspaceSnapshot(feature.workspace), before);
  assert.equal(gitStatus(repo), statusBefore);
});

test("ready refuses a pending journal without changing workspace or Git status", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Pending Ready");
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
  const statusBefore = gitStatus(repo);

  const result = runCli(repo, ["sdd", "ready", "--spec", feature.spec], process.env.PATH ?? "");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pending.*(journal|recover)/i);
  assert.deepEqual(workspaceSnapshot(feature.workspace), before);
  assert.equal(gitStatus(repo), statusBefore);
});

test("issue update changes descriptive fields and dependencies while preserving triage and body", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Issue Update");
  const create = (title: string) =>
    runCli(
      repo,
      [
        "sdd",
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
      ],
      process.env.PATH ?? "",
    );
  assert.equal(create("Foundation").status, 0);
  assert.equal(create("Follow-up").status, 0);
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
  const ledgerBefore = readFileSync(ledgerPath, "utf8");

  const result = runCli(
    repo,
    [
      "sdd",
      "issue",
      "update",
      "--spec",
      feature.spec,
      "--issue",
      "I-0002",
      "--title",
      "Updated Follow-up",
      "--reporter",
      "different reporter",
      "--blocked-by",
      "I-0001",
      "--author",
      "maintainer",
    ],
    process.env.PATH ?? "",
  );

  assert.equal(result.status, 0, result.stderr);
  const updated = matter(readFileSync(target, "utf8"));
  assert.equal(updated.data.title, "Updated Follow-up");
  assert.equal(updated.data.reporter, "different reporter");
  assert.equal(updated.data.status, "needs-triage");
  assert.deepEqual(updated.data.blocked_by, ["I-0001"]);
  assert.equal(updated.data.local_reference, "preserve this value");
  assert.equal(statSync(target).mode & 0o777, 0o640);
  assert.match(updated.content, /Keep this requirement\./);
  assert.match(updated.content, /Keep this criterion\./);
  assert.match(updated.content, /Historical comment\./);
  assert.match(updated.content, /\*\*\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z - maintainer\*\*/);
  assert.equal(readFileSync(ledgerPath, "utf8"), ledgerBefore);

  const cleared = runCli(
    repo,
    [
      "sdd",
      "issue",
      "update",
      "--spec",
      feature.spec,
      "--issue",
      "I-0002",
      "--clear-blocked-by",
      "--author",
      "maintainer",
    ],
    process.env.PATH ?? "",
  );
  assert.equal(cleared.status, 0, cleared.stderr);
  assert.deepEqual(matter(readFileSync(target, "utf8")).data.blocked_by, []);
});

test("triage accepts every category/status pair and appends attributed UTC rationales", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Issue Triage");
  const created = runCli(
    repo,
    [
      "sdd",
      "issue",
      "create",
      "--spec",
      feature.spec,
      "--title",
      "Triage every valid state",
      "--reporter",
      "reporter",
      "--category",
      "enhancement",
      "--author",
      "creator",
    ],
    process.env.PATH ?? "",
  );
  assert.equal(created.status, 0, created.stderr);
  const path = join(feature.workspace, "issues", "I-0001.md");
  const statuses = ["needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "wontfix"];
  let count = 0;
  for (const category of ["bug", "enhancement"]) {
    for (const status of statuses) {
      count += 1;
      const result = runCli(
        repo,
        [
          "sdd",
          "triage",
          "--spec",
          feature.spec,
          "--issue",
          "I-0001",
          "--category",
          category,
          "--status",
          status,
          "--details",
          `Decision ${count}`,
          "--author",
          "triager",
        ],
        process.env.PATH ?? "",
      );
      assert.equal(result.status, 0, result.stderr);
    }
  }
  const issue = matter(readFileSync(path, "utf8"));
  assert.equal(issue.data.category, "enhancement");
  assert.equal(issue.data.status, "wontfix");
  assert.equal((issue.content.match(/ - triager\*\*/g) ?? []).length, 10);
  assert.equal((issue.content.match(/Decision \d+/g) ?? []).length, 10);
  assert.match(issue.content, /\*\*\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z - triager\*\*/);

  for (const invalid of ["feature", "READY", ""]) {
    const result = runCli(
      repo,
      [
        "sdd",
        "triage",
        "--spec",
        feature.spec,
        "--issue",
        "I-0001",
        "--category",
        "enhancement",
        "--status",
        invalid,
        "--details",
        "Invalid state",
        "--author",
        "triager",
      ],
      process.env.PATH ?? "",
    );
    assert.notEqual(result.status, 0);
    assert.notEqual(result.stderr.trim(), "");
  }
  const invalidCategory = runCli(
    repo,
    [
      "sdd",
      "triage",
      "--spec",
      feature.spec,
      "--issue",
      "I-0001",
      "--category",
      "task",
      "--status",
      "ready-for-agent",
      "--details",
      "Invalid category",
      "--author",
      "triager",
    ],
    process.env.PATH ?? "",
  );
  assert.notEqual(invalidCategory.status, 0);
  assert.match(invalidCategory.stderr, /category/i);
});

test("ready exposes unmet dependencies and rejects missing references and cycles", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Issue Dependencies");
  const create = (title: string) => {
    const result = runCli(
      repo,
      [
        "sdd",
        "issue",
        "create",
        "--spec",
        feature.spec,
        "--title",
        title,
        "--reporter",
        "reporter",
        "--category",
        "enhancement",
        "--author",
        "creator",
      ],
      process.env.PATH ?? "",
    );
    assert.equal(result.status, 0, result.stderr);
  };
  const invoke = (args: string[]) => runCli(repo, ["sdd", ...args], process.env.PATH ?? "");
  const triageReady = (id: string) =>
    invoke([
      "triage",
      "--spec",
      feature.spec,
      "--issue",
      id,
      "--status",
      "ready-for-agent",
      "--category",
      "enhancement",
      "--details",
      "Requirements are complete.",
      "--author",
      "maintainer",
    ]);

  create("Prerequisite");
  create("Dependent");
  create("Downstream");
  create("Human-ready");
  create("Already claimed");
  for (const id of ["I-0001", "I-0002", "I-0003", "I-0004", "I-0005"]) {
    assert.equal(triageReady(id).status, 0);
  }
  const second = join(feature.workspace, "issues", "I-0002.md");
  const third = join(feature.workspace, "issues", "I-0003.md");
  const initialSecond = matter(readFileSync(second, "utf8"));
  writeFileSync(
    second,
    matter.stringify(initialSecond.content, {
      ...initialSecond.data,
      blocked_by: ["I-0001"],
    }),
  );
  const initialThird = matter(readFileSync(third, "utf8"));
  writeFileSync(
    third,
    matter.stringify(initialThird.content, {
      ...initialThird.data,
      blocked_by: ["I-0002"],
    }),
  );
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.issues[4].execution = "claimed";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const humanReady = matter(readFileSync(join(feature.workspace, "issues", "I-0004.md"), "utf8"));
  humanReady.data.status = "ready-for-human";
  writeFileSync(
    join(feature.workspace, "issues", "I-0004.md"),
    matter.stringify(humanReady.content, humanReady.data),
  );

  const unready = invoke(["ready", "--spec", feature.spec]);
  assert.equal(unready.status, 0, unready.stderr);
  assert.deepEqual(JSON.parse(unready.stdout), {
    ready: ["I-0001"],
    unready: [
      { issue: "I-0002", blockedBy: ["I-0001"] },
      { issue: "I-0003", blockedBy: ["I-0002"] },
    ],
  });

  ledger.issues[0].execution = "integrated";
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const nowReady = invoke(["ready", "--spec", feature.spec]);
  assert.equal(nowReady.status, 0, nowReady.stderr);
  assert.deepEqual(JSON.parse(nowReady.stdout), {
    ready: ["I-0002"],
    unready: [{ issue: "I-0003", blockedBy: ["I-0002"] }],
  });

  const before = readFileSync(second, "utf8");
  const missing = invoke([
    "issue",
    "update",
    "--spec",
    feature.spec,
    "--issue",
    "I-0002",
    "--blocked-by",
    "I-0099",
    "--author",
    "maintainer",
  ]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /missing dependency I-0099/);
  assert.equal(readFileSync(second, "utf8"), before);

  const cycle = invoke([
    "issue",
    "update",
    "--spec",
    feature.spec,
    "--issue",
    "I-0002",
    "--blocked-by",
    "I-0003",
    "--author",
    "maintainer",
  ]);
  assert.notEqual(cycle.status, 0);
  assert.match(cycle.stderr, /cycle/i);
  assert.equal(readFileSync(second, "utf8"), before);

  writeFileSync(
    second,
    matter.stringify(matter(before).content, {
      ...matter(before).data,
      blocked_by: ["I-0099"],
    }),
  );
  const invalidExistingGraph = invoke(["ready", "--spec", feature.spec]);
  assert.notEqual(invalidExistingGraph.status, 0);
  assert.match(invalidExistingGraph.stderr, /missing dependency I-0099/);

  const secondAfterMissing = matter(readFileSync(second, "utf8"));
  writeFileSync(
    second,
    matter.stringify(secondAfterMissing.content, {
      ...secondAfterMissing.data,
      blocked_by: ["I-0003"],
    }),
  );
  const externalCycle = invoke(["ready", "--spec", feature.spec]);
  assert.notEqual(externalCycle.status, 0);
  assert.match(externalCycle.stderr, /cycle/i);
});

test("ready does not combine triage states from interleaved serialized updates", async (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Coherent Ready Queue");
  const invoke = (args: string[]) => runCli(repo, ["sdd", ...args], process.env.PATH ?? "");
  const create = (title: string) => {
    const result = invoke([
      "issue",
      "create",
      "--spec",
      feature.spec,
      "--title",
      title,
      "--reporter",
      "reporter",
      "--category",
      "enhancement",
      "--author",
      "creator",
    ]);
    assert.equal(result.status, 0, result.stderr);
  };
  const triage = (id: string, status: string) =>
    invoke([
      "triage",
      "--spec",
      feature.spec,
      "--issue",
      id,
      "--status",
      status,
      "--category",
      "enhancement",
      "--details",
      `Set ${id} to ${status}.`,
      "--author",
      "maintainer",
    ]);

  create("Issue A");
  create("Issue B");
  assert.equal(triage("I-0001", "ready-for-agent").status, 0);

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
  const readyArgs = ["sdd", "ready", "--spec", feature.spec];
  const ready = runCliAsync(repo, readyArgs, {
    NODE_OPTIONS: `--import=${pathToFileURL(preloadPath).href}`,
  });

  try {
    await waitForFile(pausePath, 10_000);
    assert.equal(triage("I-0001", "needs-info").status, 0);
    assert.equal(triage("I-0002", "ready-for-agent").status, 0);
    const afterTriage = workspaceSnapshot(feature.workspace);
    writeFileSync(resumePath, "resume");

    const result = await ready;
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { ready: ["I-0002"], unready: [] });
    assert.deepEqual(workspaceSnapshot(feature.workspace), afterTriage);
  } finally {
    writeFileSync(resumePath, "resume");
  }
});

test("issue comment appends explicit UTC attribution without inferring reporter", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Issue Comments");
  const created = runCli(
    repo,
    [
      "sdd",
      "issue",
      "create",
      "--spec",
      feature.spec,
      "--title",
      "Record discussion",
      "--reporter",
      "Reporter Name",
      "--category",
      "bug",
      "--author",
      "creator",
    ],
    process.env.PATH ?? "",
  );
  assert.equal(created.status, 0, created.stderr);
  const path = join(feature.workspace, "issues", "I-0001.md");
  const original =
    readFileSync(path, "utf8").replace(
      "## Comments\n",
      "## Comments\n\nHistorical comment from before this command.\n",
    ) + "\n## Follow-up\n\nPreserve this later section.\n";
  writeFileSync(path, original);

  const result = runCli(
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
      "The investigation is complete.\nNo content should be inferred.",
      "--author",
      "investigator",
    ],
    process.env.PATH ?? "",
  );
  assert.equal(result.status, 0, result.stderr);
  const document = matter(readFileSync(path, "utf8"));
  assert.match(document.content, /Historical comment from before this command\./);
  assert.match(
    document.content,
    /The investigation is complete\.\nNo content should be inferred\./,
  );
  assert.match(document.content, /\*\*\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z - investigator\*\*/);
  assert.doesNotMatch(document.content, /Reporter Name/);
  assert.equal((document.content.match(/investigator\*\*/g) ?? []).length, 1);
  const [comments, followUp] = document.content.split("## Follow-up\n");
  assert.match(comments!, /The investigation is complete\./);
  assert.equal(followUp, "\nPreserve this later section.\n");

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
  assert.notEqual(missingAuthor.status, 0);
  assert.notEqual(missingAuthor.stderr.trim(), "");
  assert.doesNotMatch(readFileSync(path, "utf8"), /Unattributed comment/);
});

test("concurrent issue creation serializes per-feature IDs and ledger updates", async (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Concurrent Issues");
  const results = await Promise.all(
    ["One", "Two", "Three", "Four", "Five"].map((title) =>
      runCliAsync(repo, [
        "sdd",
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
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
  }
  const ids = results.map((result) => JSON.parse(result.stdout).issue).sort();
  assert.deepEqual(ids, ["I-0001", "I-0002", "I-0003", "I-0004", "I-0005"]);
  const ledger = JSON.parse(readFileSync(join(feature.workspace, "sdd.json"), "utf8"));
  assert.deepEqual(
    ledger.issues
      .map((item: { id: string; execution: string }) => item)
      .sort((left: { id: string }, right: { id: string }) => left.id.localeCompare(right.id)),
    ids.map((id: string) => ({ id, execution: "unstarted" })),
  );
  for (const id of ids) {
    assert.equal(existsSync(join(feature.workspace, "issues", `${id}.md`)), true);
  }
});

test("concurrent issue updates preserve both attributed history entries", async (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Concurrent Updates");
  const created = runCli(
    repo,
    [
      "sdd",
      "issue",
      "create",
      "--spec",
      feature.spec,
      "--title",
      "Concurrent target",
      "--reporter",
      "reporter",
      "--category",
      "enhancement",
      "--author",
      "creator",
    ],
    process.env.PATH ?? "",
  );
  assert.equal(created.status, 0, created.stderr);
  const results = await Promise.all(
    ["First update", "Second update"].map((title) =>
      runCliAsync(repo, [
        "sdd",
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
  for (const result of results) {
    assert.equal(result.status, 0, result.stderr);
  }
  const issue = matter(readFileSync(join(feature.workspace, "issues", "I-0001.md"), "utf8"));
  assert.ok(["First update", "Second update"].includes(issue.data.title as string));
  assert.match(issue.content, / - First update\*\*/);
  assert.match(issue.content, / - Second update\*\*/);
});

test("issue comment recovers an interrupted issue/ledger write without losing history", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Issue Recovery");
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

  const result = runCli(
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
      "Recovery followed by a comment.",
      "--author",
      "maintainer",
    ],
    process.env.PATH ?? "",
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(ledgerPath, "utf8"), ledgerAfter);
  assert.equal(existsSync(join(feature.workspace, ".sdd-write-recovery.json")), false);
  const recovered = matter(readFileSync(issuePath, "utf8"));
  assert.match(recovered.content, /Keep this recovered requirement\./);
  assert.match(recovered.content, /Keep this criterion\./);
  assert.equal((recovered.content.match(/Existing attributed history\./g) ?? []).length, 1);
  assert.equal((recovered.content.match(/Recovery followed by a comment\./g) ?? []).length, 1);
});

test("recovery leaves every target unchanged when a later ledger conflicts", (t) => {
  const { repo } = fixture(t);
  const feature = createFeature(repo, "Conflicting Recovery");
  const created = runCli(
    repo,
    [
      "sdd",
      "issue",
      "create",
      "--spec",
      feature.spec,
      "--title",
      "Existing issue",
      "--reporter",
      "reporter",
      "--category",
      "bug",
      "--author",
      "creator",
    ],
    process.env.PATH ?? "",
  );
  assert.equal(created.status, 0, created.stderr);
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

  const result = runCli(
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
      "Must not be written.",
      "--author",
      "maintainer",
    ],
    process.env.PATH ?? "",
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /conflict/i);
  assert.equal(readFileSync(issuePath, "utf8"), issueBefore);
  assert.equal(readFileSync(ledgerPath, "utf8"), ledgerConflict);
  assert.equal(readFileSync(journalPath, "utf8"), journal);
});
