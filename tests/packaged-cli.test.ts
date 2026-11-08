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
import { join, resolve } from "node:path";

import { test, expect, onTestFinished, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

import matter from "gray-matter";

const checkout = resolve(process.cwd());
const setupTemplates = [
  ["domain.md", "docs/agents/domain.md"],
  ["issue-tracker-local.md", "docs/agents/issue-tracker.md"],
  ["triage-labels.md", "docs/agents/triage-labels.md"],
  ["tooling.md", "docs/agents/tooling.md"],
] as const;

function packagedCli() {
  const packageRoot = mkdtempSync(join(process.cwd(), "spindle-packaged-cli-"));
  onTestFinished(() => rmSync(packageRoot, { recursive: true, force: true }));
  cpSync(join(checkout, "build"), join(packageRoot, "build"), { recursive: true });
  cpSync(join(checkout, "package.json"), join(packageRoot, "package.json"));
  // Use installed runtime dependencies as an installed package would, while keeping
  // the executable and all of its package assets outside the checkout.
  symlinkSync(join(checkout, "node_modules"), join(packageRoot, "node_modules"), "dir");

  expect(existsSync(join(packageRoot, "src"))).toBe(false);
  expect(existsSync(join(packageRoot, ".github", "scripts"))).toBe(false);
  expect(existsSync(join(packageRoot, "build", "index.js"))).toBe(true);
  for (const [template] of setupTemplates) {
    expect(existsSync(join(packageRoot, "build", "setup-project", "templates", template))).toBe(
      true,
    );
  }

  return {
    root: packageRoot,
    run(project: string, args: readonly string[], env: Record<string, string> = {}) {
      return spawnSync(process.execPath, [join(packageRoot, "build", "index.js"), ...args], {
        cwd: project,
        encoding: "utf8",
        env: {
          ...process.env,
          TSX_TSCONFIG_PATH: resolve("tsconfig.json"),
          GIT_CEILING_DIRECTORIES: resolve(process.cwd()),
          ...env,
          FORCE_COLOR: "0",
        },
      });
    },
  };
}

function tempDirectory(prefix: string) {
  const directory = mkdtempSync(join(process.cwd(), prefix));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
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

test("packaged sdd create and status expose feature state outside the checkout", () => {
  const cli = packagedCli();
  const gitWorkspace = tempDirectory("spindle-packaged-git-");
  const { git } = makeGitWorkspace(gitWorkspace);

  const created = cli.run(gitWorkspace, [
    "sdd",
    "create",
    "--title",
    "Packaged Feature",
    "--author",
    "maintainer",
  ]);
  expect(created.status, created.stderr).toBe(0);
  expect(created.stderr).toBe("");
  const featureDirectory = join(gitWorkspace, ".scratch", "0001-packaged-feature");
  const expected = {
    feature: "0001-packaged-feature",
    workspace: featureDirectory,
    spec: join(featureDirectory, "spec.md"),
    ledger: join(featureDirectory, "sdd.json"),
  };
  expect(created.stdout).toBe(`${JSON.stringify(expected, null, 2)}\n`);
  expect(JSON.parse(created.stdout)).toEqual(expected);
  expect(readFileSync(expected.spec, "utf8")).toBe("# Packaged Feature\n");
  expect(readdirSync(featureDirectory).sort()).toEqual([
    "issues",
    "reports",
    "sdd.json",
    "spec.md",
  ]);

  const ledgerBeforeStatus = readFileSync(expected.ledger, "utf8");
  const ledger = JSON.parse(ledgerBeforeStatus);
  expect(ledger.reviewPolicy).toEqual({
    version: 1,
    issue: ["sdd-reviewer"],
    delivery: ["sdd-reviewer"],
  });
  expect(ledger.delivery).toEqual({ execution: "unstarted", history: [] });
  expect(ledger.issues).toEqual([]);
  const statusBefore = git("status", "--porcelain=v1");
  const inspected = cli.run(gitWorkspace, ["sdd", "status", "--spec", expected.spec]);
  expect(inspected.status, inspected.stderr).toBe(0);
  expect(inspected.stderr).toBe("");
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
  expect(inspected.stdout).toBe(`${JSON.stringify(expectedStatus, null, 2)}\n`);
  expect(JSON.parse(inspected.stdout)).toEqual(expectedStatus);
  expect(readFileSync(expected.ledger, "utf8")).toBe(ledgerBeforeStatus);
  expect(git("status", "--porcelain=v1")).toBe(statusBefore);

  const invocationWorkspace = tempDirectory("spindle-packaged-setup-invocation-");
  makeGitWorkspace(invocationWorkspace);
  const setupWorkspace = tempDirectory("spindle-packaged-setup-");
  expect(existsSync(join(setupWorkspace, ".git"))).toBe(false);
  expect(existsSync(join(setupWorkspace, ".github", "spindle.json"))).toBe(false);
  const setup = cli.run(invocationWorkspace, ["setup-project", "--workspace", setupWorkspace]);
  expect(setup.status, setup.stderr).toBe(0);

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
  expect(setup.stdout).toBe(`${JSON.stringify(expectedSetup, null, 2)}\n`);
  expect(JSON.parse(setup.stdout)).toEqual(expectedSetup);
  expect(setup.stderr).toBe("");

  for (const [template, destination] of setupTemplates) {
    expect(readFileSync(join(setupWorkspace, destination))).toEqual(
      readFileSync(join(cli.root, "build", "setup-project", "templates", template)),
    );
  }

  const customDomain = Buffer.from("custom setup guidance\r\n");
  writeFileSync(join(setupWorkspace, "docs/agents/domain.md"), customDomain);
  const repeated = cli.run(invocationWorkspace, ["setup-project", "--workspace", setupWorkspace]);
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout)).toEqual({
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
  expect(readFileSync(join(setupWorkspace, "docs/agents/domain.md"))).toEqual(customDomain);
});
test("packaged command discovery and help remain intact", () => {
  const cli = packagedCli();
  const setupWorkspace = tempDirectory("spindle-packaged-help-setup-");

  const rootHelp = cli.run(setupWorkspace, ["--help"]);
  expect(rootHelp.status, rootHelp.stderr).toBe(0);
  expect(rootHelp.stdout).toMatch(/^\s*sdd\b/m);
  expect(rootHelp.stdout).toMatch(/^\s*setup-project\b/m);
  expect(rootHelp.stderr).toBe("");

  const sddHelp = cli.run(setupWorkspace, ["sdd", "--help"]);
  expect(sddHelp.status, sddHelp.stderr).toBe(0);
  expect(sddHelp.stdout).toMatch(/^\s+create\s/m);
  expect(sddHelp.stdout).toMatch(/^\s+status\s/m);
  expect(sddHelp.stderr).toBe("");

  for (const [args, expectedContent] of [
    [
      ["sdd", "create", "--help"],
      ["--title <title>", "--author <author>", "--require-retrospective"],
    ],
    [["sdd", "status", "--help"], ["--spec <path>"]],
    [["setup-project", "--help"], ["--workspace"]],
  ] as const) {
    const result = cli.run(setupWorkspace, args);
    expect(result.status, result.stderr).toBe(0);
    for (const content of expectedContent) {
      expect(
        result.stdout.includes(content),
        `${args.join(" ")} should describe ${content}`,
      ).toBeTruthy();
    }
    expect(result.stderr).toBe("");
  }
});

test("packaged init from a nested directory targets the Git worktree root", () => {
  const cli = packagedCli();
  const project = tempDirectory("spindle-packaged-git-root-");
  makeGitWorkspace(project);
  const nested = join(project, "packages", "nested");
  mkdirSync(nested, { recursive: true });
  const args = ["init", "--stack", "python", "--no-interactive"];
  const env = { SPINDLE_BLUEPRINTS_DIR: join(cli.root, "build", "blueprints") };

  const fromRoot = cli.run(project, args, env);
  expect(fromRoot.status, fromRoot.stderr).toBe(0);
  const rootConfig = readFileSync(join(project, ".github", "spindle.json"), "utf8");
  const rootSkill = readFileSync(
    join(project, ".github", "skills", "int-test-driven-development", "SKILL.md"),
    "utf8",
  );
  rmSync(join(project, ".github"), { recursive: true });

  const fromNested = cli.run(nested, args, env);
  expect(fromNested.status, fromNested.stderr).toBe(0);
  expect(fromNested.stdout).toBe(fromRoot.stdout);
  expect(readFileSync(join(project, ".github", "spindle.json"), "utf8")).toBe(rootConfig);
  expect(
    readFileSync(
      join(project, ".github", "skills", "int-test-driven-development", "SKILL.md"),
      "utf8",
    ),
  ).toBe(rootSkill);
  expect(readdirSync(nested)).toEqual([]);
});

test("packaged CLI renders an Internal Skill and updates relocated references outside the checkout", () => {
  const cli = packagedCli();
  const project = tempDirectory("spindle-packaged-computed-project-");
  execFileSync("git", ["init", "-q"], { cwd: project });
  const blueprintRoot = tempDirectory("spindle-packaged-computed-blueprints-");
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
  expect(
    sourceFrontmatter.description,
    "the packaged shipped asset must contain the migrated description template",
  ).toBe("{{ computed.internal_skill_description }}");

  const result = cli.run(project, ["init", "--stack", "python", "--no-interactive"], {
    SPINDLE_BLUEPRINTS_DIR: packagedBlueprints,
  });
  expect(result.status, result.stderr).toBe(0);

  const installed = readFileSync(
    join(project, ".github", "skills", "int-test-driven-development", "SKILL.md"),
    "utf8",
  );
  expect(matter(installed).data.description).toBe(
    "This is an internal skill do not load it unless explicitly required by the user or another skill.",
  );
  expect(matter(installed).data.metadata.spindle.version).toBe(
    sourceFrontmatter.metadata.spindle.version,
  );
  expect(installed).not.toMatch(/{{|}}/);

  const shippedDirectory = join(packagedBlueprints, "skills", "int-test-driven-development");
  const installedDirectory = join(project, ".github", "skills", "int-test-driven-development");
  for (const name of ["tests.md", "mocking.md"]) {
    const reference = join("references", name);
    expect(existsSync(join(shippedDirectory, name))).toBe(false);
    expect(existsSync(join(installedDirectory, name))).toBe(false);
    expect(
      readFileSync(join(installedDirectory, reference), "utf8"),
      `the packaged ${reference} must install without changing its content`,
    ).toBe(readFileSync(join(shippedDirectory, reference), "utf8"));
    expect(installed.includes(`(./references/${name})`)).toBeTruthy();
  }

  const domainShippedDirectory = join(packagedBlueprints, "skills", "int-domain-modeling");
  const domainInstalledDirectory = join(project, ".github", "skills", "int-domain-modeling");
  const domainSkill = readFileSync(join(domainInstalledDirectory, "SKILL.md"), "utf8");
  const domainSourceSkill = readFileSync(join(domainShippedDirectory, "SKILL.md"), "utf8");
  const domainSourceVersion = matter(domainSourceSkill).data.metadata.spindle.version;
  expect(domainSourceVersion).toBe("1.0.1");
  expect(matter(domainSkill).data.metadata.spindle.version).toBe(domainSourceVersion);
  for (const name of ["ADR-FORMAT.md", "GLOSSARY-FORMAT.md"]) {
    const reference = join("references", name);
    expect(existsSync(join(domainShippedDirectory, name))).toBe(false);
    expect(existsSync(join(domainInstalledDirectory, name))).toBe(false);
    expect(
      readFileSync(join(domainInstalledDirectory, reference), "utf8"),
      `the packaged ${reference} must install without changing its content`,
    ).toBe(readFileSync(join(domainShippedDirectory, reference), "utf8"));
    expect(domainSkill.includes(`(./references/${name})`)).toBeTruthy();
  }

  const designShippedDirectory = join(packagedBlueprints, "skills", "int-codebase-design");
  const designInstalledDirectory = join(project, ".github", "skills", "int-codebase-design");
  const designSkill = readFileSync(join(designInstalledDirectory, "SKILL.md"), "utf8");
  const designSourceSkill = readFileSync(join(designShippedDirectory, "SKILL.md"), "utf8");
  expect(matter(designSkill).data.metadata.spindle.version).toBe(
    matter(designSourceSkill).data.metadata.spindle.version,
  );
  expect(matter(designSkill).data.metadata.spindle.version).toBe("1.1.1");
  expect(designSkill).not.toMatch(/{%[^%]*\bstacks\b|```(?:typescript|python|php)\n/);
  for (const name of ["DEEPENING.md", "DESIGN-IT-TWICE.md"]) {
    const reference = join("references", name);
    expect(existsSync(join(designShippedDirectory, name))).toBe(false);
    expect(existsSync(join(designInstalledDirectory, name))).toBe(false);
    expect(
      readFileSync(join(designInstalledDirectory, reference), "utf8"),
      `the packaged ${reference} must install without changing its content`,
    ).toBe(readFileSync(join(designShippedDirectory, reference), "utf8"));
    expect(designSkill.includes(`(./references/${name})`)).toBeTruthy();
  }
  for (const name of ["DEEPENING.md", "DESIGN-IT-TWICE.md"]) {
    const reference = readFileSync(join(designInstalledDirectory, "references", name), "utf8");
    expect(reference.includes("(../SKILL.md)")).toBeTruthy();
    if (name === "DESIGN-IT-TWICE.md") {
      expect(reference.includes("(DEEPENING.md)")).toBeTruthy();
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
  expect(updated.status, updated.stderr).toBe(0);
  for (const name of ["tests.md", "mocking.md"]) {
    expect(existsSync(join(installedDirectory, name))).toBe(false);
    expect(readFileSync(join(installedDirectory, "references", name), "utf8")).toBe(
      readFileSync(join(shippedDirectory, "references", name), "utf8"),
    );
  }
});

test("packaged workflow commands reject malformed, duplicate, inapplicable, and nested arguments", () => {
  const cli = packagedCli();
  const gitWorkspace = tempDirectory("spindle-packaged-invalid-git-");
  const { git } = makeGitWorkspace(gitWorkspace);
  const setupWorkspace = tempDirectory("spindle-packaged-invalid-setup-");
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
    expect(result.status, args.join(" ")).not.toBe(0);
    expect(result.stdout, args.join(" ")).toBe("");
    expect(result.stderr.trim(), args.join(" ")).not.toBe("");
    expect(result.stderr, args.join(" ")).not.toMatch(
      /Unable to discover the Git working-tree root/,
    );
    expect(readdirSync(setupWorkspace).length).toBe(0);
    expect(git("status", "--porcelain=v1")).toBe(beforeStatus);
  }
});
