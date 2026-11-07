import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test, type TestContext } from "node:test";

import { runCli } from "./helpers.ts";

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "sdd-create-status-test-"));
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

function runCliAsync(repo: string, args: string[]) {
  const command = resolve(process.cwd(), "src/index.ts");
  return new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolveResult, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", import.meta.resolve("tsx"), command, ...args],
        {
          cwd: repo,
          env: { ...process.env, FORCE_COLOR: "0" },
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

test("sdd create writes a numbered feature workspace with its default ledger policy", (t) => {
  const { repo } = fixture(t);
  const result = runCli(
    repo,
    ["sdd", "create", "--title", "Command Driven SDD", "--author", "maintainer"],
    process.env.PATH ?? "",
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const featureDirectory = join(repo, ".scratch", "0001-command-driven-sdd");
  const expected = {
    feature: "0001-command-driven-sdd",
    workspace: featureDirectory,
    spec: join(featureDirectory, "spec.md"),
    ledger: join(featureDirectory, "sdd.json"),
  };
  assert.deepEqual(JSON.parse(result.stdout), expected);
  assert.equal(readFileSync(expected.spec, "utf8"), "# Command Driven SDD\n");
  assert.equal(existsSync(join(featureDirectory, "issues")), true);
  assert.equal(existsSync(join(featureDirectory, "reports")), true);
  assert.deepEqual(readdirSync(featureDirectory).sort(), [
    "issues",
    "reports",
    "sdd.json",
    "spec.md",
  ]);

  const ledger = JSON.parse(readFileSync(expected.ledger, "utf8"));
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.featureId, "0001");
  assert.equal(ledger.title, "Command Driven SDD");
  assert.equal(ledger.createdBy, "maintainer");
  assert.equal(ledger.retrospectiveRequired, false);
  assert.deepEqual(ledger.reviewPolicy, {
    version: 1,
    issue: ["sdd-reviewer"],
    delivery: ["sdd-reviewer"],
  });
});

test("sdd status reads the explicitly selected feature policy and progress without mutation", (t) => {
  const { repo, git } = fixture(t);
  const searchPath = process.env.PATH ?? "";
  const create = (title: string, extra: string[] = []) =>
    runCli(
      repo,
      ["sdd", "create", "--title", title, "--author", "maintainer", ...extra],
      searchPath,
    );
  assert.equal(create("First Feature").status, 0);
  const secondCreation = create("Second Feature", ["--require-retrospective"]);
  assert.equal(secondCreation.status, 0, secondCreation.stderr);
  const second = JSON.parse(secondCreation.stdout) as { feature: string; spec: string };
  const secondLedger = readFileSync(join(repo, ".scratch", second.feature, "sdd.json"), "utf8");
  const beforeStatus = git("status", "--porcelain=v1");

  const result = runCli(repo, ["sdd", "status", "--spec", second.spec], searchPath);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const state = JSON.parse(secondLedger);
  assert.deepEqual(JSON.parse(result.stdout), {
    feature: second.feature,
    workspace: join(repo, ".scratch", second.feature),
    spec: second.spec,
    ledger: join(repo, ".scratch", second.feature, "sdd.json"),
    state,
  });
  assert.equal(state.retrospectiveRequired, true);
  assert.deepEqual(state.reviewPolicy, {
    version: 1,
    issue: ["sdd-reviewer"],
    delivery: ["sdd-reviewer"],
  });
  assert.deepEqual(state.delivery, { execution: "unstarted", history: [] });
  assert.equal(
    readFileSync(join(repo, ".scratch", second.feature, "sdd.json"), "utf8"),
    secondLedger,
  );
  assert.equal(git("status", "--porcelain=v1"), beforeStatus);
});

test("sdd create requires named non-empty title and author options", (t) => {
  const { repo } = fixture(t);
  const invalidArguments = [
    ["sdd", "create"],
    ["sdd", "create", "--title", "Feature"],
    ["sdd", "create", "--author", "maintainer"],
    ["sdd", "create", "--title", " ", "--author", "maintainer"],
    ["sdd", "create", "--title", "Feature", "--author", " "],
    ["sdd", "create", "--title", "Feature", "--author", "first", "--author", "second"],
    ["sdd", "create", "--title", "Feature", "--author", "maintainer", "unexpected"],
    ["sdd", "status"],
  ];

  for (const args of invalidArguments) {
    const result = runCli(repo, args, process.env.PATH ?? "");
    assert.notEqual(result.status, 0, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
    assert.notEqual(result.stderr.trim(), "", args.join(" "));
    assert.equal(existsSync(join(repo, ".scratch")), false, args.join(" "));
  }
});

test("sdd create allocates above matching IDs and ignores dated and unrelated directories", (t) => {
  const { repo } = fixture(t);
  const scratch = join(repo, ".scratch");
  mkdirSync(join(scratch, "0007-older-feature"), { recursive: true });
  mkdirSync(join(scratch, "0012-another-feature"), { recursive: true });
  mkdirSync(join(scratch, "2026-11-06-historical-feature"), { recursive: true });
  mkdirSync(join(scratch, "notes"), { recursive: true });
  writeFileSync(join(scratch, "0007-older-feature", "preserve.md"), "existing content\n");

  const result = runCli(
    repo,
    ["sdd", "create", "--title", "Newest Feature", "--author", "maintainer"],
    process.env.PATH ?? "",
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.feature, "0013-newest-feature");
  assert.equal(
    readFileSync(join(scratch, "0007-older-feature", "preserve.md"), "utf8"),
    "existing content\n",
  );
  assert.equal(existsSync(join(scratch, "2026-11-06-historical-feature", "sdd.json")), false);
});

test("sdd create compares large matching IDs without numeric precision loss", (t) => {
  const { repo } = fixture(t);
  const scratch = join(repo, ".scratch");
  mkdirSync(join(scratch, "9007199254740993-previous-feature"), { recursive: true });

  const result = runCli(
    repo,
    ["sdd", "create", "--title", "Next Large Feature", "--author", "maintainer"],
    process.env.PATH ?? "",
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).feature, "9007199254740994-next-large-feature");
});

test("concurrent sdd create commands allocate distinct consecutive feature IDs", async (t) => {
  const { repo } = fixture(t);
  const results = await Promise.all(
    ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"].map((title) =>
      runCliAsync(repo, [
        "sdd",
        "create",
        "--title",
        `${title} Concurrent`,
        "--author",
        "maintainer",
      ]),
    ),
  );

  for (const result of results) {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
  }
  const features = results.map((result) => JSON.parse(result.stdout).feature) as string[];
  assert.deepEqual(features.map((feature) => feature.slice(0, 4)).sort(), [
    "0001",
    "0002",
    "0003",
    "0004",
    "0005",
    "0006",
  ]);
  assert.deepEqual(features.map((feature) => feature.slice(5)).sort(), [
    "fifth-concurrent",
    "first-concurrent",
    "fourth-concurrent",
    "second-concurrent",
    "sixth-concurrent",
    "third-concurrent",
  ]);
  assert.equal(existsSync(join(repo, ".scratch", ".sdd-create.lock")), false);
});

test("sdd status rejects normalized traversal paths and legacy feature layouts", (t) => {
  const { repo } = fixture(t);
  const created = runCli(
    repo,
    ["sdd", "create", "--title", "Current Feature", "--author", "maintainer"],
    process.env.PATH ?? "",
  );
  assert.equal(created.status, 0, created.stderr);
  const current = JSON.parse(created.stdout) as { feature: string; spec: string };
  const linkedFeature = join(repo, ".scratch", "0002-linked-feature");
  symlinkSync(join(repo, ".scratch", current.feature), linkedFeature);
  const legacy = join(repo, ".scratch", "2026-11-06-legacy-feature");
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, "spec.md"), "# Legacy\n");
  writeFileSync(join(legacy, "sdd.json"), "{}\n");

  for (const spec of [
    `${repo}/.scratch/../.scratch/${current.feature}/spec.md`,
    join(linkedFeature, "spec.md"),
    join(legacy, "spec.md"),
  ]) {
    const result = runCli(repo, ["sdd", "status", "--spec", spec], process.env.PATH ?? "");
    assert.notEqual(result.status, 0, spec);
    assert.equal(result.stdout, "", spec);
    assert.match(result.stderr, /spindle:/, spec);
  }
});

