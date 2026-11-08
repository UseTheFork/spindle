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
  return { git };
}

test("packaged sdd create and status expose feature state outside the checkout", (t) => {
  const cli = packagedCli(t);
  const gitWorkspace = tempDirectory(t, "spindle-packaged-git-");
  const { git } = makeGitWorkspace(gitWorkspace);

  const created = cli.run(gitWorkspace, [
    "sdd",
    "create",
    "--title",
    "Packaged Feature",
    "--author",
    "maintainer",
  ]);
  assert.equal(created.status, 0, created.stderr);
  assert.equal(created.stderr, "");
  const featureDirectory = join(gitWorkspace, ".scratch", "0001-packaged-feature");
  const expected = {
    feature: "0001-packaged-feature",
    workspace: featureDirectory,
    spec: join(featureDirectory, "spec.md"),
    ledger: join(featureDirectory, "sdd.json"),
  };
  assert.equal(created.stdout, `${JSON.stringify(expected, null, 2)}\n`);
  assert.deepEqual(JSON.parse(created.stdout), expected);
  assert.equal(readFileSync(expected.spec, "utf8"), "# Packaged Feature\n");
  assert.deepEqual(readdirSync(featureDirectory).sort(), [
    "issues",
    "reports",
    "sdd.json",
    "spec.md",
  ]);

  const ledgerBeforeStatus = readFileSync(expected.ledger, "utf8");
  const ledger = JSON.parse(ledgerBeforeStatus);
  assert.deepEqual(ledger.reviewPolicy, {
    version: 1,
    issue: ["sdd-reviewer"],
    delivery: ["sdd-reviewer"],
  });
  assert.deepEqual(ledger.delivery, { execution: "unstarted", history: [] });
  assert.deepEqual(ledger.issues, []);
  const statusBefore = git("status", "--porcelain=v1");
  const inspected = cli.run(gitWorkspace, ["sdd", "status", "--spec", expected.spec]);
  assert.equal(inspected.status, 0, inspected.stderr);
  assert.equal(inspected.stderr, "");
  const expectedStatus = {
    feature: expected.feature,
    workspace: featureDirectory,
    spec: expected.spec,
    ledger: expected.ledger,
    state: ledger,
    snapshots: [],
    findings: [],
    requirementsDecisions: [],
    actions: [],
    pendingAssignments: [],
    blockers: [],
    delivery: {
      scope: "delivery",
      execution: "unstarted",
      action: "review",
      retrospectiveRequired: false,
      finished: false,
      findings: [],
      correctionAttempts: [],
      reviewRequirements: [],
      reviewAssignments: [],
      requiredChecks: [],
      checkRecords: [],
      blockers: ["Aggregate evidence requires at least one issue."],
    },
  };
  assert.equal(inspected.stdout, `${JSON.stringify(expectedStatus, null, 2)}\n`);
  assert.deepEqual(JSON.parse(inspected.stdout), expectedStatus);
  assert.equal(readFileSync(expected.ledger, "utf8"), ledgerBeforeStatus);
  assert.equal(git("status", "--porcelain=v1"), statusBefore);

  const invocationWorkspace = tempDirectory(t, "spindle-packaged-setup-invocation-");
  makeGitWorkspace(invocationWorkspace);
  const setupWorkspace = tempDirectory(t, "spindle-packaged-setup-");
  assert.equal(existsSync(join(setupWorkspace, ".git")), false);
  assert.equal(existsSync(join(setupWorkspace, ".github", "spindle.json")), false);
  const setup = cli.run(invocationWorkspace, ["setup-project", "--workspace", setupWorkspace]);
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
  const repeated = cli.run(invocationWorkspace, ["setup-project", "--workspace", setupWorkspace]);
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

  const rootHelp = cli.run(setupWorkspace, ["--help"]);
  assert.equal(rootHelp.status, 0, rootHelp.stderr);
  assert.match(rootHelp.stdout, /^\s*sdd\b/m);
  assert.match(rootHelp.stdout, /^\s*setup-project\b/m);
  assert.equal(rootHelp.stderr, "");

  const sddHelp = cli.run(setupWorkspace, ["sdd", "--help"]);
  assert.equal(sddHelp.status, 0, sddHelp.stderr);
  assert.match(sddHelp.stdout, /^\s+create\s/m);
  assert.match(sddHelp.stdout, /^\s+status\s/m);
  assert.equal(sddHelp.stderr, "");

  for (const [args, expectedContent] of [
    [
      ["sdd", "create", "--help"],
      ["--title <title>", "--author <author>", "--require-retrospective"],
    ],
    [["sdd", "status", "--help"], ["--spec <path>"]],
    [["setup-project", "--help"], ["--workspace"]],
  ] as const) {
    const result = cli.run(setupWorkspace, args);
    assert.equal(result.status, 0, result.stderr);
    for (const content of expectedContent) {
      assert.ok(result.stdout.includes(content), `${args.join(" ")} should describe ${content}`);
    }
    assert.equal(result.stderr, "");
  }
});

