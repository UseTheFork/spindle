import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
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
import { delimiter, join, resolve } from "node:path";
import { test, type TestContext } from "node:test";

const checkout = resolve(process.cwd());
const setupTemplates = [
  ["domain.md", "docs/agents/domain.md"],
  ["issue-tracker-local.md", "docs/agents/issue-tracker.md"],
  ["triage-labels.md", "docs/agents/triage-labels.md"],
  ["tooling.md", "docs/agents/tooling.md"],
] as const;

function packagedCli(t: TestContext) {
  const packageRoot = mkdtempSync(join(tmpdir(), "spindle-packaged-cli-"));
  t.after(() => rmSync(packageRoot, { recursive: true, force: true }));
  cpSync(join(checkout, "build"), join(packageRoot, "build"), { recursive: true });
  cpSync(join(checkout, "package.json"), join(packageRoot, "package.json"));
  // Use installed runtime dependencies as an installed package would, while keeping
  // the executable and all of its package assets outside the checkout.
  symlinkSync(join(checkout, "node_modules"), join(packageRoot, "node_modules"), "dir");

  assert.equal(existsSync(join(packageRoot, "src")), false);
  assert.equal(existsSync(join(packageRoot, ".github", "scripts")), false);
  assert.equal(existsSync(join(packageRoot, "build", "index.js")), true);
  for (const [template] of setupTemplates) {
    assert.equal(
      existsSync(join(packageRoot, "build", "setup-project", "templates", template)),
      true,
    );
  }

  return {
    root: packageRoot,
    run(project: string, args: string[], path: string, env: Record<string, string> = {}) {
      return spawnSync(process.execPath, [join(packageRoot, "build", "index.js"), ...args], {
        cwd: project,
        encoding: "utf8",
        env: { ...process.env, ...env, FORCE_COLOR: "0", PATH: path, Path: path },
      });
    },
  };
}