test("sdd create reports abandoned staging content without overwriting or publishing it", (t) => {
  const { repo } = fixture(t);
  const abandoned = join(repo, ".scratch", ".sdd-create-interrupted");
  mkdirSync(abandoned, { recursive: true });
  writeFileSync(join(abandoned, "spec.md"), "partial content\n");

  const result = runCli(
    repo,
    ["sdd", "create", "--title", "Recoverable Feature", "--author", "maintainer"],
    process.env.PATH ?? "",
  );

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /incomplete.*creation|creation.*incomplete/i);
  assert.match(result.stderr, /sdd-create-interrupted/);
  assert.equal(readFileSync(join(abandoned, "spec.md"), "utf8"), "partial content\n");
  assert.equal(existsSync(join(repo, ".scratch", "0001-recoverable-feature")), false);
});

test("sdd create preserves a stale lock and gives an explicit recovery instruction", (t) => {
  const { repo } = fixture(t);
  const scratch = join(repo, ".scratch");
  mkdirSync(scratch);
  const lockPath = join(scratch, ".sdd-create.lock");
  const lock = JSON.stringify({ pid: 2_147_483_647, createdAt: Date.now() - 60_000 });
  writeFileSync(lockPath, lock);

  const result = runCli(
    repo,
    ["sdd", "create", "--title", "Locked Feature", "--author", "maintainer"],
    process.env.PATH ?? "",
  );

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /stale.*lock|lock.*stale/i);
  assert.match(result.stderr, /confirm|verify/i);
  assert.equal(readFileSync(lockPath, "utf8"), lock);
  assert.equal(existsSync(join(scratch, "0001-locked-feature")), false);
});