test("packaged init from a nested directory targets the Git worktree root", (t) => {
  const cli = packagedCli(t);
  const project = tempDirectory(t, "spindle-packaged-git-root-");
  makeGitWorkspace(project);
  const nested = join(project, "packages", "nested");
  mkdirSync(nested, { recursive: true });
  const args = ["init", "--stack", "python", "--no-interactive"];
  const env = { SPINDLE_BLUEPRINTS_DIR: join(cli.root, "build", "blueprints") };

  const fromRoot = cli.run(project, args, env);
  assert.equal(fromRoot.status, 0, fromRoot.stderr);
  const rootConfig = readFileSync(join(project, ".github", "spindle.json"), "utf8");
  const rootSkill = readFileSync(
    join(project, ".github", "skills", "int-test-driven-development", "SKILL.md"),
    "utf8",
  );
  rmSync(join(project, ".github"), { recursive: true });

  const fromNested = cli.run(nested, args, env);
  assert.equal(fromNested.status, 0, fromNested.stderr);
  assert.equal(fromNested.stdout, fromRoot.stdout);
  assert.equal(readFileSync(join(project, ".github", "spindle.json"), "utf8"), rootConfig);
  assert.equal(
    readFileSync(
      join(project, ".github", "skills", "int-test-driven-development", "SKILL.md"),
      "utf8",
    ),
    rootSkill,
  );
  assert.deepEqual(readdirSync(nested), []);
});

test("packaged CLI renders an Internal Skill and updates relocated references outside the checkout", (t) => {
  const cli = packagedCli(t);
  const project = tempDirectory(t, "spindle-packaged-computed-project-");
  execFileSync("git", ["init", "-q"], { cwd: project });
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

  const designShippedDirectory = join(packagedBlueprints, "skills", "int-codebase-design");
  const designInstalledDirectory = join(project, ".github", "skills", "int-codebase-design");
  const designSkill = readFileSync(join(designInstalledDirectory, "SKILL.md"), "utf8");
  const designSourceSkill = readFileSync(join(designShippedDirectory, "SKILL.md"), "utf8");
  assert.equal(
    matter(designSkill).data.metadata.spindle.version,
    matter(designSourceSkill).data.metadata.spindle.version,
  );
  assert.equal(matter(designSkill).data.metadata.spindle.version, "1.1.1");
  assert.doesNotMatch(designSkill, /{%[^%]*\bstacks\b|```(?:typescript|python|php)\n/);
  for (const name of ["DEEPENING.md", "DESIGN-IT-TWICE.md"]) {
    const reference = join("references", name);
    assert.equal(existsSync(join(designShippedDirectory, name)), false);
    assert.equal(existsSync(join(designInstalledDirectory, name)), false);
    assert.equal(
      readFileSync(join(designInstalledDirectory, reference), "utf8"),
      readFileSync(join(designShippedDirectory, reference), "utf8"),
      `the packaged ${reference} must install without changing its content`,
    );
    assert.ok(designSkill.includes(`(./references/${name})`));
  }
  for (const name of ["DEEPENING.md", "DESIGN-IT-TWICE.md"]) {
    const reference = readFileSync(join(designInstalledDirectory, "references", name), "utf8");
    assert.ok(reference.includes("(../SKILL.md)"));
    if (name === "DESIGN-IT-TWICE.md") {
      assert.ok(reference.includes("(DEEPENING.md)"));
    }
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
  const { git } = makeGitWorkspace(gitWorkspace);
  const setupWorkspace = tempDirectory(t, "spindle-packaged-invalid-setup-");
  const beforeStatus = git("status", "--porcelain=v1");

  const invalidCases = [
    ...[
      ["sdd", "create"],
      ["sdd", "create", "--title"],
      ["sdd", "create", "--title", "Feature"],
      ["sdd", "create", "--title", "Feature", "--author"],
      ["sdd", "create", "--title", "Feature", "--author", "one", "--author", "two"],
      ["sdd", "create", "--title", "Feature", "--author", "maintainer", "--unknown"],
      ["sdd", "create", "--title", "Feature", "--author", "maintainer", "nested"],
      ["sdd", "status"],
      ["sdd", "status", "--spec"],
      ["sdd", "status", "--spec", "missing.md", "--spec", "another.md"],
      ["sdd", "status", "--spec", "missing.md", "--unknown"],
      ["sdd", "status", "--spec", "missing.md", "nested"],
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
    ].map((args) => [args, gitWorkspace] as const),
  ];

  for (const [args, workingDirectory] of invalidCases) {
    const result = cli.run(workingDirectory, args);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
    assert.notEqual(result.stderr.trim(), "", args.join(" "));
    assert.doesNotMatch(
      result.stderr,
      /Unable to discover the Git working-tree root/,
      args.join(" "),
    );
    assert.equal(readdirSync(setupWorkspace).length, 0);
    assert.equal(git("status", "--porcelain=v1"), beforeStatus);
  }
});