function tempDirectory(t: TestContext, prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function justDirectory(t: TestContext) {
  const directory = tempDirectory(t, "spindle-packaged-just-");
  const executable = join(directory, process.platform === "win32" ? "just.exe" : "just");
  writeFileSync(executable, "#!/bin/sh\nexit 0\n");
  chmodSync(executable, 0o755);
  return directory;
}

function pathWithJust(directory: string) {
  return `${directory}${delimiter}${process.env.PATH ?? ""}`;
}

function makeGitWorkspace(directory: string) {
  mkdirSync(directory, { recursive: true });
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Packaged CLI fixture");
  git("config", "user.email", "packaged-cli@example.invalid");

  const reportsRelative = ".scratch/2026-11-02-packaged-cli/reports";
  const reportsDirectory = join(directory, reportsRelative);
  mkdirSync(reportsDirectory, { recursive: true });
  writeFileSync(join(directory, "tracked.txt"), "fixture\n");
  writeFileSync(join(reportsDirectory, "03-implementation.md"), "existing report\n");
  git("add", ".");
  git("commit", "-qm", "package fixture");
  return { git, reportsDirectory, reportsRelative };
}

function sddArgs(workspace: string, reportsRelative: string) {
  return [
    "sdd",
    "workspace",
    "--workspace",
    workspace,
    "--reports-dir",
    reportsRelative,
    "--ticket",
    "03",
  ];
}

test("packaged workflows use bundled defaults and preserve exact SDD behavior outside the checkout", (t) => {
  const cli = packagedCli(t);
  const justPath = pathWithJust(justDirectory(t));
  const gitWorkspace = tempDirectory(t, "spindle-packaged-git-");
  const { git, reportsDirectory, reportsRelative } = makeGitWorkspace(gitWorkspace);
  const originalReport = readFileSync(join(reportsDirectory, "03-implementation.md"));
  const cleanStatus = git("status", "--porcelain=v1");

  for (const round of [undefined, "2"]) {
    const args = sddArgs(gitWorkspace, reportsRelative);
    if (round) args.push("--round", round);
    const result = cli.run(gitWorkspace, args, justPath);
    assert.equal(result.status, 0, result.stderr);

    const reports: Record<string, { relative: string; absolute: string }> = {
      implementation: {
        relative: `${reportsRelative}/03-implementation.md`,
        absolute: join(reportsDirectory, "03-implementation.md"),
      },
      codeReview: {
        relative: `${reportsRelative}/03-code-review.md`,
        absolute: join(reportsDirectory, "03-code-review.md"),
      },
      taskReview: {
        relative: `${reportsRelative}/03-task-review.md`,
        absolute: join(reportsDirectory, "03-task-review.md"),
      },
    };
    if (round) {
      reports.scopedReview = {
        relative: `${reportsRelative}/03-round-${round}-review.md`,
        absolute: join(reportsDirectory, `03-round-${round}-review.md`),
      };
    }
    reports.finalReview = {
      relative: `${reportsRelative}/final-review.md`,
      absolute: join(reportsDirectory, "final-review.md"),
    };
    reports.finalFixReview = {
      relative: `${reportsRelative}/final-fix-review.md`,
      absolute: join(reportsDirectory, "final-fix-review.md"),
    };
    const expected = {
      workspace: gitWorkspace,
      reportsDirectory,
      reports,
    };
    assert.equal(result.stdout, `${JSON.stringify(expected, null, 2)}\n`);
    assert.deepEqual(JSON.parse(result.stdout), expected);
    assert.equal(result.stderr, "");
    assert.deepEqual(readdirSync(reportsDirectory), ["03-implementation.md"]);
    assert.deepEqual(readFileSync(join(reportsDirectory, "03-implementation.md")), originalReport);
    assert.equal(git("status", "--porcelain=v1"), cleanStatus);
  }

  const setupWorkspace = tempDirectory(t, "spindle-packaged-setup-");
  assert.equal(existsSync(join(setupWorkspace, ".git")), false);
  assert.equal(existsSync(join(setupWorkspace, ".github", "spindle.json")), false);
  const setup = cli.run(setupWorkspace, ["setup-project", "--workspace", setupWorkspace], justPath);
  assert.equal(setup.status, 0, setup.stderr);

  const expectedSetup = {
    workspace: setupWorkspace,
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
  assert.equal(setup.stdout, `${JSON.stringify(expectedSetup, null, 2)}\n`);
  assert.deepEqual(JSON.parse(setup.stdout), expectedSetup);
  assert.equal(setup.stderr, "");

  for (const [template, destination] of setupTemplates) {
    assert.deepEqual(
      readFileSync(join(setupWorkspace, destination)),
      readFileSync(join(cli.root, "build", "setup-project", "templates", template)),
    );
  }

  const customDomain = Buffer.from("custom setup guidance\r\n");
  writeFileSync(join(setupWorkspace, "docs/agents/domain.md"), customDomain);
  const repeated = cli.run(
    setupWorkspace,
    ["setup-project", "--workspace", setupWorkspace],
    justPath,
  );
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.deepEqual(JSON.parse(repeated.stdout), {
    workspace: setupWorkspace,
    created: [],
    preserved: [
      "docs",
      "docs/adr",
      ".scratch",
      "docs/agents",
      "docs/agents/domain.md",
      "docs/agents/issue-tracker.md",
      "docs/agents/triage-labels.md",
      "docs/agents/tooling.md",
    ],
  });
  assert.deepEqual(readFileSync(join(setupWorkspace, "docs/agents/domain.md")), customDomain);
});

test("packaged command discovery and help honor the Just prerequisite", (t) => {
  const cli = packagedCli(t);
  const justPath = pathWithJust(justDirectory(t));
  const gitWorkspace = tempDirectory(t, "spindle-packaged-help-git-");
  const { git, reportsRelative } = makeGitWorkspace(gitWorkspace);
  const setupWorkspace = tempDirectory(t, "spindle-packaged-help-setup-");
  const cleanStatus = git("status", "--porcelain=v1");

  for (const [args, expected] of [
    [["--help"], /sdd \(see `spindle sdd --help`\).*setup-project/s],
    [["sdd", "--help"], /workspace/],
    [["sdd", "workspace", "--help"], /--reports-dir \.scratch/],
    [
      ["setup-project", "--help"],
      /Usage:.*spindle setup-project --workspace ABSOLUTE_PROJECT_ROOT/s,
    ],
  ] as const) {
    const result = cli.run(setupWorkspace, args, justPath);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, expected);
    assert.equal(result.stderr, "");
  }

  const withoutJust = [
    [sddArgs(gitWorkspace, reportsRelative), gitWorkspace],
    [["sdd", "--help"], gitWorkspace],
    [["sdd", "workspace", "--help"], gitWorkspace],
    [["setup-project", "--workspace", setupWorkspace], setupWorkspace],
    [["setup-project", "--help"], setupWorkspace],
    [["--help"], setupWorkspace],
  ] as const;
  for (const [args, workingDirectory] of withoutJust) {
    const result = cli.run(workingDirectory, [...args], "");
    assert.notEqual(result.status, 0, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
    assert.match(
      result.stderr,
      /spindle:.*install it from https:\/\/just\.systems\/man\/(?:en\/)?installation\.html/,
      args.join(" "),
    );
    assert.equal(readdirSync(setupWorkspace).length, 0);
    assert.equal(git("status", "--porcelain=v1"), cleanStatus);
  }
});

test("packaged workflow commands reject malformed, duplicate, inapplicable, and nested arguments", (t) => {
  const cli = packagedCli(t);
  const justPath = pathWithJust(justDirectory(t));
  const gitWorkspace = tempDirectory(t, "spindle-packaged-invalid-git-");
  const { git, reportsRelative } = makeGitWorkspace(gitWorkspace);
  const setupWorkspace = tempDirectory(t, "spindle-packaged-invalid-setup-");
  const beforeStatus = git("status", "--porcelain=v1");

  const invalidCases = [
    ...[
      ["sdd", "workspace"],
      ["sdd", "workspace", "--workspace"],
      [...sddArgs(gitWorkspace, reportsRelative), "--unknown", "value"],
      [...sddArgs(gitWorkspace, reportsRelative), "--ticket", "04"],
      [...sddArgs(gitWorkspace, reportsRelative), "--ticket"],
      [...sddArgs(gitWorkspace, reportsRelative), "--round", "2", "--round", "3"],
      [...sddArgs(gitWorkspace, reportsRelative), "--stack", "typescript"],
      [...sddArgs(gitWorkspace, reportsRelative), "nested"],
      ["sdd", "unknown"],
    ].map((args) => [args, gitWorkspace] as const),
    ...[
      ["setup-project"],
      ["setup-project", "--workspace"],
      ["setup-project", "--workspace", setupWorkspace, "--unknown"],
      ["setup-project", "--workspace", setupWorkspace, "--workspace", setupWorkspace],
      ["setup-project", "--workspace", setupWorkspace, "--reports-dir", ".scratch/reports"],
      ["setup-project", "nested", "--workspace", setupWorkspace],
      ["setup-project", "init", "--workspace", setupWorkspace],
      ["setup-project", "--workspace", setupWorkspace, "--help"],
    ].map((args) => [args, setupWorkspace] as const),
  ];

  for (const [args, workingDirectory] of invalidCases) {
    const result = cli.run(workingDirectory, args, justPath);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
    assert.match(result.stderr, /^spindle:/, args.join(" "));
    assert.equal(readdirSync(setupWorkspace).length, 0);
    assert.equal(git("status", "--porcelain=v1"), beforeStatus);
  }
});

test("packaged init and update use bundled catalog, recursive assets, and Just imports outside checkout", (t) => {
  const cli = packagedCli(t);
  const justPath = pathWithJust(justDirectory(t));
  const project = tempDirectory(t, "spindle-packaged-blueprints-");
  const bundledCatalog = join(cli.root, "build", "blueprints", "catalog.yaml");
  const bundledAgent = join(cli.root, "build", "blueprints", "agents", "general.agent.md");
  const bundledAsset = join(
    cli.root,
    "build",
    "blueprints",
    "skills",
    "int-test-driven-development",
    "tests.md",
  );
  const agentTarget = join(project, ".github", "agents", "general.agent.md");
  const installedAsset = join(
    project,
    ".github",
    "skills",
    "int-test-driven-development",
    "tests.md",
  );
  const importNames = ["format", "lint", "test", "tool"];
  const expectedJustfile = `${importNames
    .map((name) => `mod ${name} '.github/scripts/just-modules/${name}.just'`)
    .join("\n")}\n`;
  const noSourceFallback = { SPINDLE_BLUEPRINTS_DIR: "" };
  const packageFiles = (
    JSON.parse(readFileSync(join(cli.root, "package.json"), "utf8")) as { files: string[] }
  ).files;

  assert.equal(existsSync(join(cli.root, "src")), false);
  assert.ok(packageFiles.includes("build"));
  assert.equal(packageFiles.includes("src/blueprints"), false);
  assert.equal(existsSync(bundledCatalog), true);
  assert.equal(existsSync(bundledAgent), true);
  assert.equal(existsSync(bundledAsset), true);

  const initialized = cli.run(
    project,
    ["init", "--stack", "python", "--no-interactive"],
    justPath,
    noSourceFallback,
  );
  assert.equal(initialized.status, 0, initialized.stderr);
  assert.deepEqual(readdirSync(join(project, ".github", "scripts", "just-modules")), [
    "format.just",
    "lint.just",
    "test.just",
    "tool.just",
  ]);
  assert.equal(readFileSync(join(project, "justfile"), "utf8"), expectedJustfile);
  assert.deepEqual(readFileSync(installedAsset), readFileSync(bundledAsset));
  assert.match(readFileSync(agentTarget, "utf8"), /version: 1\.0\.0/);

  const oldAgent = readFileSync(agentTarget, "utf8").replace("version: 1.0.0", "version: 0.1.0");
  writeFileSync(agentTarget, oldAgent);
  const updated = cli.run(
    project,
    ["update", "--no-interactive", "--on-conflict", "overwrite"],
    justPath,
    noSourceFallback,
  );

  assert.equal(updated.status, 0, updated.stderr);
  assert.match(updated.stdout, /updated 1, skipped 0, up to date 10 agent\(s\)/);
  assert.match(readFileSync(agentTarget, "utf8"), /version: 1\.0\.0/);
  assert.doesNotMatch(readFileSync(agentTarget, "utf8"), /version: 0\.1\.0/);
  assert.equal(readFileSync(join(project, "justfile"), "utf8"), expectedJustfile);
  for (const name of importNames) {
    assert.equal(
      existsSync(join(project, ".github", "scripts", "just-modules", `${name}.just`)),
      true,
    );
  }
});
