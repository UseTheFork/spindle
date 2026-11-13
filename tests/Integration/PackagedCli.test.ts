import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { test, expect, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

import matter from "gray-matter";

import { makeTempDirSync, repoRoot } from "../Helpers/TemporaryDirectories.ts";

const checkout = repoRoot;
function packagedCli(existingRoot?: string) {
  const packageRoot = existingRoot ?? makeTempDirSync("spindle-packaged-cli-");
  if (!existingRoot) {
    cpSync(join(checkout, "build"), join(packageRoot, "build"), { recursive: true });
    cpSync(join(checkout, "assets"), join(packageRoot, "assets"), { recursive: true });
    cpSync(join(checkout, "package.json"), join(packageRoot, "package.json"));
  }
  // Use installed runtime dependencies as an installed package would, while keeping
  // the executable and all of its package assets outside the checkout.
  symlinkSync(join(checkout, "node_modules"), join(packageRoot, "node_modules"), "dir");

  return {
    root: packageRoot,
    run(project: string, args: readonly string[], env: Record<string, string> = {}) {
      return spawnSync(process.execPath, [join(packageRoot, "build", "index.js"), ...args], {
        cwd: project,
        encoding: "utf8",
        env: {
          ...process.env,
          TSX_TSCONFIG_PATH: join(repoRoot, "tsconfig.json"),
          GIT_CEILING_DIRECTORIES: repoRoot,
          ...env,
          FORCE_COLOR: "0",
        },
      });
    },
  };
}

function tempDirectory(prefix: string) {
  return makeTempDirSync(prefix);
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

test("published tarball supplies assets for initialization and SDD documents", () => {
  const directory = makeTempDirSync("spindle-packed-tarball-");
  execFileSync("pnpm", ["pack", "--pack-destination", directory], { cwd: checkout });
  const archives = readdirSync(directory).filter((name) => name.endsWith(".tgz"));
  expect(archives).toHaveLength(1);
  execFileSync("tar", ["-xzf", join(directory, archives[0]!), "-C", directory]);
  const cli = packagedCli(join(directory, "package"));
  const workspace = tempDirectory("spindle-tarball-workspace-");
  makeGitWorkspace(workspace);

  const initialized = cli.run(workspace, [
    "init",
    "--stack",
    "python",
    "--spindle-package-manager",
    "pnpm",
    "--no-interactive",
  ]);
  expect(initialized.status, initialized.stderr).toBe(0);
  const created = cli.run(workspace, [
    "sdd",
    "create",
    "--title",
    "Tarball feature",
    "--author",
    "maintainer",
    "--with-design",
  ]);
  expect(created.status, created.stderr).toBe(0);
  const feature = join(workspace, ".scratch", "0001-tarball-feature");
  const ticket = cli.run(workspace, [
    "sdd",
    "ticket",
    "create",
    "--spec",
    join(feature, "spec.md"),
    "--title",
    "Tarball ticket",
    "--reporter",
    "maintainer",
    "--category",
    "enhancement",
    "--author",
    "maintainer",
  ]);
  expect(ticket.status, ticket.stderr).toBe(0);
  expect(readFileSync(join(feature, "design.md"), "utf8")).toContain("## Intent");
  expect(readFileSync(join(feature, "tickets", "T-0001.md"), "utf8")).toContain("# Tarball ticket");
});

test("packaged schema describes project settings and supported stacks", () => {
  const cli = packagedCli();
  const schema = JSON.parse(readFileSync(join(cli.root, "build/spindle.schema.json"), "utf8"));
  expect(schema.properties.stacks.items.enum).toEqual(["php-laravel", "python", "typescript"]);
  expect(schema.properties.commit.properties.title_max_length.minimum).toBe(11);
  expect(schema.required).toContain("stacks");
});

test("packaged sdd create and status expose feature state outside the checkout", () => {
  const cli = packagedCli();
  const gitWorkspace = tempDirectory("spindle-packaged-git-");
  const { git } = makeGitWorkspace(gitWorkspace);

  const initialized = cli.run(gitWorkspace, [
    "init",
    "--stack",
    "python",
    "--spindle-package-manager",
    "pnpm",
  ]);
  expect(initialized.status, initialized.stderr).toBe(0);
  expect(initialized.stdout).not.toMatch(/^\{"ok":/);

  const created = cli.run(gitWorkspace, [
    "--json",
    "sdd",
    "create",
    "--title",
    "Packaged Feature",
    "--author",
    "maintainer",
    "--with-design",
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
  expect(created.stdout).toBe(`${JSON.stringify({ ok: true, data: expected })}\n`);
  const createdEnvelope = JSON.parse(created.stdout);
  expect(createdEnvelope).toMatchObject({ ok: true, data: expect.any(Object) });
  expect(createdEnvelope.data).toEqual(expected);
  expect(readFileSync(expected.spec, "utf8")).toContain("# Packaged Feature");
  expect(readFileSync(join(featureDirectory, "design.md"), "utf8")).toContain("## Intent");
  expect(readdirSync(featureDirectory).sort()).toEqual([
    "design.md",
    "reports",
    "sdd.json",
    "spec.md",
    "tickets",
  ]);

  const ledgerBeforeStatus = readFileSync(expected.ledger, "utf8");
  const ledger = JSON.parse(ledgerBeforeStatus);
  expect(ledger.reviewPolicy).toEqual({
    version: 1,
    ticket: ["sdd-task-reviewer"],
    delivery: ["sdd-reviewer"],
  });
  expect(ledger.delivery).toMatchObject({
    status: "active",
    execution: "unstarted",
    baseSha: expect.stringMatching(/^[0-9a-f]{40}$/),
    history: [],
  });
  expect(ledger.tickets).toEqual([]);
  const statusBefore = git("status", "--porcelain=v1");
  const inspected = cli.run(gitWorkspace, ["--json", "sdd", "status", "--spec", expected.spec]);
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
      status: "active",
      execution: "unstarted",
      action: "close-tickets",
      baseSha: ledger.delivery.baseSha,
      retrospectiveRequired: false,
      finished: false,
      findings: [],
      correctionAttempts: [],
      reviewRequirements: [],
      reviewAssignments: [],
      requiredChecks: [],
      checkRecords: [],
      blockers: ["Tickets are not closed: feature has no tickets."],
    },
  };
  expect(inspected.stdout).toBe(`${JSON.stringify({ ok: true, data: expectedStatus })}\n`);
  const statusEnvelope = JSON.parse(inspected.stdout);
  expect(statusEnvelope).toMatchObject({ ok: true, data: expect.any(Object) });
  expect(statusEnvelope.data).toEqual(expectedStatus);
  expect(readFileSync(expected.ledger, "utf8")).toBe(ledgerBeforeStatus);
  expect(git("status", "--porcelain=v1")).toBe(statusBefore);

  const createdTicket = cli.run(gitWorkspace, [
    "--json",
    "sdd",
    "ticket",
    "create",
    "--spec",
    expected.spec,
    "--title",
    "Packaged ticket",
    "--reporter",
    "maintainer",
    "--category",
    "enhancement",
    "--author",
    "controller",
  ]);
  expect(createdTicket.status, createdTicket.stderr).toBe(0);
  const ticketEnvelope = JSON.parse(createdTicket.stdout);
  expect(ticketEnvelope).toMatchObject({ ok: true, data: expect.any(Object) });
  expect(ticketEnvelope.data.ticket).toBe("T-0001");
  const ticket = readFileSync(join(featureDirectory, "tickets", "T-0001.md"), "utf8");
  expect(ticket).toContain("# Packaged ticket");
  expect(ticket).toContain("**Reporter:** maintainer");
  expect(ticket).toContain("**Category:** enhancement");
  expect(ticket).toContain("[REQUIREMENTS]");

  const invocationWorkspace = tempDirectory("spindle-packaged-project-init-");
  makeGitWorkspace(invocationWorkspace);
  const setup = cli.run(invocationWorkspace, [
    "init",
    "--stack",
    "typescript",
    "--spindle-package-manager",
    "pnpm",
    "--no-interactive",
  ]);
  expect(setup.status, setup.stderr).toBe(0);
  expect(setup.stdout).toContain("Initialized project guidance and tooling documentation.");
  expect(setup.stderr).toBe("");
  const copilotTemplate = readFileSync(
    join(checkout, "assets/Templates/project/copilot-instructions.md"),
    "utf8",
  );
  expect(readFileSync(join(invocationWorkspace, ".github/copilot-instructions.md"), "utf8")).toBe(
    `<!-- spindle:start -->\n${copilotTemplate.trimEnd()}\n<!-- spindle:end -->\n`,
  );
  const add = cli.run(invocationWorkspace, [
    "tool",
    "add",
    "--key",
    "test-unit",
    "--section",
    "Testing",
    "--command",
    "pnpm test -- --run",
  ]);
  expect(add.status, add.stderr).toBe(0);
  expect(readFileSync(join(invocationWorkspace, "docs/agents/tooling.md"), "utf8")).toContain(
    "pnpm test -- --run",
  );
  const registry = JSON.parse(
    readFileSync(join(invocationWorkspace, ".github/spindle.json"), "utf8"),
  );
  expect(registry.tooling).toContainEqual({
    key: "test-unit",
    section: "Testing",
    command: "pnpm test -- --run",
  });
  expect(
    JSON.parse(readFileSync(join(invocationWorkspace, ".github/spindle.json"), "utf8")),
  ).toMatchObject({
    stacks: ["typescript"],
    tooling: registry.tooling,
  });
  const listed = cli.run(invocationWorkspace, ["tool", "list"]);
  expect(listed.status, listed.stderr).toBe(0);
  expect(listed.stdout).toMatch(/^Tooling commands \(\d+\):/);
  expect(listed.stdout).toContain("- test-unit [Testing]: pnpm test -- --run");
  expect(listed.stderr).toBe("");
});
test("packaged command discovery and help remain intact", () => {
  const cli = packagedCli();
  const projectWorkspace = tempDirectory("spindle-packaged-help-project-");

  const rootHelp = cli.run(projectWorkspace, ["--help"]);
  expect(rootHelp.status, rootHelp.stderr).toBe(0);
  expect(rootHelp.stdout).toMatch(/^\s*sdd\b/m);
  expect(rootHelp.stdout).toMatch(/^\s*tool\b/m);
  expect(rootHelp.stdout).not.toMatch(/^\s*project\b/m);
  expect(rootHelp.stdout).not.toMatch(/^\s*spindle-project-setup\b/m);
  expect(rootHelp.stderr).toBe("");

  const sddHelp = cli.run(projectWorkspace, ["sdd", "--help"]);
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
    [["init", "--help"], ["Usage: spindle init [options]"]],
    [
      ["tool", "add", "--help"],
      ["--key", "--section", "--command"],
    ],
  ] as const) {
    const result = cli.run(projectWorkspace, args);
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
  const args = [
    "init",
    "--stack",
    "python",
    "--spindle-package-manager",
    "pnpm",
    "--no-interactive",
  ];

  const fromRoot = cli.run(project, args);
  expect(fromRoot.status, fromRoot.stderr).toBe(0);
  const rootConfig = readFileSync(join(project, ".github", "spindle.json"), "utf8");
  const rootSkill = readFileSync(
    join(project, ".github", "skills", "int-test-driven-development", "SKILL.md"),
    "utf8",
  );
  rmSync(join(project, ".github"), { recursive: true });

  const fromNested = cli.run(nested, args);
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
  const result = cli.run(project, [
    "init",
    "--stack",
    "python",
    "--spindle-package-manager",
    "pnpm",
    "--no-interactive",
  ]);
  expect(result.status, result.stderr).toBe(0);

  const skillDirectory = join(project, ".github", "skills", "int-test-driven-development");
  const skillPath = join(skillDirectory, "SKILL.md");
  const installed = readFileSync(skillPath, "utf8");
  expect(matter(installed).data.description).toBe(
    "This is an internal skill do not load it unless explicitly required by the user or another skill.",
  );
  expect(installed).not.toMatch(/{{|}}/);

  for (const [name, references] of [
    ["int-test-driven-development", ["tests.md", "mocking.md"]],
    ["int-domain-modeling", ["ADR-FORMAT.md", "GLOSSARY-FORMAT.md"]],
    ["int-codebase-design", ["DEEPENING.md", "DESIGN-IT-TWICE.md"]],
  ] as const) {
    const directory = join(project, ".github", "skills", name);
    const content = readFileSync(join(directory, "SKILL.md"), "utf8");
    for (const reference of references) {
      expect(content).toContain(`(./references/${reference})`);
      expect(existsSync(join(directory, "references", reference))).toBe(true);
    }
  }

  const legacySkill = matter(installed);
  legacySkill.data.metadata.spindle.version = "1.0.0";
  writeFileSync(skillPath, matter.stringify(legacySkill.content, legacySkill.data));
  rmSync(join(skillDirectory, "references"), { recursive: true });
  for (const name of ["tests.md", "mocking.md"]) {
    writeFileSync(join(skillDirectory, name), "legacy location\n");
  }

  const updated = cli.run(project, ["update"]);
  expect(updated.status, updated.stderr).toBe(0);
  for (const name of ["tests.md", "mocking.md"]) {
    expect(existsSync(join(skillDirectory, name))).toBe(false);
    expect(existsSync(join(skillDirectory, "references", name))).toBe(true);
  }
  const refreshed = matter(readFileSync(skillPath, "utf8"));
  expect(refreshed.data.description).toBe(
    "This is an internal skill do not load it unless explicitly required by the user or another skill.",
  );
});

test("packaged workflow commands reject malformed, duplicate, inapplicable, and nested arguments", () => {
  const cli = packagedCli();
  const gitWorkspace = tempDirectory("spindle-packaged-invalid-git-");
  const { git } = makeGitWorkspace(gitWorkspace);
  const projectWorkspace = tempDirectory("spindle-packaged-invalid-project-");
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
      ["project", "init", "--unknown"],
      ["project", "init", "nested"],
      ["project", "tooling"],
      ["project", "tooling", "add"],
      ["project", "tooling", "update"],
      ["project", "tooling", "remove"],
      ["project", "tooling", "list", "unexpected"],
      ["tool", "list", "unexpected"],
      ["tool", "add"],
      ["tool", "update"],
      ["tool", "remove"],
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
    expect(readdirSync(projectWorkspace).length).toBe(0);
    expect(git("status", "--porcelain=v1")).toBe(beforeStatus);
  }
});
