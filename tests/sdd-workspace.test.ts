import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { makeSearchPathPrefix, pathWith, runCli } from "./helpers.ts";

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "sdd-workspace-test-"));
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
  return { directory, repo, git };
}

function reportArgs(repo: string, reportsDirectory = ".scratch/2026-10-23-demo/reports") {
  return [
    "sdd",
    "workspace",
    "--workspace",
    repo,
    "--reports-dir",
    reportsDirectory,
    "--ticket",
    "03",
  ];
}

test("workspace resolves durable report paths without changing the checkout", async (t) => {
  const searchPathPrefix = await makeSearchPathPrefix();
  t.after(() => rmSync(searchPathPrefix, { recursive: true, force: true }));
  const { repo, git } = fixture(t);
  const reportsDirectory = ".scratch/2026-10-23-demo/reports";
  const absoluteReportsDirectory = join(repo, reportsDirectory);
  mkdirSync(absoluteReportsDirectory, { recursive: true });
  const implementation = join(absoluteReportsDirectory, "03-implementation.md");
  writeFileSync(implementation, "Existing report\n");
  const before = git("status", "--porcelain=v1");

  const result = runCli(repo, [...reportArgs(repo), "--round", "2"], pathWith(searchPathPrefix));

  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  const expected = {
    workspace: repo,
    reportsDirectory: absoluteReportsDirectory,
    reports: {
      implementation: {
        relative: `${reportsDirectory}/03-implementation.md`,
        absolute: implementation,
      },
      codeReview: {
        relative: `${reportsDirectory}/03-code-review.md`,
        absolute: join(absoluteReportsDirectory, "03-code-review.md"),
      },
      taskReview: {
        relative: `${reportsDirectory}/03-task-review.md`,
        absolute: join(absoluteReportsDirectory, "03-task-review.md"),
      },
      scopedReview: {
        relative: `${reportsDirectory}/03-round-2-review.md`,
        absolute: join(absoluteReportsDirectory, "03-round-2-review.md"),
      },
      finalReview: {
        relative: `${reportsDirectory}/final-review.md`,
        absolute: join(absoluteReportsDirectory, "final-review.md"),
      },
      finalFixReview: {
        relative: `${reportsDirectory}/final-fix-review.md`,
        absolute: join(absoluteReportsDirectory, "final-fix-review.md"),
      },
    },
  };
  assert.deepEqual(data, expected);
  assert.deepEqual(Object.keys(data.reports), [
    "implementation",
    "codeReview",
    "taskReview",
    "scopedReview",
    "finalReview",
    "finalFixReview",
  ]);
  assert.equal(result.stdout, `${JSON.stringify(expected, null, 2)}\n`);
  assert.equal(readFileSync(implementation, "utf8"), "Existing report\n");
  assert.equal(git("status", "--porcelain=v1"), before);
  assert.equal(existsSync(join(repo, ".github", "spindle.json")), false);
});

test("workspace rejects a dangling report symlink as a non-regular target", async (t) => {
  const searchPathPrefix = await makeSearchPathPrefix();
  t.after(() => rmSync(searchPathPrefix, { recursive: true, force: true }));
  const { repo } = fixture(t);
  const reportsDirectory = join(repo, ".scratch/2026-10-23-demo/reports");
  mkdirSync(reportsDirectory, { recursive: true });
  symlinkSync(join(repo, "missing-report-target"), join(reportsDirectory, "03-implementation.md"));

  const result = runCli(repo, reportArgs(repo), pathWith(searchPathPrefix));

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /spindle:.*not a regular file/);
});

test("workspace omits scoped review without a round and does not create report directories", async (t) => {
  const searchPathPrefix = await makeSearchPathPrefix();
  t.after(() => rmSync(searchPathPrefix, { recursive: true, force: true }));
  const { repo, git } = fixture(t);
  const before = git("status", "--porcelain=v1");

  const result = runCli(repo, reportArgs(repo), pathWith(searchPathPrefix));

  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(data.reports), [
    "implementation",
    "codeReview",
    "taskReview",
    "finalReview",
    "finalFixReview",
  ]);
  assert.equal("scopedReview" in data.reports, false);
  assert.equal(existsSync(join(repo, ".scratch")), false);
  assert.equal(git("status", "--porcelain=v1"), before);
});

