import assert from "node:assert/strict";
import { lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { makeTempDir, runCli } from "./helpers.ts";

const versioned = (version: string, body: string) =>
  `---\nmetadata:\n  spindle:\n    version: ${version}\n---\n${body}\n`;

const catalog = `agents:
  grouped:
    path: grouped/
    status: active
    stacks: []
instructions:
  grouped:
    path: grouped/
    status: active
    stacks: []
skills:
  current:
    path: current/
    status: active
    stacks: []
  skipped:
    path: skipped/
    status: active
    stacks: []
  accepted:
    path: accepted/
    status: active
    stacks: []
`;

async function put(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

async function absent(path: string) {
  await assert.rejects(lstat(path), { code: "ENOENT" });
}

async function makeProject() {
  const project = await makeTempDir("spindle-directory-membership-");
  await put(
    join(project, ".github", "spindle.json"),
    JSON.stringify({ stacks: ["python"], variables: {} }),
  );
  return project;
}

test("update cleans selected directory membership without changing version decisions", async () => {
  const blueprints = await makeTempDir("spindle-directory-membership-blueprints-");
  const project = await makeProject();
  const github = join(project, ".github");
  const agentDir = join(github, "agents", "grouped");
  const instructionDir = join(github, "instructions", "grouped");
  const skills = join(github, "skills");
  try {
    await put(join(blueprints, "catalog.yaml"), catalog);

    await put(join(blueprints, "agents/grouped/current.agent.md"), versioned("1.0.0", "source"));
    await put(join(blueprints, "agents/grouped/outdated.agent.md"), versioned("2.0.0", "source"));
    await put(join(blueprints, "agents/grouped/fresh.agent.md"), versioned("1.0.0", "new"));
    await put(join(blueprints, "agents/grouped/unknown.agent.md"), versioned("2.0.0", "source"));
    await put(join(blueprints, "agents/grouped/stacks/example.txt"), "source asset\n");
    await put(
      join(blueprints, "instructions/grouped/current.instructions.md"),
      versioned("1.0.0", "source"),
    );
    await put(
      join(blueprints, "instructions/grouped/outdated.instructions.md"),
      versioned("2.0.0", "source"),
    );
    await put(
      join(blueprints, "instructions/grouped/fresh.instructions.md"),
      versioned("1.0.0", "new"),
    );
    await put(
      join(blueprints, "instructions/grouped/unknown.instructions.md"),
      versioned("2.0.0", "source"),
    );

    await put(join(blueprints, "skills/current/SKILL.md"), versioned("1.0.0", "current"));
    await put(join(blueprints, "skills/current/retained.txt"), "source current asset\n");
    await put(join(blueprints, "skills/current/new-support.txt"), "new source asset\n");
    await put(join(blueprints, "skills/skipped/SKILL.md"), versioned("2.0.0", "updated"));
    await put(join(blueprints, "skills/skipped/retained.txt"), "new source asset\n");
    await put(join(blueprints, "skills/accepted/SKILL.md"), versioned("2.0.0", "updated"));
    await put(join(blueprints, "skills/accepted/new-support.txt"), "accepted new asset\n");

    await put(join(agentDir, "current.agent.md"), versioned("1.0.0", "installed current"));
    await put(join(agentDir, "outdated.agent.md"), versioned("1.0.0", "installed outdated"));
    await put(join(agentDir, "unknown.agent.md"), "installed without version metadata\n");
    await put(join(agentDir, "vanished/nested.txt"), "stale upstream file\n");
    await put(join(agentDir, "local/nested.txt"), "local addition\n");
    await put(join(agentDir, "stacks/example.txt"), "installed stack asset\n");
    await put(join(github, "agents", "neighbor.agent.md"), "outside selected directory\n");

    await put(
      join(instructionDir, "current.instructions.md"),
      versioned("1.0.0", "installed current"),
    );
    await put(
      join(instructionDir, "outdated.instructions.md"),
      versioned("1.0.0", "installed outdated"),
    );
    await put(
      join(instructionDir, "unknown.instructions.md"),
      "installed without version metadata\n",
    );
    await put(join(instructionDir, "vanished/nested.txt"), "stale upstream file\n");
    await put(join(instructionDir, "local/nested.txt"), "local addition\n");
    await put(
      join(github, "instructions", "neighbor.instructions.md"),
      "outside selected directory\n",
    );

    await put(join(skills, "current/SKILL.md"), versioned("1.0.0", "installed current"));
    await put(join(skills, "current/retained.txt"), "user-modified surviving asset\n");
    await put(join(skills, "current/vanished/nested.txt"), "stale upstream file\n");
    await put(join(skills, "current/local/nested.txt"), "local addition\n");
    await put(join(skills, "skipped/SKILL.md"), versioned("1.0.0", "installed old version"));
    await put(join(skills, "skipped/retained.txt"), "user-modified surviving asset\n");
    await put(join(skills, "skipped/vanished/nested.txt"), "stale upstream file\n");
    await put(join(skills, "skipped/local/nested.txt"), "local addition\n");
    await put(join(skills, "accepted/SKILL.md"), versioned("1.0.0", "installed old version"));
    await put(join(skills, "accepted/local.txt"), "old local content\n");
    await put(join(skills, "neighbor/SKILL.md"), "unrelated skill\n");

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "skip"],
      process.env.PATH ?? "",
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    for (const directory of [agentDir, instructionDir]) {
      await absent(join(directory, "vanished/nested.txt"));
      await absent(join(directory, "local/nested.txt"));
      await absent(join(directory, "fresh.agent.md"));
      await absent(join(directory, "fresh.instructions.md"));
    }
    assert.equal(
      await readFile(join(agentDir, "outdated.agent.md"), "utf8"),
      versioned("1.0.0", "installed outdated"),
    );
    assert.equal(
      await readFile(join(instructionDir, "outdated.instructions.md"), "utf8"),
      versioned("1.0.0", "installed outdated"),
    );
    assert.equal(
      await readFile(join(agentDir, "unknown.agent.md"), "utf8"),
      "installed without version metadata\n",
    );
    assert.equal(
      await readFile(join(instructionDir, "unknown.instructions.md"), "utf8"),
      "installed without version metadata\n",
    );
    assert.equal(
      await readFile(join(agentDir, "current.agent.md"), "utf8"),
      versioned("1.0.0", "installed current"),
    );
    assert.equal(
      await readFile(join(instructionDir, "current.instructions.md"), "utf8"),
      versioned("1.0.0", "installed current"),
    );
    assert.equal(
      await readFile(join(agentDir, "stacks/example.txt"), "utf8"),
      "installed stack asset\n",
    );
    assert.equal(
      await readFile(join(github, "agents/neighbor.agent.md"), "utf8"),
      "outside selected directory\n",
    );
    assert.equal(
      await readFile(join(github, "instructions/neighbor.instructions.md"), "utf8"),
      "outside selected directory\n",
    );

    for (const name of ["current", "skipped"]) {
      await absent(join(skills, name, "vanished/nested.txt"));
      await absent(join(skills, name, "local/nested.txt"));
      assert.equal(
        await readFile(join(skills, name, "SKILL.md"), "utf8"),
        versioned(
          name === "current" ? "1.0.0" : "1.0.0",
          name === "current" ? "installed current" : "installed old version",
        ),
      );
      assert.equal(
        await readFile(join(skills, name, "retained.txt"), "utf8"),
        "user-modified surviving asset\n",
      );
    }
    await absent(join(skills, "current/new-support.txt"));
    assert.equal(
      await readFile(join(skills, "accepted/SKILL.md"), "utf8"),
      versioned("1.0.0", "installed old version"),
    );
    await absent(join(skills, "accepted/local.txt"));
    assert.equal(await readFile(join(skills, "neighbor/SKILL.md"), "utf8"), "unrelated skill\n");
    assert.match(result.stdout, /Removed agent 'grouped\/vanished\/nested\.txt'/);
    assert.match(result.stdout, /Removed skill 'current\/local\/nested\.txt'/);
    assert.match(result.stdout, /up to date 1 skill\(s\)/);
    assert.match(result.stdout, /skipped 2, up to date 1 skill\(s\)/);
    assert.match(result.stderr, /Skipping Agent 'grouped\/unknown\.agent\.md'.*no version/);
    assert.match(
      result.stderr,
      /Skipping Instruction 'grouped\/unknown\.instructions\.md'.*no version/,
    );

    await put(join(skills, "accepted/local.txt"), "old local content\n");
    const acceptedUpdate = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );
    assert.equal(acceptedUpdate.status, 0, acceptedUpdate.stderr);
    assert.equal(
      await readFile(join(skills, "accepted/SKILL.md"), "utf8"),
      versioned("2.0.0", "updated"),
    );
    assert.equal(
      await readFile(join(skills, "accepted/new-support.txt"), "utf8"),
      "accepted new asset\n",
    );
    await assert.rejects(readFile(join(skills, "accepted/local.txt"), "utf8"), { code: "ENOENT" });
    assert.equal(
      (acceptedUpdate.stdout.match(/Removed skill 'accepted\/local\.txt'/g) ?? []).length,
      1,
    );
    assert.equal(
      await readFile(join(agentDir, "outdated.agent.md"), "utf8"),
      versioned("2.0.0", "source"),
    );
    assert.equal(
      await readFile(join(instructionDir, "outdated.instructions.md"), "utf8"),
      versioned("2.0.0", "source"),
    );
    assert.equal(
      await readFile(join(agentDir, "current.agent.md"), "utf8"),
      versioned("1.0.0", "installed current"),
    );
    assert.equal(
      await readFile(join(instructionDir, "current.instructions.md"), "utf8"),
      versioned("1.0.0", "installed current"),
    );
    await absent(join(agentDir, "fresh.agent.md"));
    await absent(join(instructionDir, "fresh.instructions.md"));
    assert.doesNotMatch(acceptedUpdate.stdout, /Removed agent 'grouped\/vanished/);

    const includeNew = runCli(
      project,
      ["update", "--no-interactive", "--include-new", "--on-conflict", "skip"],
      process.env.PATH ?? "",
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );
    assert.equal(includeNew.status, 0, includeNew.stderr);
    assert.doesNotMatch(includeNew.stdout, /Removed skill 'accepted\/local\.txt'/);
    assert.equal(
      await readFile(join(agentDir, "fresh.agent.md"), "utf8"),
      versioned("1.0.0", "new"),
    );
    assert.equal(
      await readFile(join(instructionDir, "fresh.instructions.md"), "utf8"),
      versioned("1.0.0", "new"),
    );
    assert.doesNotMatch(includeNew.stdout, /Removed agent 'grouped\/vanished/);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("a selected file does not authorize cleanup of neighboring files", async () => {
  const blueprints = await makeTempDir("spindle-file-membership-blueprints-");
  const project = await makeProject();
  const github = join(project, ".github");
  try {
    await put(
      join(blueprints, "catalog.yaml"),
      `agents:
  selected:
    path: selected.agent.md
    status: active
    stacks: []
instructions: {}
skills: {}
`,
    );
    await put(
      join(blueprints, "agents/selected.agent.md"),
      versioned("1.0.0", "shipped selected file"),
    );
    await put(
      join(github, "agents/selected.agent.md"),
      versioned("1.0.0", "installed selected file"),
    );
    await put(join(github, "agents/neighbor.agent.md"), "user-owned neighbor\n");

    const result = runCli(project, ["update", "--no-interactive"], process.env.PATH ?? "", {
      SPINDLE_BLUEPRINTS_DIR: blueprints,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(join(github, "agents/selected.agent.md"), "utf8"),
      versioned("1.0.0", "installed selected file"),
    );
    assert.equal(
      await readFile(join(github, "agents/neighbor.agent.md"), "utf8"),
      "user-owned neighbor\n",
    );
    assert.doesNotMatch(result.stdout, /Removed agent/);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init removes destination-only files within selected directories only", async () => {
  const blueprints = await makeTempDir("spindle-init-directory-membership-blueprints-");
  const project = await makeProject();
  const github = join(project, ".github");
  const target = join(github, "agents", "grouped");
  try {
    await rm(join(github, "spindle.json"));
    await put(join(blueprints, "catalog.yaml"), catalog);
    await put(join(blueprints, "agents/grouped/keep.agent.md"), versioned("1.0.0", "source"));
    await put(
      join(blueprints, "instructions/grouped/keep.instructions.md"),
      versioned("1.0.0", "source"),
    );
    await put(join(target, "keep.agent.md"), versioned("1.0.0", "installed bytes"));
    await put(join(target, "vanished/deep/local.txt"), "local data\n");
    await put(join(github, "agents/neighbor.agent.md"), "neighbor\n");
    await put(join(blueprints, "skills/current/SKILL.md"), versioned("1.0.0", "current"));
    await put(join(blueprints, "skills/skipped/SKILL.md"), versioned("1.0.0", "current"));
    await put(join(blueprints, "skills/accepted/SKILL.md"), versioned("1.0.0", "current"));

    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive", "--on-conflict", "skip"],
      process.env.PATH ?? "",
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    await absent(join(target, "vanished/deep/local.txt"));
    assert.equal(
      await readFile(join(target, "keep.agent.md"), "utf8"),
      versioned("1.0.0", "installed bytes"),
    );
    assert.equal(await readFile(join(github, "agents/neighbor.agent.md"), "utf8"), "neighbor\n");
    assert.match(result.stdout, /Removed agent 'grouped\/vanished\/deep\/local\.txt'/);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update rejects unsafe nested symlinks before membership cleanup", async () => {
  const blueprints = await makeTempDir("spindle-unsafe-directory-blueprints-");
  const project = await makeProject();
  const github = join(project, ".github");
  const target = join(github, "agents", "grouped");
  const outside = join(project, "outside.txt");
  try {
    await put(join(blueprints, "catalog.yaml"), catalog);
    await put(join(blueprints, "agents/grouped/current.agent.md"), versioned("1.0.0", "source"));
    await put(
      join(blueprints, "instructions/grouped/current.instructions.md"),
      versioned("1.0.0", "source"),
    );
    await put(join(target, "current.agent.md"), versioned("1.0.0", "installed"));
    await put(join(target, "stale.txt"), "must remain on validation failure\n");
    await put(outside, "outside content\n");
    await mkdir(target, { recursive: true });
    await symlink(outside, join(target, "unsafe-link"));
    await put(join(blueprints, "skills/current/SKILL.md"), versioned("1.0.0", "current"));
    await put(join(blueprints, "skills/skipped/SKILL.md"), versioned("1.0.0", "current"));
    await put(join(blueprints, "skills/accepted/SKILL.md"), versioned("1.0.0", "current"));

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "skip"],
      process.env.PATH ?? "",
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /symbolic link/i);
    assert.equal(await readFile(outside, "utf8"), "outside content\n");
    assert.equal(
      await readFile(join(target, "stale.txt"), "utf8"),
      "must remain on validation failure\n",
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});