test("sdd create rejects symlinked and ignored destinations without overwriting outside content", (t) => {
  const { directory, repo } = fixture(t);
  const outside = join(directory, "outside-scratch");
  mkdirSync(outside);
  writeFileSync(join(outside, "keep.txt"), "outside content\n");
  symlinkSync(outside, join(repo, ".scratch"));

  const create = () =>
    runCli(
      repo,
      ["sdd", "create", "--title", "Unsafe Feature", "--author", "maintainer"],
      process.env.PATH ?? "",
    );
  const symlinked = create();
  assert.notEqual(symlinked.status, 0);
  assert.equal(symlinked.stdout, "");
  assert.equal(readFileSync(join(outside, "keep.txt"), "utf8"), "outside content\n");
  rmSync(join(repo, ".scratch"));

  writeFileSync(join(repo, ".gitignore"), ".scratch/\n");
  const ignoredDirectory = create();
  assert.notEqual(ignoredDirectory.status, 0);
  assert.equal(existsSync(join(repo, ".scratch")), false);

  writeFileSync(join(repo, ".gitignore"), ".scratch/*/sdd.json\n");
  const ignoredLedger = create();
  assert.notEqual(ignoredLedger.status, 0);
  assert.equal(ignoredLedger.stdout, "");
  assert.equal(existsSync(join(repo, ".scratch", "0001-unsafe-feature")), false);
});

test("sdd status reads a stored policy version without substituting current defaults", (t) => {
  const { repo } = fixture(t);
  const created = runCli(
    repo,
    ["sdd", "create", "--title", "Pinned Policy", "--author", "maintainer"],
    process.env.PATH ?? "",
  );
  assert.equal(created.status, 0, created.stderr);
  const output = JSON.parse(created.stdout) as { feature: string; spec: string };
  const ledgerPath = join(repo, ".scratch", output.feature, "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.reviewPolicy = {
    version: 7,
    issue: ["pinned-issue-reviewer"],
    delivery: ["pinned-delivery-reviewer"],
  };
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const before = readFileSync(ledgerPath, "utf8");

  const result = runCli(repo, ["sdd", "status", "--spec", output.spec], process.env.PATH ?? "");

  assert.equal(result.status, 0, result.stderr);
  const status = JSON.parse(result.stdout);
  assert.deepEqual(status.state.reviewPolicy, ledger.reviewPolicy);
  assert.equal(readFileSync(ledgerPath, "utf8"), before);
});