test("workspace rejects path traversal, escaping links, ignored paths, and invalid identifiers", async (t) => {
  const searchPathPrefix = await makeSearchPathPrefix();
  t.after(() => rmSync(searchPathPrefix, { recursive: true, force: true }));
  const { directory, repo } = fixture(t);
  mkdirSync(join(repo, ".scratch"));
  symlinkSync(directory, join(repo, ".scratch/escape"));
  writeFileSync(join(repo, ".gitignore"), ".scratch/ignored/\n");

  for (const reportsDirectory of [
    "../outside/reports",
    "reports",
    ".scratch/../reports",
    ".git/reports",
    ".scratch/escape/reports",
    ".scratch/ignored/reports",
  ]) {
    const result = runCli(repo, reportArgs(repo, reportsDirectory), pathWith(searchPathPrefix));
    assert.notEqual(result.status, 0, reportsDirectory);
    assert.equal(result.stdout, "", reportsDirectory);
    assert.match(result.stderr, /spindle:/, reportsDirectory);
  }

  for (const [flag, value] of [
    ["--ticket", "00"],
    ["--ticket", "../03"],
    ["--round", "0"],
  ]) {
    const args = reportArgs(repo);
    if (flag === "--ticket") args[args.length - 1] = value;
    else args.push(flag, value);
    const result = runCli(repo, args, pathWith(searchPathPrefix));
    assert.notEqual(result.status, 0, `${flag} ${value}`);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /spindle:/);
  }
});

test("workspace rejects ignored destinations and existing non-regular targets", async (t) => {
  const searchPathPrefix = await makeSearchPathPrefix();
  t.after(() => rmSync(searchPathPrefix, { recursive: true, force: true }));
  const { repo } = fixture(t);
  const reportsDirectory = join(repo, ".scratch/2026-10-23-demo/reports");
  mkdirSync(reportsDirectory, { recursive: true });

  writeFileSync(join(repo, ".gitignore"), ".scratch/2026-10-23-demo/reports/03-code-review.md\n");
  const ignored = runCli(repo, reportArgs(repo), pathWith(searchPathPrefix));
  assert.notEqual(ignored.status, 0);
  assert.equal(ignored.stdout, "");
  assert.match(ignored.stderr, /spindle:.*Report destination is ignored/);

  rmSync(join(repo, ".gitignore"));
  mkdirSync(join(reportsDirectory, "03-implementation.md"));
  const directoryTarget = runCli(repo, reportArgs(repo), pathWith(searchPathPrefix));
  assert.notEqual(directoryTarget.status, 0);
  assert.equal(directoryTarget.stdout, "");
  assert.match(directoryTarget.stderr, /spindle:.*not a regular file/);
});

test("workspace requires an absolute checkout root with a valid HEAD", async (t) => {
  const searchPathPrefix = await makeSearchPathPrefix();
  t.after(() => rmSync(searchPathPrefix, { recursive: true, force: true }));
  const { directory, repo } = fixture(t);
  const nested = join(repo, "nested");
  mkdirSync(nested);

  for (const [project, workspace] of [
    [directory, "checkout"],
    [repo, nested],
  ]) {
    const result = runCli(project, reportArgs(workspace), pathWith(searchPathPrefix));
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /spindle:/);
  }

  const invalidHead = await makeSearchPathPrefix();
  t.after(() => rmSync(invalidHead, { recursive: true, force: true }));
  const emptyRepository = join(invalidHead, "empty-repository");
  mkdirSync(emptyRepository);
  execFileSync("git", ["init", "-q"], { cwd: emptyRepository });
  const result = runCli(emptyRepository, reportArgs(emptyRepository), pathWith(searchPathPrefix));
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /spindle:/);
});

test("SDD help discovers workspace and rejects malformed or inapplicable arguments", async (t) => {
  const searchPathPrefix = await makeSearchPathPrefix();
  t.after(() => rmSync(searchPathPrefix, { recursive: true, force: true }));
  const { repo } = fixture(t);
  const searchPath = pathWith(searchPathPrefix);

  for (const [args, expected] of [
    [["sdd", "--help"], /workspace/],
    [["sdd", "workspace", "--help"], /--reports-dir \.scratch/],
    [["--help"], /sdd \(see `spindle sdd --help`\)/],
  ] as const) {
    const result = runCli(repo, [...args], searchPath);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, expected);
    assert.equal(result.stderr, "");
  }

  const valid = reportArgs(repo);
  const invalidArguments = [
    [],
    ["sdd", "workspace"],
    [...valid, "--unknown", "value"],
    [...valid, "--ticket", "04"],
    [...valid, "--round", "2", "--round", "3"],
    [...valid, "unexpected"],
    [...valid, "--stack", "typescript"],
    [...valid, "--round"],
    ["sdd", "other"],
    ["sdd", "workspace", "--help", "--ticket", "03"],
  ];
  for (const args of invalidArguments) {
    const result = runCli(repo, args, searchPath);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
    assert.match(result.stderr, /spindle:/, args.join(" "));
  }
});
