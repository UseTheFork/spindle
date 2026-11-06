import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { runCli } from "./helpers.ts";

const copies = [
  ["domain.md", "docs/agents/domain.md"],
  ["issue-tracker-local.md", "docs/agents/issue-tracker.md"],
  ["triage-labels.md", "docs/agents/triage-labels.md"],
  ["tooling.md", "docs/agents/tooling.md"],
] as const;

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "setup-project-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("setup-project creates the required directories and exact defaults", async (t) => {
  const workspace = fixture(t);

  const result = runCli(
    workspace,
    ["setup-project", "--workspace", workspace],
    process.env.PATH ?? "",
  );

  assert.equal(result.status, 0, result.stderr);
  const expected = {
    workspace,
    created: [
      "docs",
      "docs/adr",
      ".scratch",
      "docs/agents",
      "docs/agents/domain.md",
      "docs/agents/issue-tracker.md",
      "docs/agents/triage-labels.md",
      "docs/agents/tooling.md",
    ],
    preserved: [],
  };
  assert.deepEqual(JSON.parse(result.stdout), expected);
  assert.equal(result.stdout, `${JSON.stringify(expected, null, 2)}\n`);
  for (const directory of ["docs/adr", ".scratch", "docs/agents"]) {
    assert.equal(existsSync(join(workspace, directory)), true);
  }
  for (const [source, destination] of copies) {
    assert.equal(
      readFileSync(join(workspace, destination), "utf8"),
      readFileSync(join(process.cwd(), "src/setup-project/templates", source), "utf8"),
    );
  }
  assert.equal(existsSync(join(workspace, "GLOSSARY.md")), false);
  assert.equal(existsSync(join(workspace, ".github")), false);
});

test("setup-project honors an explicit target outside the invocation repository", async (t) => {
  const invocation = fixture(t);
  const workspace = fixture(t);

  const result = runCli(
    invocation,
    ["setup-project", "--workspace", workspace],
    process.env.PATH ?? "",
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).workspace, workspace);
  assert.equal(existsSync(join(workspace, "docs/agents/domain.md")), true);
  assert.equal(existsSync(join(invocation, "docs")), false);
});

test("setup-project preserves custom files byte-for-byte on repeated runs", async (t) => {
  const workspace = fixture(t);
  mkdirSync(join(workspace, "docs/agents"), { recursive: true });
  const customDomain = Buffer.from([0x63, 0x75, 0x73, 0x74, 0x6f, 0x6d, 0x00, 0xff]);
  const customTooling = Buffer.from("custom tooling\r\n");
  writeFileSync(join(workspace, "docs/agents/domain.md"), customDomain);
  writeFileSync(join(workspace, "docs/agents/tooling.md"), customTooling);

  const first = runCli(
    workspace,
    ["setup-project", "--workspace", workspace],
    process.env.PATH ?? "",
  );
  assert.equal(first.status, 0, first.stderr);
  const firstResult = JSON.parse(first.stdout);
  assert.deepEqual(firstResult.created, [
    "docs/adr",
    ".scratch",
    "docs/agents/issue-tracker.md",
    "docs/agents/triage-labels.md",
  ]);
  assert.deepEqual(firstResult.preserved, [
    "docs",
    "docs/agents",
    "docs/agents/domain.md",
    "docs/agents/tooling.md",
  ]);

  const before = copies.map(([, relative]) => readFileSync(join(workspace, relative)));
  const second = runCli(
    workspace,
    ["setup-project", "--workspace", workspace],
    process.env.PATH ?? "",
  );
  assert.equal(second.status, 0, second.stderr);
  const secondResult = JSON.parse(second.stdout);
  assert.deepEqual(secondResult.created, []);
  assert.deepEqual(secondResult.preserved, [
    "docs",
    "docs/adr",
    ".scratch",
    "docs/agents",
    "docs/agents/domain.md",
    "docs/agents/issue-tracker.md",
    "docs/agents/triage-labels.md",
    "docs/agents/tooling.md",
  ]);
  assert.deepEqual(
    copies.map(([, relative]) => readFileSync(join(workspace, relative))),
    before,
  );
  assert.deepEqual(readFileSync(join(workspace, "docs/agents/domain.md")), customDomain);
  assert.deepEqual(readFileSync(join(workspace, "docs/agents/tooling.md")), customTooling);
});

