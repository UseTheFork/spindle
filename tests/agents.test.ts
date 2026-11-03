import assert from "node:assert/strict";
import { symlinkSync, writeFileSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";

import matter from "gray-matter";

import {
  makeJustStubDir,
  makeTempDir,
  pathWith,
  runCliWithFixtureCatalog as runCli,
  runCliInteractiveWithFixtureCatalog as runCliInteractive,
} from "./helpers.ts";

let justDirectory: string;

before(async () => {
  justDirectory = await makeJustStubDir();
});

after(async () => {
  await rm(justDirectory, { recursive: true, force: true });
});

test("init installs and reports a rendered Agent alongside a same-named Skill", async () => {
  const blueprints = await makeTempDir("spindle-agent-blueprints-");
  const project = await makeTempDir("spindle-agent-project-");
  try {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nname: demo\nmeta:\n  spindle:\n    version: 1.0.0\n---\nSkill\n",
    );
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      [
        "---",
        "name: demo",
        'description: "Agent for {{ variables.owner }}"',
        "meta:",
        "  spindle:",
        "    version: 1.0.0",
        "---",
        "{% if 'python' in stacks %}Python Agent{% endif %}",
        "",
      ].join("\n"),
    );

    const result = runCli(
      project,
      ["init", "--stack", "python", "--var", "owner=team"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "✔ Installed 1 skill(s), 1 agent(s) for python\n");
    assert.deepEqual(await readdir(join(project, ".github", "agents")), ["demo.agent.md"]);
    assert.equal(
      await readFile(join(project, ".github", "agents", "demo.agent.md"), "utf8"),
      '---\nname: demo\ndescription: "Agent for team"\nmeta:\n  spindle:\n    version: 1.0.0\n---\nPython Agent\n',
    );
    assert.match(
      await readFile(join(project, ".github", "skills", "demo", "SKILL.md"), "utf8"),
      /Skill/,
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update replaces only older versioned Agents and warns about unknown versions", async () => {
  const blueprints = await makeTempDir("spindle-agent-version-blueprints-");
  const project = await makeTempDir("spindle-agent-version-project-");
  const installedAgents = join(project, ".github", "agents");
  const contents = (name: string, version: string | null, body: string) =>
    `---\nname: ${name}\n${version === null ? "" : `meta:\n  spindle:\n    version: ${version}\n`}---\n${body}\n`;
  try {
    await mkdir(installedAgents, { recursive: true });
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: { owner: "team" } }),
    );
    for (const [name, shipped, installed] of [
      ["outdated", "2.0.0", "1.0.0"],
      ["equal", "1.0.0", "1.0.0"],
      ["newer-installed", "1.0.0", "9.0.0"],
      ["unversioned", "1.0.0", null],
      ["invalid", "1.0.0", "v1"],
      ["new", "1.0.0", undefined],
    ] as const) {
      await mkdir(join(blueprints, "agents", name), { recursive: true });
      await writeFile(
        join(blueprints, "agents", `${name}.agent.md`),
        contents(name, shipped, "shipped {{ variables.owner }}"),
      );
      if (installed !== undefined) {
        await writeFile(
          join(installedAgents, `${name}.agent.md`),
          contents(name, installed, "preserve local content"),
        );
      }
    }

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(join(installedAgents, "equal.agent.md"), "utf8"),
      contents("equal", "1.0.0", "preserve local content"),
    );
    assert.equal(
      await readFile(join(installedAgents, "newer-installed.agent.md"), "utf8"),
      contents("newer-installed", "9.0.0", "preserve local content"),
    );
    assert.equal(
      await readFile(join(installedAgents, "unversioned.agent.md"), "utf8"),
      contents("unversioned", null, "preserve local content"),
    );
    assert.equal(
      await readFile(join(installedAgents, "invalid.agent.md"), "utf8"),
      contents("invalid", "v1", "preserve local content"),
    );
    assert.equal(
      await readFile(join(installedAgents, "outdated.agent.md"), "utf8"),
      contents("outdated", "2.0.0", "shipped team"),
    );
    await assert.rejects(readFile(join(installedAgents, "new.agent.md")));
    assert.match(result.stderr, /Agent 'unversioned\.agent\.md'.*no version/);
    assert.match(result.stderr, /Agent 'invalid\.agent\.md'.*non-semver version 'v1'/);
    assert.equal(result.stdout, "✔ Added 0, updated 1, skipped 3, up to date 2 agent(s)\n");
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init ignores unlisted Agent sources while installing the catalog-selected file", async () => {
  const blueprints = await makeTempDir("spindle-agent-extra-blueprints-");
  const project = await makeTempDir("spindle-agent-extra-project-");
  const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  try {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped Skill\n",
    );
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n",
    );
    await writeFile(join(blueprints, "agents", "guide.md"), "unlisted source\n");
    await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(skillPath, "existing Skill\n");
    await writeFile(agentPath, "existing Agent\n");

    const result = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(skillPath, "utf8"), /shipped Skill/);
    assert.match(await readFile(agentPath, "utf8"), /shipped Agent/);
    await assert.rejects(readFile(join(project, ".github", "agents", "guide.md")));
    await readFile(join(project, ".github", "spindle.json"));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init checks Agent conflicts before installing other Blueprint kinds", async () => {
  const blueprints = await makeTempDir("spindle-agent-conflict-blueprints-");
  const project = await makeTempDir("spindle-agent-conflict-project-");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  try {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nshipped Skill\n",
    );
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nshipped Agent\n",
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(agentPath, "existing Agent\n");

    const result = runCli(
      project,
      ["init", "--stack", "python", "--no-interactive"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Agent 'demo\.agent\.md'.*--on-conflict/);
    await assert.rejects(readFile(join(project, ".github", "skills", "demo", "SKILL.md")));
    assert.equal(await readFile(agentPath, "utf8"), "existing Agent\n");
    await assert.rejects(readFile(join(project, ".github", "spindle.json")));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test(
  "interactive init identifies an Agent conflict by kind",
  { skip: process.platform !== "linux" },
  async () => {
    const blueprints = await makeTempDir("spindle-agent-prompt-blueprints-");
    const project = await makeTempDir("spindle-agent-prompt-project-");
    const agentPath = join(project, ".github", "agents", "demo.agent.md");
    try {
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        "---\nname: demo\nmeta:\n  spindle:\n    version: 1.0.0\n---\nshipped Agent\n",
      );
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(agentPath, "existing Agent\n");

      const result = await runCliInteractive(
        project,
        ["init", "--stack", "python", "--var", "owner=team", "--var", "lint_command=just lint"],
        pathWith(justDirectory),
        [{ trigger: "What should happen?", input: "\r" }],
        { SPINDLE_BLUEPRINTS_DIR: blueprints },
      );

      assert.equal(result.status, 0, result.stdout);
      assert.match(result.stdout, /Agent 'demo\.agent\.md' already exists\. What should happen\?/);
      assert.match(await readFile(agentPath, "utf8"), /shipped Agent/);
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  },
);

test(
  "interactive update identifies new and outdated Agents by kind",
  { skip: process.platform !== "linux" },
  async () => {
    const blueprints = await makeTempDir("spindle-agent-update-prompt-blueprints-");
    const project = await makeTempDir("spindle-agent-update-prompt-project-");
    try {
      for (const [name, version] of [
        ["demo", "2.0.0"],
        ["newcomer", "1.0.0"],
      ]) {
        await mkdir(join(blueprints, "agents", name), { recursive: true });
        await writeFile(
          join(blueprints, "agents", `${name}.agent.md`),
          `---\nname: ${name}\nmeta:\n  spindle:\n    version: ${version}\n---\nshipped ${name}\n`,
        );
      }
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(
        join(project, ".github", "spindle.json"),
        JSON.stringify({ stacks: ["python"], variables: { owner: "team" } }),
      );
      await writeFile(
        join(project, ".github", "agents", "demo.agent.md"),
        "---\nname: demo\nmeta:\n  spindle:\n    version: 1.0.0\n---\nold demo\n",
      );

      const result = await runCliInteractive(
        project,
        ["update"],
        pathWith(justDirectory),
        [
          { trigger: "Enter: confirm", input: "\r" },
          { trigger: "What should happen?", input: "\r" },
        ],
        { SPINDLE_BLUEPRINTS_DIR: blueprints },
      );

      assert.equal(result.status, 0, result.stdout);
      assert.match(result.stdout, /Which new Agents should be installed\?/);
      assert.match(
        result.stdout,
        /Agent 'demo\.agent\.md' is outdated \(installed 1\.0\.0, available 2\.0\.0\)/,
      );
      assert.match(result.stdout, /Added 1, updated 1, skipped 0, up to date 0 agent\(s\)/);
      assert.match(
        await readFile(join(project, ".github", "agents", "demo.agent.md"), "utf8"),
        /shipped demo/,
      );
      assert.match(
        await readFile(join(project, ".github", "agents", "newcomer.agent.md"), "utf8"),
        /shipped newcomer/,
      );
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  },
);

test("init preserves an existing Agent when rendered version metadata is invalid", async () => {
  const blueprints = await makeTempDir("spindle-agent-metadata-blueprints-");
  const project = await makeTempDir("spindle-agent-metadata-project-");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  try {
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nname: demo\nmeta:\n  spindle:\n    version: {{ variables.owner }}\n---\nshipped Agent\n",
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(agentPath, "existing Agent\n");

    const result = runCli(
      project,
      ["init", "--stack", "python", "--var", "owner=not-semver", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid Agent metadata.*semver.*version/);
    assert.equal(await readFile(agentPath, "utf8"), "existing Agent\n");
    await assert.rejects(readFile(join(project, ".github", "spindle.json")));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init rejects a non-text Agent entry without replacing its destination", async () => {
  const blueprints = await makeTempDir("spindle-agent-binary-blueprints-");
  const project = await makeTempDir("spindle-agent-binary-project-");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  try {
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      Buffer.from("---\nmeta:\n  spindle:\n    version: 1.0.0\n---\ninvalid\0content\n"),
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(agentPath, "existing Agent\n");

    const result = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /demo\.agent\.md.*valid UTF-8 text/);
    assert.equal(await readFile(agentPath, "utf8"), "existing Agent\n");
    await assert.rejects(readFile(join(project, ".github", "spindle.json")));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init and update help describe Blueprint kinds and generic policies", async () => {
  const project = await makeTempDir("spindle-agent-help-project-");
  try {
    const init = runCli(project, ["init", "--help"], pathWith(justDirectory));
    const update = runCli(project, ["update", "--help"], pathWith(justDirectory));

    assert.equal(init.status, 0, init.stderr);
    assert.match(init.stdout, /Blueprints.*Skills, Agents, and Instructions/i);
    assert.match(init.stdout, /--on-conflict[\s\S]*Blueprint/i);
    assert.equal(update.status, 0, update.stderr);
    assert.match(update.stdout, /Blueprints.*Skills, Agents, and Instructions/i);
    assert.match(update.stdout, /--on-conflict[\s\S]*Blueprint/i);
    assert.match(update.stdout, /--include-new\s+Install.*Blueprint/i);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("production init installs the versioned shared-r Agent matching the local copy", async () => {
  const project = await makeTempDir("spindle-agent-production-project-");
  try {
    const result = runCli(project, ["init", "--stack", "python"], pathWith(justDirectory));

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /[1-9]\d* agent\(s\)/);
    const installed = await readFile(
      join(project, ".github", "agents", "shared-r.agent.md"),
      "utf8",
    );
    const local = await readFile(
      join(process.cwd(), ".github", "agents", "shared-r.agent.md"),
      "utf8",
    );
    const parsed = matter(installed);
    assert.equal(parsed.data.name, "shared-r");
    assert.equal(
      parsed.data.description,
      "A general subagent that assists with various tasks as directed by the main agent, with read-only capabilities.",
    );
    assert.equal(parsed.data.meta.spindle.version, "1.0.0");
    assert.equal(parsed.data["user-invocable"], false);
    assert.deepEqual(parsed.data.tools, [
      "read",
      "search",
      "todo",
      "read_skill",
      "list_skills",
      "skill",
    ]);
    assert.deepEqual(parsed.data.agents, []);
    assert.match(parsed.content, /You are a general subagent/);
    assert.equal(installed, local);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test(
  "update rejects a symlinked destination for a Stack-inapplicable catalog Agent",
  { skip: process.platform === "win32" },
  async () => {
    const blueprints = await makeTempDir("spindle-agent-omitted-blueprints-");
    const project = await makeTempDir("spindle-agent-omitted-project-");
    const outside = join(project, "outside.md");
    const target = join(project, ".github", "agents", "optional.agent.md");
    try {
      await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "skills", "demo", "SKILL.md"),
        "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nSkill\n",
      );
      await mkdir(join(blueprints, "agents"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "optional.agent.md"),
        "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nPython only\n",
      );
      await writeFile(
        join(blueprints, "catalog.yaml"),
        [
          "agents:",
          "  optional:",
          "    path: optional.agent.md",
          "    status: active",
          "    stacks: [python]",
          "just: {}",
          "instructions: {}",
          "skills:",
          "  demo:",
          "    path: demo/",
          "    status: active",
          "    stacks: []",
          "",
        ].join("\n"),
      );
      await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(
        join(project, ".github", "spindle.json"),
        JSON.stringify({ stacks: ["typescript"], variables: {} }),
      );
      await writeFile(
        join(project, ".github", "skills", "demo", "SKILL.md"),
        "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n",
      );
      await writeFile(outside, "outside remains untouched\n");
      await symlink(outside, join(project, ".github", "agents", "optional.agent.md"));

      const result = runCli(project, ["update", "--no-interactive"], pathWith(justDirectory), {
        SPINDLE_BLUEPRINTS_DIR: blueprints,
      });

      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stderr, /symbolic link/i);
      assert.equal(await readFile(outside, "utf8"), "outside remains untouched\n");
      assert.equal((await lstat(target)).isSymbolicLink(), true);
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  },
);

test(
  "update refuses an Agent destination changed to a symlink while prompting",
  { skip: process.platform !== "linux" },
  async () => {
    const blueprints = await makeTempDir("spindle-agent-race-blueprints-");
    const project = await makeTempDir("spindle-agent-race-project-");
    const outside = join(project, "outside.md");
    const newTarget = join(project, ".github", "agents", "newcomer.agent.md");
    try {
      for (const [name, version] of [
        ["newcomer", "1.0.0"],
        ["old", "2.0.0"],
      ]) {
        await mkdir(join(blueprints, "agents", name), { recursive: true });
        await writeFile(
          join(blueprints, "agents", `${name}.agent.md`),
          `---\nname: ${name}\nmeta:\n  spindle:\n    version: ${version}\n---\nshipped ${name}\n`,
        );
      }
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(
        join(project, ".github", "spindle.json"),
        JSON.stringify({ stacks: ["python"], variables: {} }),
      );
      await writeFile(
        join(project, ".github", "agents", "old.agent.md"),
        "---\nname: old\nmeta:\n  spindle:\n    version: 1.0.0\n---\nold Agent\n",
      );
      await writeFile(outside, "outside remains untouched\n");

      const result = await runCliInteractive(
        project,
        ["update"],
        pathWith(justDirectory),
        [
          {
            trigger: "Enter: confirm",
            input: "\r",
            beforeInput: () => symlinkSync(outside, newTarget),
          },
          { trigger: "is outdated", input: "\r" },
        ],
        { SPINDLE_BLUEPRINTS_DIR: blueprints },
      );

      assert.notEqual(result.status, 0, result.stdout);
      assert.match(
        result.stdout + result.stderr,
        /newcomer\.agent\.md.*symbolic link|symbolic link.*newcomer\.agent\.md/i,
      );
      assert.equal(await readFile(outside, "utf8"), "outside remains untouched\n");
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  },
);

test(
  "update preserves an Agent file created while its new-install prompt is open",
  { skip: process.platform !== "linux" },
  async () => {
    const blueprints = await makeTempDir("spindle-agent-new-conflict-blueprints-");
    const project = await makeTempDir("spindle-agent-new-conflict-project-");
    const newTarget = join(project, ".github", "agents", "newcomer.agent.md");
    try {
      await mkdir(join(blueprints, "agents", "newcomer"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "newcomer.agent.md"),
        "---\nname: newcomer\nmeta:\n  spindle:\n    version: 1.0.0\n---\nshipped Agent\n",
      );
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(
        join(project, ".github", "spindle.json"),
        JSON.stringify({ stacks: ["python"], variables: {} }),
      );

      const result = await runCliInteractive(
        project,
        ["update"],
        pathWith(justDirectory),
        [
          {
            trigger: "Enter: confirm",
            input: "\r",
            beforeInput: () => writeFileSync(newTarget, "created during prompt\n"),
          },
        ],
        { SPINDLE_BLUEPRINTS_DIR: blueprints },
      );

      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stdout + result.stderr, /Agent 'newcomer\.agent\.md'.*already exists/);
      assert.equal(await readFile(newTarget, "utf8"), "created during prompt\n");
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  },
);

test("init and update omit Stack-inapplicable catalog Agents", async () => {
  const blueprints = await makeTempDir("spindle-agent-catalog-filter-blueprints-");
  const project = await makeTempDir("spindle-agent-catalog-filter-project-");
  try {
    await mkdir(join(blueprints, "agents"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "python-only.agent.md"),
      "---\nname: python-only\nmeta:\n  spindle:\n    version: 1.0.0\n---\nPython Agent\n",
    );
    await writeFile(
      join(blueprints, "catalog.yaml"),
      [
        "agents:",
        "  python-only:",
        "    path: python-only.agent.md",
        "    status: active",
        "    stacks: [python]",
        "just: {}",
        "instructions: {}",
        "skills:",
        "  baseline:",
        "    path: baseline/",
        "    status: active",
        "    stacks: []",
        "",
      ].join("\n"),
    );
    await mkdir(join(blueprints, "skills", "baseline"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "baseline", "SKILL.md"),
      "---\nname: baseline\nmeta:\n  spindle:\n    version: 1.0.0\n---\nBaseline\n",
    );
    const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };
    const init = runCli(project, ["init", "--stack", "typescript"], pathWith(justDirectory), env);

    assert.equal(init.status, 0, init.stderr);
    assert.equal(init.stdout, "✔ Installed 1 skill(s) for typescript\n");
    await assert.rejects(readdir(join(project, ".github", "agents")), { code: "ENOENT" });

    const update = runCli(
      project,
      ["update", "--no-interactive", "--include-new"],
      pathWith(justDirectory),
      env,
    );
    assert.equal(update.status, 0, update.stderr);
    assert.match(update.stdout, /up to date 1 skill\(s\)/);
    await assert.rejects(readdir(join(project, ".github", "agents")), { code: "ENOENT" });
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update warns and preserves an Agent with unreadable version frontmatter", async () => {
  const blueprints = await makeTempDir("spindle-agent-bad-frontmatter-blueprints-");
  const project = await makeTempDir("spindle-agent-bad-frontmatter-project-");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  const installed =
    "---\nname: demo\nmeta:\n  spindle:\n    version: [unterminated\n---\nlocal Agent\n";
  try {
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nname: demo\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n",
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );
    await writeFile(agentPath, installed);

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Agent 'demo\.agent\.md'.*no version/);
    assert.match(result.stdout, /skipped 1.*agent\(s\)/);
    assert.equal(await readFile(agentPath, "utf8"), installed);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update renders a block-templated Agent version before comparing it", async () => {
  const blueprints = await makeTempDir("spindle-agent-version-template-blueprints-");
  const project = await makeTempDir("spindle-agent-version-template-project-");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  try {
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      [
        "---",
        "name: demo",
        "meta:",
        "  spindle:",
        "    version: {% if 'python' in stacks %}2.1.0{% else %}1.0.0{% endif %}",
        "---",
        "shipped for {{ variables.owner }}",
        "",
      ].join("\n"),
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: { owner: "team" } }),
    );
    await writeFile(
      agentPath,
      "---\nname: demo\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Agent\n",
    );

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(agentPath, "utf8"),
      "---\nname: demo\nmeta:\n  spindle:\n    version: 2.1.0\n---\nshipped for team\n",
    );
    assert.match(result.stdout, /updated 1.*agent\(s\)/);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update compares large numeric SemVer identifiers without losing precision", async () => {
  const blueprints = await makeTempDir("spindle-agent-large-version-blueprints-");
  const project = await makeTempDir("spindle-agent-large-version-project-");
  try {
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );
    for (const [name, installed, shipped] of [
      ["core", "9007199254740992.0.0", "9007199254740993.0.0"],
      ["prerelease", "1.0.0-9007199254740992", "1.0.0-9007199254740993"],
    ]) {
      await mkdir(join(blueprints, "agents", name), { recursive: true });
      await writeFile(
        join(blueprints, "agents", `${name}.agent.md`),
        `---\nname: ${name}\nmeta:\n  spindle:\n    version: ${shipped}\n---\nshipped\n`,
      );
      await writeFile(
        join(project, ".github", "agents", `${name}.agent.md`),
        `---\nname: ${name}\nmeta:\n  spindle:\n    version: ${installed}\n---\nlocal\n`,
      );
    }

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /updated 2.*agent\(s\)/);
    assert.match(
      await readFile(join(project, ".github", "agents", "core.agent.md"), "utf8"),
      /version: 9007199254740993\.0\.0/,
    );
    assert.match(
      await readFile(join(project, ".github", "agents", "prerelease.agent.md"), "utf8"),
      /version: 1\.0\.0-9007199254740993/,
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("catalog-selected Agent file installs and updates as a single rendered file", async () => {
  const blueprints = await makeTempDir("spindle-agent-catalog-blueprints-");
  const project = await makeTempDir("spindle-agent-catalog-project-");
  const source = join(blueprints, "agents", "python-only.agent.md");
  const target = join(project, ".github", "agents", "python-only.agent.md");
  const agent = (version: string) =>
    `---\nname: python-only\nmeta:\n  spindle:\n    version: ${version}\n---\nOwner {{ variables.owner }} for {{ stacks | join(',') }}\n`;
  try {
    await mkdir(join(source, ".."), { recursive: true });
    await writeFile(source, agent("1.0.0"));
    const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };
    const init = runCli(
      project,
      ["init", "--stack", "python", "--var", "owner=team"],
      pathWith(justDirectory),
      env,
    );
    assert.equal(init.status, 0, init.stderr);
    assert.deepEqual(await readdir(join(project, ".github", "agents")), ["python-only.agent.md"]);
    assert.equal(
      await readFile(target, "utf8"),
      "---\nname: python-only\nmeta:\n  spindle:\n    version: 1.0.0\n---\nOwner team for python\n",
    );

    await writeFile(source, agent("2.0.0"));
    const update = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      env,
    );
    assert.equal(update.status, 0, update.stderr);
    assert.match(update.stdout, /updated 1.*agent\(s\)/);
    assert.equal(
      await readFile(target, "utf8"),
      "---\nname: python-only\nmeta:\n  spindle:\n    version: 2.0.0\n---\nOwner team for python\n",
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init and update fail clearly when all registered kinds are empty or missing", async () => {
  const blueprints = await makeTempDir("spindle-empty-kinds-blueprints-");
  const project = await makeTempDir("spindle-empty-kinds-project-");
  try {
    await mkdir(join(blueprints, "skills"), { recursive: true });
    const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };
    const init = runCli(project, ["init", "--stack", "python"], pathWith(justDirectory), env);
    assert.notEqual(init.status, 0);
    assert.match(init.stderr, /No Blueprints are available/i);
    await assert.rejects(readFile(join(project, ".github", "spindle.json")));

    await mkdir(join(project, ".github"), { recursive: true });
    const config = JSON.stringify({ stacks: ["python"], variables: {} });
    await writeFile(join(project, ".github", "spindle.json"), config);
    const update = runCli(project, ["update", "--no-interactive"], pathWith(justDirectory), env);
    assert.notEqual(update.status, 0);
    assert.match(update.stderr, /No Blueprints are available/i);
    assert.equal(await readFile(join(project, ".github", "spindle.json"), "utf8"), config);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test(
  "init and update reject existing or dangling symlinks at the Agent file destination",
  { skip: process.platform === "win32" },
  async () => {
    for (const command of ["init", "update"] as const) {
      for (const dangling of [false, true]) {
        const blueprints = await makeTempDir("spindle-agent-link-blueprints-");
        const project = await makeTempDir("spindle-agent-link-project-");
        const outside = join(project, "outside.md");
        const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
        try {
          await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
          await writeFile(
            join(blueprints, "skills", "demo", "SKILL.md"),
            "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped Skill\n",
          );
          await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
          await writeFile(
            join(blueprints, "agents", "demo.agent.md"),
            "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n",
          );
          await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
          await mkdir(join(project, ".github", "agents"), { recursive: true });
          await writeFile(
            skillPath,
            "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n",
          );
          if (!dangling) await writeFile(outside, "outside remains untouched\n");
          await symlink(outside, join(project, ".github", "agents", "demo.agent.md"));
          if (command === "update") {
            await writeFile(
              join(project, ".github", "spindle.json"),
              JSON.stringify({ stacks: ["python"], variables: {} }),
            );
          }
          const args =
            command === "init"
              ? ["init", "--stack", "python", "--on-conflict", "overwrite"]
              : ["update", "--no-interactive", "--on-conflict", "overwrite"];
          const result = runCli(project, args, pathWith(justDirectory), {
            SPINDLE_BLUEPRINTS_DIR: blueprints,
          });

          assert.notEqual(result.status, 0, `${command}, dangling=${dangling}`);
          assert.match(result.stderr, /symbolic link.*demo\.agent\.md/i);
          assert.equal(
            await readFile(skillPath, "utf8"),
            "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n",
          );
          if (dangling) await assert.rejects(readFile(outside));
          else assert.equal(await readFile(outside, "utf8"), "outside remains untouched\n");
        } finally {
          await rm(blueprints, { recursive: true, force: true });
          await rm(project, { recursive: true, force: true });
        }
      }
    }
  },
);

test("init applies skip and overwrite policies to the Agent file only", async () => {
  const blueprints = await makeTempDir("spindle-agent-policy-blueprints-");
  const project = await makeTempDir("spindle-agent-policy-project-");
  const target = join(project, ".github", "agents", "demo.agent.md");
  const other = join(project, ".github", "agents", "unmanaged.agent.md");
  try {
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nname: demo\nmeta:\n  spindle:\n    version: 1.0.0\n---\nshipped Agent\n",
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(target, "local Agent\n");
    await writeFile(other, "unmanaged Agent\n");
    const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };

    const skip = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "skip"],
      pathWith(justDirectory),
      env,
    );
    assert.equal(skip.status, 0, skip.stderr);
    assert.match(skip.stdout, /Installed 0 agent\(s\).*Skipped 1 existing agent\(s\)/);
    assert.equal(await readFile(target, "utf8"), "local Agent\n");
    await rm(join(project, ".github", "spindle.json"));

    const overwrite = runCli(
      project,
      ["init", "--stack", "python", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      env,
    );
    assert.equal(overwrite.status, 0, overwrite.stderr);
    assert.match(await readFile(target, "utf8"), /shipped Agent/);
    assert.equal(await readFile(other, "utf8"), "unmanaged Agent\n");
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("non-interactive update skips or includes same-named new Blueprints by kind", async () => {
  const blueprints = await makeTempDir("spindle-agent-new-kinds-blueprints-");
  const project = await makeTempDir("spindle-agent-new-kinds-project-");
  try {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nSkill\n",
    );
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nAgent\n",
    );
    await mkdir(join(project, ".github"), { recursive: true });
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );
    const env = { SPINDLE_BLUEPRINTS_DIR: blueprints };
    const skip = runCli(project, ["update", "--no-interactive"], pathWith(justDirectory), env);
    assert.equal(skip.status, 0, skip.stderr);
    assert.match(skip.stdout, /skipped 1, up to date 0 skill\(s\)/);
    assert.match(skip.stdout, /skipped 1, up to date 0 agent\(s\)/);
    await assert.rejects(readFile(join(project, ".github", "skills", "demo", "SKILL.md")));
    await assert.rejects(readFile(join(project, ".github", "agents", "demo.agent.md")));

    const include = runCli(
      project,
      ["update", "--no-interactive", "--include-new"],
      pathWith(justDirectory),
      env,
    );
    assert.equal(include.status, 0, include.stderr);
    assert.match(include.stdout, /Added 1, updated 0, skipped 0, up to date 0 skill\(s\)/);
    assert.match(include.stdout, /Added 1, updated 0, skipped 0, up to date 0 agent\(s\)/);
    assert.match(
      await readFile(join(project, ".github", "skills", "demo", "SKILL.md"), "utf8"),
      /Skill/,
    );
    assert.match(
      await readFile(join(project, ".github", "agents", "demo.agent.md"), "utf8"),
      /Agent/,
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update rejects missing or invalid shipped Agent versions before replacing any kind", async () => {
  for (const version of [null, "v2"]) {
    const blueprints = await makeTempDir("spindle-agent-invalid-source-blueprints-");
    const project = await makeTempDir("spindle-agent-invalid-source-project-");
    const agentPath = join(project, ".github", "agents", "demo.agent.md");
    const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
    const old = "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal\n";
    try {
      await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "skills", "demo", "SKILL.md"),
        "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped Skill\n",
      );
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        `---\nname: demo\n${version === null ? "" : `meta:\n  spindle:\n    version: ${version}\n`}---\nshipped Agent\n`,
      );
      await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(
        join(project, ".github", "spindle.json"),
        JSON.stringify({ stacks: ["python"], variables: {} }),
      );
      await writeFile(skillPath, old);
      await writeFile(agentPath, old);

      const result = runCli(
        project,
        ["update", "--no-interactive", "--on-conflict", "overwrite"],
        pathWith(justDirectory),
        { SPINDLE_BLUEPRINTS_DIR: blueprints },
      );

      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        /shipped agent Blueprint 'demo\.agent\.md'.*no valid semver version/i,
      );
      assert.equal(await readFile(skillPath, "utf8"), old);
      assert.equal(await readFile(agentPath, "utf8"), old);
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  }
});

test(
  "interactive selection distinguishes same-named new Skills and Agents",
  { skip: process.platform !== "linux" },
  async () => {
    const blueprints = await makeTempDir("spindle-agent-same-name-blueprints-");
    const project = await makeTempDir("spindle-agent-same-name-project-");
    try {
      await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "skills", "demo", "SKILL.md"),
        "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nSkill\n",
      );
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nAgent\n",
      );
      await mkdir(join(project, ".github"), { recursive: true });
      await writeFile(
        join(project, ".github", "spindle.json"),
        JSON.stringify({ stacks: ["python"], variables: {} }),
      );

      const result = await runCliInteractive(
        project,
        ["update"],
        pathWith(justDirectory),
        [
          { trigger: "Which new Skills should be installed?", input: "\r" },
          { trigger: "Which new Agents should be installed?", input: " \r" },
        ],
        { SPINDLE_BLUEPRINTS_DIR: blueprints },
      );

      assert.equal(result.status, 0, result.stdout);
      assert.match(result.stdout, /Which new Skills should be installed\?/);
      assert.match(result.stdout, /Which new Agents should be installed\?/);
      assert.match(result.stdout, /Added 1, updated 0, skipped 0, up to date 0 skill\(s\)/);
      assert.match(result.stdout, /Added 0, updated 0, skipped 1, up to date 0 agent\(s\)/);
      assert.match(
        await readFile(join(project, ".github", "skills", "demo", "SKILL.md"), "utf8"),
        /Skill/,
      );
      await assert.rejects(readFile(join(project, ".github", "agents", "demo.agent.md")));
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  },
);

test("update skip policy preserves an outdated Agent", async () => {
  const blueprints = await makeTempDir("spindle-agent-update-skip-blueprints-");
  const project = await makeTempDir("spindle-agent-update-skip-project-");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  const local = "---\nname: demo\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Agent\n";
  try {
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nname: demo\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n",
    );
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(
      join(project, ".github", "spindle.json"),
      JSON.stringify({ stacks: ["python"], variables: {} }),
    );
    await writeFile(agentPath, local);

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "skip"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /updated 0, skipped 1, up to date 0 agent\(s\)/);
    assert.equal(await readFile(agentPath, "utf8"), local);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

for (const command of ["init", "update"] as const) {
  test(`${command} preserves an Agent after an injected partial replacement write`, async () => {
    const blueprints = await makeTempDir("spindle-agent-write-failure-blueprints-");
    const project = await makeTempDir("spindle-agent-write-failure-project-");
    const agents = join(project, ".github", "agents");
    const agentPath = join(agents, "demo.agent.md");
    const configPath = join(project, ".github", "spindle.json");
    const installed = "---\nname: demo\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Agent\n";
    const config = JSON.stringify({ stacks: ["python"], variables: {} });
    try {
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        "---\nname: demo\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n",
      );
      await mkdir(agents, { recursive: true });
      await writeFile(agentPath, installed);
      if (command === "update") await writeFile(configPath, config);

      const args =
        command === "init"
          ? ["init", "--stack", "python", "--on-conflict", "overwrite"]
          : ["update", "--no-interactive", "--on-conflict", "overwrite"];
      const result = runCli(project, args, pathWith(justDirectory), {
        SPINDLE_BLUEPRINTS_DIR: blueprints,
        SPINDLE_TEST_FAIL_WRITE_DIR: agents,
        NODE_OPTIONS: `--import=${join(process.cwd(), "tests", "fail-agent-write.mjs")}`,
      });

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Injected ENOSPC while writing Agent/);
      assert.equal(await readFile(agentPath, "utf8"), installed);
      assert.deepEqual(await readdir(agents), ["demo.agent.md"]);
      if (command === "update") {
        assert.equal(await readFile(configPath, "utf8"), config);
      } else {
        await assert.rejects(readFile(configPath));
      }
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  });
}

for (const command of ["init", "update"] as const) {
  test(`${command} exclusively creates a new Agent after planning`, async () => {
    const blueprints = await makeTempDir("spindle-agent-create-race-blueprints-");
    const project = await makeTempDir("spindle-agent-create-race-project-");
    const agentPath = join(project, ".github", "agents", "demo.agent.md");
    const configPath = join(project, ".github", "spindle.json");
    const config = JSON.stringify({ stacks: ["python"], variables: {} });
    try {
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        "---\nname: demo\nmeta:\n  spindle:\n    version: 1.0.0\n---\nshipped Agent\n",
      );
      await mkdir(dirname(agentPath), { recursive: true });
      if (command === "update") await writeFile(configPath, config);

      const args =
        command === "init"
          ? ["init", "--stack", "python"]
          : ["update", "--no-interactive", "--include-new"];
      const result = runCli(project, args, pathWith(justDirectory), {
        SPINDLE_BLUEPRINTS_DIR: blueprints,
        SPINDLE_TEST_RACE_AGENT_PATH: agentPath,
        NODE_OPTIONS: `--import=${join(process.cwd(), "tests", "race-agent-create.mjs")}`,
      });

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /EEXIST|file already exists/i);
      assert.equal(await readFile(agentPath, "utf8"), "created during write\n");
      if (command === "update") {
        assert.equal(await readFile(configPath, "utf8"), config);
      } else {
        await assert.rejects(readFile(configPath));
      }
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  });
}

for (const destinationType of ["directory", "socket"] as const) {
  test(
    `init rejects a ${destinationType} at an Agent destination without removing it`,
    { skip: destinationType === "socket" && process.platform === "win32" },
    async () => {
      const blueprints = await makeTempDir("spindle-agent-type-blueprints-");
      const project = await makeTempDir("spindle-type-");
      const agents = join(project, ".github", "agents");
      const target = join(agents, "demo.agent.md");
      let server: ReturnType<typeof createServer> | undefined;
      try {
        await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
        await writeFile(
          join(blueprints, "agents", "demo.agent.md"),
          "---\nname: demo\nmeta:\n  spindle:\n    version: 1.0.0\n---\nshipped Agent\n",
        );
        await mkdir(agents, { recursive: true });
        if (destinationType === "directory") {
          await mkdir(target);
          await writeFile(join(target, "notes.txt"), "unmanaged notes\n");
        } else {
          server = createServer();
          await new Promise<void>((resolve, reject) => {
            server!.once("error", reject);
            server!.listen(target, resolve);
          });
        }

        const result = runCli(
          project,
          ["init", "--stack", "python", "--on-conflict", "overwrite"],
          pathWith(justDirectory),
          { SPINDLE_BLUEPRINTS_DIR: blueprints },
        );

        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /regular file/i);
        if (destinationType === "directory") {
          assert.equal(await readFile(join(target, "notes.txt"), "utf8"), "unmanaged notes\n");
        } else {
          assert.equal((await lstat(target)).isSocket(), true);
        }
        await assert.rejects(readFile(join(project, ".github", "spindle.json")));
      } finally {
        if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
        await rm(blueprints, { recursive: true, force: true });
        await rm(project, { recursive: true, force: true });
      }
    },
  );
}

for (const command of ["init", "update"] as const) {
  test(`${command} rejects an Agent directory before replacing a Skill`, async () => {
    const blueprints = await makeTempDir("spindle-agent-directory-preflight-blueprints-");
    const project = await makeTempDir("spindle-agent-directory-preflight-project-");
    const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
    const notesPath = join(project, ".github", "agents", "demo.agent.md", "notes.txt");
    const configPath = join(project, ".github", "spindle.json");
    const oldSkill = "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n";
    const config = JSON.stringify({ stacks: ["python"], variables: {} });
    try {
      await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "skills", "demo", "SKILL.md"),
        "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped Skill\n",
      );
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped Agent\n",
      );
      await mkdir(dirname(skillPath), { recursive: true });
      await mkdir(dirname(notesPath), { recursive: true });
      await writeFile(skillPath, oldSkill);
      await writeFile(notesPath, "unmanaged notes\n");
      if (command === "update") await writeFile(configPath, config);

      const args =
        command === "init"
          ? ["init", "--stack", "python", "--on-conflict", "overwrite"]
          : ["update", "--no-interactive", "--on-conflict", "overwrite"];
      const result = runCli(project, args, pathWith(justDirectory), {
        SPINDLE_BLUEPRINTS_DIR: blueprints,
      });

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /regular file/i);
      assert.equal(await readFile(skillPath, "utf8"), oldSkill);
      assert.equal(await readFile(notesPath, "utf8"), "unmanaged notes\n");
      if (command === "update") {
        assert.equal(await readFile(configPath, "utf8"), config);
      } else {
        await assert.rejects(readFile(configPath));
      }
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  });
}

