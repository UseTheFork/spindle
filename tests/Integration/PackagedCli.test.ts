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

import { makeTempDirSync, repoRoot } from "@test/Helpers/TemporaryDirectories";
import matter from "gray-matter";

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
    run(
      project: string,
      args: readonly string[],
      env: Record<string, string> = {},
      entrypoint = join(packageRoot, "build", "index.js"),
    ) {
      return spawnSync(process.execPath, [entrypoint, ...args], {
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

  const reportsRelative = ".spindle/features/2026-11-02-packaged-cli/reports";
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
    "--slug",
    "tarball-feature",
    "--spec",
    "Tarball feature",
    "--design",
    "## Intent\n\nTarball design.",
  ]);
  expect(created.status, created.stderr).toBe(0);
  const feature = join(workspace, ".spindle/features", "2027-tarball-feature");
  const ticket = cli.run(workspace, [
    "sdd",
    "ticket",
    "create",
    "--feature",
    feature,
    "--title",
    "Tarball ticket",
    "--requirements",
    "Tarball ticket requirements.",
    "--acceptance-criteria",
    "The packaged ticket is created.",
  ]);
  expect(ticket.status, ticket.stderr).toBe(0);
  expect(readFileSync(join(feature, "design.md"), "utf8")).toContain("Tarball design.");
  const ticketDocument = readFileSync(join(feature, "tickets", "T-0001.md"), "utf8");
  expect(ticketDocument).toContain("# Tarball ticket");
  expect(ticketDocument).toContain("Tarball ticket requirements.");
  expect(ticketDocument).toContain("The packaged ticket is created.");
});

test("packaged schema describes project settings and supported stacks", () => {
  const cli = packagedCli();
  const schema = JSON.parse(readFileSync(join(cli.root, "build/spindle.schema.json"), "utf8"));
  expect(schema.properties.stacks.items.enum).toEqual(["php-laravel", "python", "typescript"]);
  expect(schema.properties.commit.properties.title_max_length.minimum).toBe(11);
  expect(schema.required).toContain("stacks");
});

