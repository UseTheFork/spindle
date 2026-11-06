import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
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
import { join, resolve } from "node:path";
import { test, type TestContext } from "node:test";

import matter from "gray-matter";

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
    run(project: string, args: string[], env: Record<string, string> = {}) {
      return spawnSync(process.execPath, [join(packageRoot, "build", "index.js"), ...args], {
        cwd: project,
        encoding: "utf8",
        env: { ...process.env, ...env, FORCE_COLOR: "0" },
      });
    },
  };
}

function tempDirectory(t: TestContext, prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
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
  const gitWorkspace = tempDirectory(t, "spindle-packaged-git-");
  const { git, reportsDirectory, reportsRelative } = makeGitWorkspace(gitWorkspace);
  const originalReport = readFileSync(join(reportsDirectory, "03-implementation.md"));
  const cleanStatus = git("status", "--porcelain=v1");

  for (const round of [undefined, "2"]) {
    const args = sddArgs(gitWorkspace, reportsRelative);
    if (round) args.push("--round", round);
    const result = cli.run(gitWorkspace, args);
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
  const setup = cli.run(setupWorkspace, ["setup-project", "--workspace", setupWorkspace]);
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
  const repeated = cli.run(setupWorkspace, ["setup-project", "--workspace", setupWorkspace]);
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
test("packaged command discovery and help remain intact", (t) => {
  const cli = packagedCli(t);
  const setupWorkspace = tempDirectory(t, "spindle-packaged-help-setup-");

  for (const [args, expected] of [
    [["--help"], /sdd \(see `spindle sdd --help`\).*setup-project/s],
    [["sdd", "--help"], /workspace/],
    [["sdd", "workspace", "--help"], /--reports-dir \.scratch/],
    [
      ["setup-project", "--help"],
      /Usage:.*spindle setup-project --workspace ABSOLUTE_PROJECT_ROOT/s,
    ],
  ] as const) {
    const result = cli.run(setupWorkspace, args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, expected);
    assert.equal(result.stderr, "");
  }
});

test("packaged CLI renders an Internal Skill and updates relocated references outside the checkout", (t) => {
  const cli = packagedCli(t);
  const project = tempDirectory(t, "spindle-packaged-computed-project-");
  const blueprintRoot = tempDirectory(t, "spindle-packaged-computed-blueprints-");
  const packagedBlueprints = join(blueprintRoot, "blueprints");
  cpSync(join(cli.root, "build", "blueprints"), packagedBlueprints, { recursive: true });

  const shippedSkill = join(
    packagedBlueprints,
    "skills",
    "int-test-driven-development",
    "SKILL.md",
  );
  const source = readFileSync(shippedSkill, "utf8");
  const sourceFrontmatter = matter(source).data;
  assert.equal(
    sourceFrontmatter.description,
    "{{ computed.internal_skill_description }}",
    "the packaged shipped asset must contain the migrated description template",
  );

  const result = cli.run(project, ["init", "--stack", "python", "--no-interactive"], {
    SPINDLE_BLUEPRINTS_DIR: packagedBlueprints,
  });
  assert.equal(result.status, 0, result.stderr);

  const installed = readFileSync(
    join(project, ".github", "skills", "int-test-driven-development", "SKILL.md"),
    "utf8",
  );
  assert.equal(
    matter(installed).data.description,
    "This is an internal skill do not load it unless explicitly required by the user or another skill.",
  );
  assert.equal(
    matter(installed).data.metadata.spindle.version,
    sourceFrontmatter.metadata.spindle.version,
  );
  assert.doesNotMatch(installed, /{{|}}/);

  const shippedDirectory = join(packagedBlueprints, "skills", "int-test-driven-development");
  const installedDirectory = join(project, ".github", "skills", "int-test-driven-development");
  for (const name of ["tests.md", "mocking.md"]) {
    const reference = join("references", name);
    assert.equal(existsSync(join(shippedDirectory, name)), false);
    assert.equal(existsSync(join(installedDirectory, name)), false);
    assert.equal(
      readFileSync(join(installedDirectory, reference), "utf8"),
      readFileSync(join(shippedDirectory, reference), "utf8"),
      `the packaged ${reference} must install without changing its content`,
    );
    assert.ok(installed.includes(`(./references/${name})`));
  }

  const domainShippedDirectory = join(packagedBlueprints, "skills", "int-domain-modeling");
  const domainInstalledDirectory = join(project, ".github", "skills", "int-domain-modeling");
  const domainSkill = readFileSync(join(domainInstalledDirectory, "SKILL.md"), "utf8");
  const domainSourceSkill = readFileSync(join(domainShippedDirectory, "SKILL.md"), "utf8");
  const domainSourceVersion = matter(domainSourceSkill).data.metadata.spindle.version;
  assert.equal(domainSourceVersion, "1.0.1");
  assert.equal(matter(domainSkill).data.metadata.spindle.version, domainSourceVersion);
  for (const name of ["ADR-FORMAT.md", "GLOSSARY-FORMAT.md"]) {
    const reference = join("references", name);
    assert.equal(existsSync(join(domainShippedDirectory, name)), false);
    assert.equal(existsSync(join(domainInstalledDirectory, name)), false);
    assert.equal(
      readFileSync(join(domainInstalledDirectory, reference), "utf8"),
      readFileSync(join(domainShippedDirectory, reference), "utf8"),
      `the packaged ${reference} must install without changing its content`,
    );
    assert.ok(domainSkill.includes(`(./references/${name})`));
  }

  const legacySkill = matter(installed);
  legacySkill.data.metadata.spindle.version = "1.0.0";
  writeFileSync(
    join(installedDirectory, "SKILL.md"),
    matter.stringify(legacySkill.content, legacySkill.data),
  );
  rmSync(join(installedDirectory, "references"), { recursive: true });
  for (const name of ["tests.md", "mocking.md"]) {
    writeFileSync(
      join(installedDirectory, name),
      readFileSync(join(shippedDirectory, "references", name), "utf8"),
    );
  }

  const updated = cli.run(project, ["update", "--no-interactive", "--on-conflict", "overwrite"], {
    SPINDLE_BLUEPRINTS_DIR: packagedBlueprints,
  });
  assert.equal(updated.status, 0, updated.stderr);
  for (const name of ["tests.md", "mocking.md"]) {
    assert.equal(existsSync(join(installedDirectory, name)), false);
    assert.equal(
      readFileSync(join(installedDirectory, "references", name), "utf8"),
      readFileSync(join(shippedDirectory, "references", name), "utf8"),
    );
  }
});

test("packaged workflow commands reject malformed, duplicate, inapplicable, and nested arguments", (t) => {
  const cli = packagedCli(t);
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
    const result = cli.run(workingDirectory, args);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
    assert.match(result.stderr, /^spindle:/, args.join(" "));
    assert.equal(readdirSync(setupWorkspace).length, 0);
    assert.equal(git("status", "--porcelain=v1"), beforeStatus);
  }
});