for (const invalidKind of ["Skill", "Agent"] as const) {
  test(`init preflights invalid ${invalidKind} metadata across Blueprint kinds`, async () => {
    const blueprints = await makeTempDir("spindle-metadata-preflight-blueprints-");
    const project = await makeTempDir("spindle-metadata-preflight-project-");
    const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
    const stalePath = join(project, ".github", "skills", "demo", "notes.txt");
    const agentPath = join(project, ".github", "agents", "demo.agent.md");
    const oldSkill = "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n";
    const oldAgent = "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Agent\n";
    try {
      await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
      await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
      await writeFile(
        join(blueprints, "skills", "demo", "SKILL.md"),
        `---\nmeta:\n  spindle:\n    version: ${invalidKind === "Skill" ? "{{ variables.owner }}" : "2.0.0"}\n---\nshipped Skill\n`,
      );
      await writeFile(
        join(blueprints, "agents", "demo.agent.md"),
        `---\nmeta:\n  spindle:\n    version: ${invalidKind === "Agent" ? "{{ variables.owner }}" : "2.0.0"}\n---\nshipped Agent\n`,
      );
      await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
      await mkdir(join(project, ".github", "agents"), { recursive: true });
      await writeFile(skillPath, oldSkill);
      await writeFile(stalePath, "local supporting file\n");
      await writeFile(agentPath, oldAgent);

      const result = runCli(
        project,
        ["init", "--stack", "python", "--var", "owner=not-semver", "--on-conflict", "overwrite"],
        pathWith(justDirectory),
        { SPINDLE_BLUEPRINTS_DIR: blueprints },
      );

      assert.notEqual(result.status, 0);
      const entryFile = invalidKind === "Skill" ? "SKILL.md" : "demo.agent.md";
      assert.ok(
        result.stderr.includes(
          `Invalid ${invalidKind} metadata in '${entryFile}': expected a semver \`meta.spindle.version\` in frontmatter.`,
        ),
        result.stderr,
      );
      assert.equal(await readFile(skillPath, "utf8"), oldSkill);
      assert.equal(await readFile(stalePath, "utf8"), "local supporting file\n");
      assert.equal(await readFile(agentPath, "utf8"), oldAgent);
      await assert.rejects(readFile(join(project, ".github", "spindle.json")));
    } finally {
      await rm(blueprints, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  });
}

test("init preflights a new invalid Agent before replacing an existing Skill", async () => {
  const blueprints = await makeTempDir("spindle-new-agent-preflight-blueprints-");
  const project = await makeTempDir("spindle-new-agent-preflight-project-");
  const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  const oldSkill = "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n";
  try {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped Skill\n",
    );
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nmeta:\n  spindle:\n    version: {{ variables.owner }}\n---\nnew Agent\n",
    );
    await mkdir(dirname(skillPath), { recursive: true });
    await writeFile(skillPath, oldSkill);

    const result = runCli(
      project,
      ["init", "--stack", "python", "--var", "owner=not-semver", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid Agent metadata.*semver/);
    assert.equal(await readFile(skillPath, "utf8"), oldSkill);
    await assert.rejects(readFile(agentPath));
    await assert.rejects(readFile(join(project, ".github", "spindle.json")));
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init renders Skill supporting Markdown without validating it as an entry file", async () => {
  const blueprints = await makeTempDir("spindle-skill-support-blueprints-");
  const project = await makeTempDir("spindle-skill-support-project-");
  try {
    const skill = join(blueprints, "skills", "demo");
    await mkdir(skill, { recursive: true });
    await writeFile(
      join(skill, "SKILL.md"),
      "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nSkill\n",
    );
    await writeFile(
      join(skill, "guide.md"),
      "---\nmeta:\n  spindle:\n    version: [not-valid-yaml\n---\nOwner {{ variables.owner }}\n",
    );

    const result = runCli(
      project,
      ["init", "--stack", "python", "--var", "owner=team"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(join(project, ".github", "skills", "demo", "guide.md"), "utf8"),
      "---\nmeta:\n  spindle:\n    version: [not-valid-yaml\n---\nOwner team\n",
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update preflights Agent rendering before replacing a Skill", async () => {
  const blueprints = await makeTempDir("spindle-render-preflight-blueprints-");
  const project = await makeTempDir("spindle-render-preflight-project-");
  const skillPath = join(project, ".github", "skills", "demo", "SKILL.md");
  const agentPath = join(project, ".github", "agents", "demo.agent.md");
  const configPath = join(project, ".github", "spindle.json");
  const oldSkill = "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n";
  const oldAgent = "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Agent\n";
  const config = JSON.stringify({ stacks: ["python"], variables: {} });
  try {
    await mkdir(join(blueprints, "skills", "demo"), { recursive: true });
    await mkdir(join(blueprints, "agents", "demo"), { recursive: true });
    await writeFile(
      join(blueprints, "skills", "demo", "SKILL.md"),
      "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nshipped Skill\n",
    );
    await writeFile(
      join(blueprints, "agents", "demo.agent.md"),
      "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\n{{ variables.not_supplied }}\n",
    );
    await mkdir(join(project, ".github", "skills", "demo"), { recursive: true });
    await mkdir(join(project, ".github", "agents"), { recursive: true });
    await writeFile(skillPath, oldSkill);
    await writeFile(agentPath, oldAgent);
    await writeFile(configPath, config);

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /undefined|not_supplied/i);
    assert.equal(await readFile(skillPath, "utf8"), oldSkill);
    assert.equal(await readFile(agentPath, "utf8"), oldAgent);
    assert.equal(await readFile(configPath, "utf8"), config);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update keeps a nested Agent version stable when a Skill supporting template mutates Stacks", async () => {
  const blueprints = await makeTempDir("spindle-version-context-blueprints-");
  const project = await makeTempDir("spindle-version-context-project-");
  const skillSource = join(blueprints, "skills", "demo");
  const agentSource = join(blueprints, "agents", "demo.agent.md");
  const skillInstalled = join(project, ".github", "skills", "demo", "SKILL.md");
  const agentInstalled = join(project, ".github", "agents", "demo.agent.md");
  const configPath = join(project, ".github", "spindle.json");
  const config = JSON.stringify({ stacks: ["python"], variables: {} });
  const agent = [
    "---",
    "meta:",
    "  spindle:",
    "    version: {% if 'python' in stacks %}2.0.0{% else %}1.0.0{% endif %}",
    "---",
    "Shipped Agent",
    "",
  ].join("\n");
  try {
    await mkdir(skillSource, { recursive: true });
    await mkdir(join(agentSource, ".."), { recursive: true });
    await writeFile(
      join(skillSource, "SKILL.md"),
      "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nShipped Skill\n",
    );
    await writeFile(join(skillSource, "README.md"), "{{ stacks.pop() }}");
    await writeFile(agentSource, agent);
    await mkdir(dirname(skillInstalled), { recursive: true });
    await mkdir(dirname(agentInstalled), { recursive: true });
    await writeFile(
      skillInstalled,
      "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Skill\n",
    );
    await writeFile(
      agentInstalled,
      "---\nmeta:\n  spindle:\n    version: 1.0.0\n---\nlocal Agent\n",
    );
    await writeFile(configPath, config);

    const result = runCli(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      pathWith(justDirectory),
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(skillInstalled, "utf8"), /version: 2\.0\.0/);
    assert.equal(await readFile(join(dirname(skillInstalled), "README.md"), "utf8"), "python");
    assert.equal(
      await readFile(agentInstalled, "utf8"),
      "---\nmeta:\n  spindle:\n    version: 2.0.0\n---\nShipped Agent\n",
    );
    assert.equal(await readFile(configPath, "utf8"), config);
    assert.match(result.stdout, /updated 1.*skill\(s\)/);
    assert.match(result.stdout, /updated 1.*agent\(s\)/);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});