test("setup-project rejects directory and dangling file symlink destinations", async (t) => {
  const workspace = fixture(t);
  const outside = join(workspace, "outside");
  mkdirSync(outside);
  symlinkSync(outside, join(workspace, "docs"));

  const directoryLink = runCli(
    workspace,
    ["setup-project", "--workspace", workspace],
    process.env.PATH ?? "",
  );
  assert.notEqual(directoryLink.status, 0);
  assert.equal(directoryLink.stdout, "");
  assert.match(directoryLink.stderr, /spindle:.*symlink/);
  assert.deepEqual(await readdir(outside), []);

  unlinkSync(join(workspace, "docs"));
  mkdirSync(join(workspace, "docs/agents"), { recursive: true });
  const danglingTarget = join(outside, "missing.md");
  symlinkSync(danglingTarget, join(workspace, "docs/agents/domain.md"));
  const fileLink = runCli(
    workspace,
    ["setup-project", "--workspace", workspace],
    process.env.PATH ?? "",
  );
  assert.notEqual(fileLink.status, 0);
  assert.equal(fileLink.stdout, "");
  assert.match(fileLink.stderr, /spindle:.*symlink/);
  assert.equal(existsSync(danglingTarget), false);
});

test("setup-project retains partial setup when a later default conflicts with a directory", async (t) => {
  const workspace = fixture(t);
  mkdirSync(join(workspace, "docs/agents/triage-labels.md"), { recursive: true });

  const result = runCli(
    workspace,
    ["setup-project", "--workspace", workspace],
    process.env.PATH ?? "",
  );

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /spindle:.*regular file/);
  assert.equal(existsSync(join(workspace, "docs/adr")), true);
  assert.equal(existsSync(join(workspace, ".scratch")), true);
  assert.equal(existsSync(join(workspace, "docs/agents/domain.md")), true);
  assert.equal(existsSync(join(workspace, "docs/agents/issue-tracker.md")), true);
  assert.equal(existsSync(join(workspace, "docs/agents/triage-labels.md")), true);
});

test("setup-project rejects malformed CLI arguments and workspace conflicts", async (t) => {
  const workspace = fixture(t);
  const missing = join(workspace, "missing");
  const file = join(workspace, "project-file");
  writeFileSync(file, "preserve\n");
  const conflict = join(workspace, "conflict");
  mkdirSync(conflict);
  writeFileSync(join(conflict, "docs"), "preserve\n");

  const invalidCases = [
    [],
    ["setup-project"],
    ["setup-project", "--workspace", "."],
    ["setup-project", "--workspace", missing],
    ["setup-project", "--workspace", file],
    ["setup-project", "--workspace", workspace, "--unknown"],
    ["setup-project", "--workspace", workspace, "--workspace", workspace],
    ["setup-project", "extra", "--workspace", workspace],
    ["setup-project", "init", "--workspace", workspace],
    ["setup-project", "--workspace", workspace, "--stack", "typescript"],
    ["setup-project", "--workspace"],
    ["setup-project", "--workspace", workspace, "--help"],
    ["setup-project", "--workspace", conflict],
  ];

  for (const args of invalidCases) {
    const result = runCli(workspace, args, process.env.PATH ?? "");
    assert.notEqual(result.status, 0, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
    assert.match(result.stderr, /spindle:/, args.join(" "));
  }
  assert.equal(readFileSync(file, "utf8"), "preserve\n");
  assert.equal(readFileSync(join(conflict, "docs"), "utf8"), "preserve\n");
});

test("setup-project and top-level help describe the public command", async (t) => {
  const workspace = fixture(t);

  const commandHelp = runCli(workspace, ["setup-project", "--help"], process.env.PATH ?? "");
  assert.equal(commandHelp.status, 0, commandHelp.stderr);
  assert.match(
    commandHelp.stdout,
    /Usage:.*spindle setup-project --workspace ABSOLUTE_PROJECT_ROOT/,
  );
  assert.match(commandHelp.stdout, /--workspace <path>/);

  const topLevelHelp = runCli(workspace, ["--help"], process.env.PATH ?? "");
  assert.equal(topLevelHelp.status, 0, topLevelHelp.stderr);
  assert.match(topLevelHelp.stdout, /setup-project \(see `spindle setup-project --help`\)/);
});