test("packaged SDD create and next expose feature state outside the package checkout", () => {
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
    "--slug",
    "packaged-feature",
    "--spec",
    "# Packaged Feature\n\nA packaged feature specification.",
    "--design",
    "## Intent\n\nA packaged feature design.",
  ]);
  expect(created.status, created.stderr).toBe(0);
  expect(created.stderr).toBe("");
  const featureDirectory = join(gitWorkspace, ".spindle/features", "2027-packaged-feature");
  const expected = {
    name: "2027-packaged-feature",
    workspace: featureDirectory,
  };
  const createdEnvelope = JSON.parse(created.stdout);
  expect(createdEnvelope).toEqual({ ok: true, data: expected });
  const specificationPath = join(featureDirectory, "spec.md");
  const ledgerPath = join(featureDirectory, "sdd.json");
  expect(readFileSync(specificationPath, "utf8")).toBe(
    "# Packaged Feature\n\nA packaged feature specification.",
  );
  expect(readFileSync(join(featureDirectory, "design.md"), "utf8")).toContain("## Intent");
  expect(readdirSync(featureDirectory).sort()).toEqual([
    "design.md",
    "reports",
    "sdd.json",
    "spec.md",
    "tickets",
  ]);

  const ledgerBeforeNext = readFileSync(ledgerPath, "utf8");
  expect(JSON.parse(ledgerBeforeNext)).toEqual({
    version: 1,
    tickets: [],
    findings: [],
    reviewRounds: [],
  });
  const worktreeStatusBefore = git("status", "--porcelain=v1");
  const next = cli.run(gitWorkspace, ["--json", "sdd", "next", "--feature", featureDirectory]);
  expect(next.status, next.stderr).toBe(0);
  expect(next.stderr).toBe("");
  const nextEnvelope = JSON.parse(next.stdout);
  expect(nextEnvelope).toMatchObject({
    ok: true,
    data: {
      feature: "2027-packaged-feature",
      actions: [],
      tickets: [],
    },
  });
  expect(nextEnvelope.data.notices).toContain("No tickets in this feature.");
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBeforeNext);
  expect(git("status", "--porcelain=v1")).toBe(worktreeStatusBefore);

  const createdTicket = cli.run(gitWorkspace, [
    "--json",
    "sdd",
    "ticket",
    "create",
    "--feature",
    featureDirectory,
    "--title",
    "Packaged ticket",
    "--requirements",
    "Packaged ticket requirements.",
    "--acceptance-criteria",
    "The packaged ticket is ready for work.",
  ]);
  expect(createdTicket.status, createdTicket.stderr).toBe(0);
  const ticketEnvelope = JSON.parse(createdTicket.stdout);
  expect(ticketEnvelope).toMatchObject({ ok: true, data: expect.any(Object) });
  expect(ticketEnvelope.data.ticket).toBe("T-0001");
  const ticket = readFileSync(join(featureDirectory, "tickets", "T-0001.md"), "utf8");
  expect(ticket).toContain("# Packaged ticket");
  expect(ticket).toContain("Packaged ticket requirements.");
  expect(ticket).toContain("The packaged ticket is ready for work.");

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
    readFileSync(join(invocationWorkspace, ".spindle/config.json"), "utf8"),
  );
  expect(registry.tooling).toContainEqual({
    key: "test-unit",
    section: "Testing",
    command: "pnpm test -- --run",
  });
  expect(
    JSON.parse(readFileSync(join(invocationWorkspace, ".spindle/config.json"), "utf8")),
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
test("packaged CLI executes commands through a symlinked launcher", () => {
  const cli = packagedCli();
  const launcher = join(cli.root, "spindle");
  symlinkSync(join(cli.root, "build", "index.js"), launcher, "file");
  const project = tempDirectory("spindle-packaged-launcher-project-");
  makeGitWorkspace(project);

  const initialized = cli.run(project, [
    "init",
    "--stack",
    "typescript",
    "--spindle-package-manager",
    "pnpm",
    "--no-interactive",
  ]);
  expect(initialized.status, initialized.stderr).toBe(0);

  const help = cli.run(project, ["--help"], {}, launcher);
  expect(help.status, help.stderr).toBe(0);
  expect(help.stdout).toContain("Usage: spindle");
  expect(help.stdout).toMatch(/^\s*tool\b/m);
  expect(help.stderr).toBe("");

  const listed = cli.run(project, ["tool", "list"], {}, launcher);
  expect(listed.status, listed.stderr).toBe(0);
  expect(listed.stdout).toMatch(/^Tooling commands \(\d+\):/);
  expect(listed.stdout).toMatch(/^- .+ \[.+\]: .+/m);
  expect(listed.stderr).toBe("");

  const invalid = cli.run(project, ["--unknown"], {}, launcher);
  expect(invalid.status).not.toBe(0);
  expect(invalid.stdout).toBe("");
  expect(invalid.stderr).toContain("unknown option");
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
  expect(sddHelp.stdout).toMatch(/^\s+next\s/m);
  expect(sddHelp.stdout).toMatch(/^\s+delivery\s/m);
  expect(sddHelp.stdout).toMatch(/^\s+finish\s/m);
  expect(sddHelp.stderr).toBe("");

  for (const [args, expectedContent] of [
    [
      ["sdd", "create", "--help"],
      ["--slug <slug>", "--spec <text>", "--design <text>"],
    ],
    [["sdd", "next", "--help"], ["--feature <directory>"]],
    [
      ["sdd", "delivery", "create", "--help"],
      ["--feature <directory>", "--write-scope <path>"],
    ],
    [["sdd", "finish", "--help"], ["--feature <directory>"]],
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
  const result = cli.run(nested, [
    "init",
    "--stack",
    "python",
    "--spindle-package-manager",
    "pnpm",
    "--no-interactive",
  ]);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(readFileSync(join(project, ".spindle", "config.json"), "utf8")).stacks).toEqual(
    ["python"],
  );
  expect(
    existsSync(join(project, ".github", "skills", "private-test-driven-development", "SKILL.md")),
  ).toBe(true);
  expect(readdirSync(nested)).toEqual([]);
});

test("packaged CLI renders a Private Skill and updates relocated references outside the checkout", () => {
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

  const skillDirectory = join(project, ".github", "skills", "private-test-driven-development");
  const skillPath = join(skillDirectory, "SKILL.md");
  const installed = readFileSync(skillPath, "utf8");
  expect(matter(installed).data.description).toBe(
    "This is a private skill do not load it unless explicitly required by the user or another skill.",
  );
  expect(installed).not.toMatch(/{{|}}/);

  for (const [name, references] of [
    ["private-test-driven-development", ["tests.md", "mocking.md"]],
    ["public-ref-domain-modeling", ["ADR-FORMAT.md", "GLOSSARY-FORMAT.md"]],
    ["private-codebase-design", ["DEEPENING.md", "DESIGN-IT-TWICE.md"]],
  ] as const) {
    const directory = join(project, ".github", "skills", name);
    const content = readFileSync(join(directory, "SKILL.md"), "utf8");
    for (const reference of references) {
      expect(content).toContain(`(./references/${reference})`);
      expect(existsSync(join(directory, "references", reference))).toBe(true);
    }
  }

  const domainModelingSkill = matter(
    readFileSync(
      join(project, ".github", "skills", "public-ref-domain-modeling", "SKILL.md"),
      "utf8",
    ),
  );
  expect(domainModelingSkill.data.name).toBe("public-ref-domain-modeling");
  expect(domainModelingSkill.data.description).toBe(
    "Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a GLOSSARY.md, or recording or editing an ADR.",
  );

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
    "This is a private skill do not load it unless explicitly required by the user or another skill.",
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
      ["sdd", "create", "--slug"],
      ["sdd", "create", "--slug", "feature"],
      ["sdd", "create", "--slug", "one", "--slug", "two", "--spec", "Feature"],
      ["sdd", "create", "--slug", "feature", "--spec", "Feature", "--unknown"],
      ["sdd", "create", "--slug", "feature", "--spec", "Feature", "nested"],
      ["sdd", "next"],
      ["sdd", "next", "--feature"],
      ["sdd", "next", "--feature", "missing.md", "--feature", "another.md"],
      ["sdd", "next", "--feature", "missing.md", "--unknown"],
      ["sdd", "next", "--feature", "missing.md", "nested"],
      ["sdd", "delivery", "create"],
      ["sdd", "delivery", "create", "--feature"],
      ["sdd", "delivery", "create", "--feature", "missing.md", "--feature", "another.md"],
      ["sdd", "finish"],
      ["sdd", "finish", "--feature"],
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