test("sdd status rejects unsupported ledger schema versions without rewriting the ledger", (t) => {
  const { repo } = fixture(t);
  const created = runCli(
    repo,
    ["sdd", "create", "--title", "Versioned Feature", "--author", "maintainer"],
    process.env.PATH ?? "",
  );
  assert.equal(created.status, 0, created.stderr);
  const output = JSON.parse(created.stdout) as { feature: string; spec: string };
  const ledgerPath = join(repo, ".scratch", output.feature, "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.schemaVersion = 2;
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const before = readFileSync(ledgerPath, "utf8");

  const result = runCli(repo, ["sdd", "status", "--spec", output.spec], process.env.PATH ?? "");

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Unsupported feature ledger schema version: 2/);
  assert.equal(readFileSync(ledgerPath, "utf8"), before);
});

test("sdd status validates v1 issue and delivery history records without rewriting the ledger", (t) => {
  const { repo } = fixture(t);
  const created = runCli(
    repo,
    ["sdd", "create", "--title", "Nested Records", "--author", "maintainer"],
    process.env.PATH ?? "",
  );
  assert.equal(created.status, 0, created.stderr);
  const output = JSON.parse(created.stdout) as { feature: string; spec: string };
  const ledgerPath = join(repo, ".scratch", output.feature, "sdd.json");
  const original = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const malformedLedgers = [
    { ...original, issues: [null] },
    { ...original, issues: [{ id: "I-0001" }] },
    { ...original, issues: [{ id: 1, execution: "claimed" }] },
    { ...original, issues: [{ id: "I-0001", execution: 1 }] },
    { ...original, delivery: { ...original.delivery, history: [null] } },
    {
      ...original,
      delivery: {
        ...original.delivery,
        history: [{ at: "not-a-timestamp", author: "maintainer", action: "claimed" }],
      },
    },
    {
      ...original,
      delivery: {
        ...original.delivery,
        history: [{ at: "2026-11-07T12:00:00Z", action: "claimed" }],
      },
    },
  ];

  for (const malformed of malformedLedgers) {
    const contents = `${JSON.stringify(malformed, null, 2)}\n`;
    writeFileSync(ledgerPath, contents);

    const result = runCli(repo, ["sdd", "status", "--spec", output.spec], process.env.PATH ?? "");

    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Feature (?:issue records|delivery history records)/);
    assert.equal(readFileSync(ledgerPath, "utf8"), contents);
  }

  const valid = {
    ...original,
    issues: [{ id: "I-0001", execution: "claimed" }],
    delivery: {
      execution: "unstarted",
      history: [{ at: "2026-11-07T12:00:00Z", author: "maintainer", action: "created" }],
    },
  };
  const validContents = `${JSON.stringify(valid, null, 2)}\n`;
  writeFileSync(ledgerPath, validContents);

  const result = runCli(repo, ["sdd", "status", "--spec", output.spec], process.env.PATH ?? "");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).state.issues[0].execution, "claimed");
  assert.equal(JSON.parse(result.stdout).state.delivery.history[0].action, "created");
  assert.equal(readFileSync(ledgerPath, "utf8"), validContents);
});

test("sdd help advertises create and status instead of the legacy workspace resolver", (t) => {
  const { repo } = fixture(t);
  const searchPath = process.env.PATH ?? "";
  const help = runCli(repo, ["sdd", "--help"], searchPath);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /\bcreate\b/);
  assert.match(help.stdout, /\bstatus\b/);
  assert.doesNotMatch(help.stdout, /^\s+workspace\s+\[options\]/m);
  assert.equal(help.stderr, "");

  const createHelp = runCli(repo, ["sdd", "create", "--help"], searchPath);
  assert.equal(createHelp.status, 0, createHelp.stderr);
  assert.match(createHelp.stdout, /--title <title>/);
  assert.match(createHelp.stdout, /--author <author>/);
  assert.match(createHelp.stdout, /--require-retrospective/);

  const statusHelp = runCli(repo, ["sdd", "status", "--help"], searchPath);
  assert.equal(statusHelp.status, 0, statusHelp.stderr);
  assert.match(statusHelp.stdout, /--spec <path>/);

  const legacy = runCli(repo, ["sdd", "workspace"], searchPath);
  assert.notEqual(legacy.status, 0);
  assert.equal(legacy.stdout, "");
  assert.match(legacy.stderr, /unknown command 'workspace'/);
});
