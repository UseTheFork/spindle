import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { test, expect, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

import { runCli, runCliRaw } from "../../helpers/Cli.ts";
import { makeTempDirSync, repoRoot } from "../../helpers/TemporaryDirectories.ts";

const copies = [
  ["domain.md", "docs/agents/domain.md"],
  ["issue-tracker-local.md", "docs/agents/issue-tracker.md"],
  ["triage-labels.md", "docs/agents/triage-labels.md"],
  ["tooling.md", "docs/agents/tooling.md"],
] as const;

function fixture() {
  return makeTempDirSync("setup-project-test-");
}

test("setup-project creates the required directories and exact defaults", async () => {
  const workspace = fixture();

  const result = runCli(
    workspace,
    ["setup-project", "--workspace", workspace],
    process.env.PATH ?? "",
  );

  expect(result.status, result.stderr).toBe(0);
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
  expect(JSON.parse(result.stdout)).toEqual(expected);
  expect(result.stdout).toBe(`${JSON.stringify(expected, null, 2)}\n`);
  for (const directory of ["docs/adr", ".scratch", "docs/agents"]) {
    expect(existsSync(join(workspace, directory))).toBe(true);
  }
  for (const [source, destination] of copies) {
    expect(readFileSync(join(workspace, destination), "utf8")).toBe(
      readFileSync(join(repoRoot, "src/Assets/SetupProject/templates", source), "utf8"),
    );
  }
  expect(existsSync(join(workspace, "GLOSSARY.md"))).toBe(false);
  expect(existsSync(join(workspace, ".github"))).toBe(false);
});

test("setup-project honors an explicit target outside the invocation repository", async () => {
  const invocation = fixture();
  const workspace = fixture();

  const result = runCli(
    invocation,
    ["setup-project", "--workspace", workspace],
    process.env.PATH ?? "",
  );

  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).workspace).toBe(workspace);
  expect(existsSync(join(workspace, "docs/agents/domain.md"))).toBe(true);
  expect(existsSync(join(invocation, "docs"))).toBe(false);
});

test("setup-project preserves custom files byte-for-byte on repeated runs", async () => {
  const workspace = fixture();
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
  expect(first.status, first.stderr).toBe(0);
  const firstResult = JSON.parse(first.stdout);
  expect(firstResult.created).toEqual([
    "docs/adr",
    ".scratch",
    "docs/agents/issue-tracker.md",
    "docs/agents/triage-labels.md",
  ]);
  expect(firstResult.preserved).toEqual([
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
  expect(second.status, second.stderr).toBe(0);
  const secondResult = JSON.parse(second.stdout);
  expect(secondResult.created).toEqual([]);
  expect(secondResult.preserved).toEqual([
    "docs",
    "docs/adr",
    ".scratch",
    "docs/agents",
    "docs/agents/domain.md",
    "docs/agents/issue-tracker.md",
    "docs/agents/triage-labels.md",
    "docs/agents/tooling.md",
  ]);
  expect(copies.map(([, relative]) => readFileSync(join(workspace, relative)))).toEqual(before);
  expect(readFileSync(join(workspace, "docs/agents/domain.md"))).toEqual(customDomain);
  expect(readFileSync(join(workspace, "docs/agents/tooling.md"))).toEqual(customTooling);
});

test("setup-project rejects directory and dangling file symlink destinations", async () => {
  const workspace = fixture();
  const outside = join(workspace, "outside");
  mkdirSync(outside);
  symlinkSync(outside, join(workspace, "docs"));

  const directoryLink = runCli(
    workspace,
    ["setup-project", "--workspace", workspace],
    process.env.PATH ?? "",
  );
  expect(directoryLink.status).not.toBe(0);
  expect(directoryLink.stdout).toBe("");
  expect(directoryLink.stderr).toMatch(/spindle:.*symlink/);
  expect(await readdir(outside)).toEqual([]);

  unlinkSync(join(workspace, "docs"));
  mkdirSync(join(workspace, "docs/agents"), { recursive: true });
  const danglingTarget = join(outside, "missing.md");
  symlinkSync(danglingTarget, join(workspace, "docs/agents/domain.md"));
  const fileLink = runCli(
    workspace,
    ["setup-project", "--workspace", workspace],
    process.env.PATH ?? "",
  );
  expect(fileLink.status).not.toBe(0);
  expect(fileLink.stdout).toBe("");
  expect(fileLink.stderr).toMatch(/spindle:.*symlink/);
  expect(existsSync(danglingTarget)).toBe(false);
});

test("setup-project retains partial setup when a later default conflicts with a directory", async () => {
  const workspace = fixture();
  mkdirSync(join(workspace, "docs/agents/triage-labels.md"), { recursive: true });

  const result = runCli(
    workspace,
    ["setup-project", "--workspace", workspace],
    process.env.PATH ?? "",
  );

  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toMatch(/spindle:.*regular file/);
  expect(existsSync(join(workspace, "docs/adr"))).toBe(true);
  expect(existsSync(join(workspace, ".scratch"))).toBe(true);
  expect(existsSync(join(workspace, "docs/agents/domain.md"))).toBe(true);
  expect(existsSync(join(workspace, "docs/agents/issue-tracker.md"))).toBe(true);
  expect(existsSync(join(workspace, "docs/agents/triage-labels.md"))).toBe(true);
});

test("setup-project rejects malformed CLI arguments and workspace conflicts", async () => {
  const workspace = fixture();
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
    ["setup-project", "--workspace", conflict],
  ];

  for (const args of invalidCases) {
    const result = runCli(workspace, args, process.env.PATH ?? "");
    expect(result.status, args.join(" ")).not.toBe(0);
    expect(result.stdout, args.join(" ")).toBe("");
    expect(result.stderr.trim(), args.join(" ")).not.toBe("");
  }
  expect(readFileSync(file, "utf8")).toBe("preserve\n");
  expect(readFileSync(join(conflict, "docs"), "utf8")).toBe("preserve\n");
});

test("setup-project and top-level help describe the public command", async () => {
  const workspace = fixture();

  const commandHelp = runCli(workspace, ["setup-project", "--help"], process.env.PATH ?? "");
  expect(commandHelp.status, commandHelp.stderr).toBe(0);
  expect(commandHelp.stdout).toMatch(/Usage: spindle setup-project \[options\]/);
  expect(commandHelp.stdout).toMatch(/--workspace <path>/);

  const topLevelHelp = runCli(workspace, ["--help"], process.env.PATH ?? "");
  expect(topLevelHelp.status, topLevelHelp.stderr).toBe(0);
  expect(topLevelHelp.stdout).toMatch(/Commands:[\s\S]*\bsetup-project\b/);
});

test("setup-project still requires Git at invocation, not at its explicit target", () => {
  const invocation = fixture();
  const workspace = fixture();
  const result = runCliRaw(
    invocation,
    ["setup-project", "--workspace", workspace],
    process.env.PATH ?? "",
  );
  expect(result.status).not.toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toMatch(/Git|git/);
  expect(existsSync(join(workspace, "docs"))).toBe(false);
});
