import assert from "node:assert/strict";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";

import matter from "gray-matter";

import { App } from "../src/app.ts";
import type { BlueprintCatalogDefinition } from "../src/blueprints/catalog.ts";
import { blueprintCatalog } from "../src/blueprints/catalog.ts";
import { InitCommand } from "../src/commands/init/init-command.ts";
import { UpdateCommand } from "../src/commands/update/update-command.ts";
import { ComputedContextService } from "../src/computed/computed-context.ts";
import { ComputedVariableProvider, type ResolvedConfig } from "../src/computed/provider.ts";
import { renderText } from "../src/render.ts";
import { loadVariableDefinitions } from "../src/variables.ts";
import { makeTempDir, runCliWithCatalog, writeCatalogFixture } from "./helpers.ts";

const description =
  "This is an internal skill do not load it unless explicitly required by the user or another skill.";
const shippedInternalSkills = [
  "int-testing-agent-guidance",
  "int-retrospective",
  "int-prototype",
  "int-domain-modeling",
  "int-code-slop-review",
  "int-code-review",
  "int-writing-skills",
  "int-codebase-design",
  "int-writing-for-agents",
  "int-writing-instruction",
  "int-writing-agents",
  "int-verification-before-completion",
  "int-test-driven-development",
  "int-subagent-driven-dev",
];

async function put(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function fixtureCatalog(): BlueprintCatalogDefinition {
  return {
    skills: {
      demo: { path: "demo/", status: "active", stacks: [] },
    },
    agents: {
      guide: { path: "guide.agent.md", status: "active", stacks: [] },
      guideSupport: { path: "guide-support.txt", status: "active", stacks: [] },
    },
    instructions: {
      testing: { path: "testing.instructions.md", status: "active", stacks: [] },
      testingSupport: { path: "testing-support.txt", status: "active", stacks: [] },
    },
  };
}

async function makeBlueprints() {
  const blueprints = await makeTempDir("spindle-computed-blueprints-");
  await put(
    join(blueprints, "skills/demo/SKILL.md"),
    [
      "---",
      "name: demo",
      'description: "{{ computed.internal_skill_description }}"',
      "metadata:",
      "  spindle:",
      "    version: 1.0.0",
      "---",
      "",
      "Owner={{ variables.owner }}; stacks={% for stack in stacks %}{{ stack }};{% endfor %}",
      "",
    ].join("\n"),
  );
  await put(
    join(blueprints, "skills/demo/supporting.txt"),
    "Skill: {{ computed.internal_skill_description }}\n",
  );
  await put(
    join(blueprints, "agents/guide.agent.md"),
    [
      "---",
      "name: guide",
      'description: "{{ computed.internal_skill_description }}"',
      "metadata:",
      "  spindle:",
      "    version: 1.0.0",
      "---",
      "",
      "Agent body: {{ computed.internal_skill_description }}",
      "",
    ].join("\n"),
  );
  await put(
    join(blueprints, "agents/guide-support.txt"),
    "Agent file: {{ computed.internal_skill_description }}\n",
  );
  await put(
    join(blueprints, "instructions/testing.instructions.md"),
    [
      "---",
      "name: testing",
      'description: "{{ computed.internal_skill_description }}"',
      "metadata:",
      "  spindle:",
      "    version: 1.0.0",
      "---",
      "",
      "Instruction body: {{ computed.internal_skill_description }}",
      "",
    ].join("\n"),
  );
  await put(
    join(blueprints, "instructions/testing-support.txt"),
    "Instruction file: {{ computed.internal_skill_description }}\n",
  );
  writeCatalogFixture(blueprints, fixtureCatalog());
  return blueprints;
}

test("shipped Internal Skill descriptions render in init and eligible update", async () => {
  const blueprints = await makeTempDir("spindle-shipped-internal-blueprints-");
  const project = await makeTempDir("spindle-shipped-internal-project-");

  try {
    await cp(join(process.cwd(), "src/blueprints"), blueprints, { recursive: true });
    writeCatalogFixture(blueprints, blueprintCatalog);

    for (const name of shippedInternalSkills) {
      const source = await readFile(join(blueprints, "skills", name, "SKILL.md"), "utf8");
      assert.equal(
        matter(source).data.description,
        "{{ computed.internal_skill_description }}",
        `${name} frontmatter must use the shared computed description`,
      );
    }

    const initialized = runCliWithCatalog(
      project,
      ["init", "--stack", "python", "--var", "owner=core", "--no-interactive"],
      process.env.PATH ?? "",
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );
    assert.equal(initialized.status, 0, initialized.stderr);

    const installedPath = (name: string) => join(project, ".github", "skills", name, "SKILL.md");
    const currentSkill = "int-code-review";
    const outdatedSkill = "int-test-driven-development";
    const currentBeforeUpdate = await readFile(installedPath(currentSkill), "utf8");
    const outdatedBefore = await readFile(installedPath(outdatedSkill), "utf8");

    for (const name of shippedInternalSkills) {
      const source = matter(await readFile(join(blueprints, "skills", name, "SKILL.md"), "utf8"));
      const generated = await readFile(installedPath(name), "utf8");
      const parsed = matter(generated);
      assert.equal(parsed.data.description, description, `${name} generated description`);
      assert.equal(
        parsed.data.metadata.spindle.version,
        source.data.metadata.spindle.version,
        `${name} retains its Blueprint version`,
      );
      assert.doesNotMatch(generated, /{{|}}/, `${name} has no unresolved interpolation`);
      if (name === "int-writing-skills") {
        assert.ok(
          parsed.content.includes(description),
          "the unrelated Internal visibility guidance in the body remains literal",
        );
      }
    }

    const updatedSourcePath = join(blueprints, "skills", outdatedSkill, "SKILL.md");
    const updatedSource = matter(await readFile(updatedSourcePath, "utf8"));
    updatedSource.data.metadata.spindle.version = "2.0.0";
    await writeFile(updatedSourcePath, matter.stringify(updatedSource.content, updatedSource.data));

    const updated = runCliWithCatalog(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );
    assert.equal(updated.status, 0, updated.stderr);

    const refreshed = await readFile(installedPath(outdatedSkill), "utf8");
    assert.notEqual(refreshed, outdatedBefore, "the outdated Skill is updated");
    assert.equal(matter(refreshed).data.description, description);
    assert.equal(matter(refreshed).data.metadata.spindle.version, "2.0.0");
    assert.equal(
      await readFile(installedPath(currentSkill), "utf8"),
      currentBeforeUpdate,
      "an otherwise-current matching Skill remains byte-identical",
    );
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("init renders the computed namespace throughout Skills, Agents, and Instructions", async () => {
  const blueprints = await makeBlueprints();
  const project = await makeTempDir("spindle-computed-init-");

  try {
    const result = runCliWithCatalog(
      project,
      ["init", "--stack", "python", "--var", "owner=core", "--no-interactive"],
      process.env.PATH ?? "",
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    const config = JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"));
    assert.deepEqual(config, {
      stacks: ["python"],
      variables: { lint_command: "just lint", owner: "core" },
    });

    const skillPath = join(project, ".github/skills/demo/SKILL.md");
    const skill = await readFile(skillPath, "utf8");
    assert.equal(matter(skill).data.description, description);
    assert.equal(matter(skill).data.metadata.spindle.version, "1.0.0");
    assert.equal(matter(skill).content, "\nOwner=core; stacks=python;\n");
    assert.doesNotMatch(skill, /{{|}}/);
    assert.equal(
      await readFile(join(project, ".github/skills/demo/supporting.txt"), "utf8"),
      `Skill: ${description}\n`,
    );

    for (const [kind, entry, support, body] of [
      ["agents", "guide.agent.md", "guide-support.txt", "Agent body:"],
      ["instructions", "testing.instructions.md", "testing-support.txt", "Instruction body:"],
    ]) {
      const path = join(project, `.github/${kind}/${entry}`);
      const content = await readFile(path, "utf8");
      assert.equal(matter(content).data.description, description);
      assert.equal(matter(content).data.metadata.spindle.version, "1.0.0");
      assert.equal(matter(content).content, `\n${body} ${description}\n`);
      assert.doesNotMatch(content, /{{|}}/);
      assert.equal(
        await readFile(join(project, `.github/${kind}/${support}`), "utf8"),
        `${kind === "agents" ? "Agent" : "Instruction"} file: ${description}\n`,
      );
    }
    assert.doesNotMatch(JSON.stringify(config), /computed|internal_skill_description/);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update reuses computed output and leaves Config and version metadata intact", async () => {
  const blueprints = await makeTempDir("spindle-computed-update-blueprints-");
  const project = await makeTempDir("spindle-computed-update-project-");
  const configBytes = Buffer.from(
    JSON.stringify({ stacks: ["typescript"], variables: { owner: "existing" } }, null, 2),
  );

  try {
    await put(
      join(blueprints, "skills/demo/SKILL.md"),
      [
        "---",
        "name: demo",
        'description: "{{ computed.internal_skill_description }}"',
        "metadata:",
        "  spindle:",
        "    version: 2.0.0",
        "---",
        "",
        "Owner={{ variables.owner }}; stacks={% for stack in stacks %}{{ stack }};{% endfor %}",
        "",
      ].join("\n"),
    );
    await put(
      join(blueprints, "skills/demo/supporting.txt"),
      "Update: {{ computed.internal_skill_description }}\n",
    );
    writeCatalogFixture(blueprints, {
      skills: {
        demo: { path: "demo/", status: "active", stacks: [] },
      },
      agents: {},
      instructions: {},
    });

    const github = join(project, ".github");
    await put(join(github, "spindle.json"), configBytes.toString("utf8"));
    await put(
      join(github, "skills/demo/SKILL.md"),
      "---\nname: demo\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nOld content\n",
    );
    await put(join(github, "skills/demo/supporting.txt"), "Old supporting file\n");

    const result = runCliWithCatalog(
      project,
      ["update", "--no-interactive", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.equal(result.status, 0, result.stderr);
    const updated = await readFile(join(github, "skills/demo/SKILL.md"), "utf8");
    assert.equal(matter(updated).data.description, description);
    assert.equal(matter(updated).data.metadata.spindle.version, "2.0.0");
    assert.equal(matter(updated).content, "\nOwner=existing; stacks=typescript;\n");
    assert.doesNotMatch(updated, /{{|}}/);
    assert.equal(
      await readFile(join(github, "skills/demo/supporting.txt"), "utf8"),
      `Update: ${description}\n`,
    );
    assert.deepEqual(await readFile(join(github, "spindle.json")), configBytes);
    assert.doesNotMatch(configBytes.toString("utf8"), /computed|internal_skill_description/);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("update identifies a missing computed output and applies no planned changes", async () => {
  const blueprints = await makeTempDir("spindle-computed-missing-blueprints-");
  const project = await makeTempDir("spindle-computed-missing-project-");
  const github = join(project, ".github");
  const configPath = join(github, "spindle.json");
  const currentEntry = join(github, "skills/current/SKILL.md");
  const currentBytes = Buffer.from(
    "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nExisting Skill\n",
  );
  const configBytes = Buffer.from(
    '{\n  "stacks": ["python"],\n  "variables": {"owner": "keep"}\n}\n',
  );

  try {
    writeCatalogFixture(blueprints, {
      skills: {
        current: { path: "current/", status: "active", stacks: [] },
        retired: { path: "retired/", status: "removed", stacks: [] },
      },
      agents: {
        planned: { path: "planned.agent.md", status: "active", stacks: [] },
      },
      instructions: {},
    });
    await put(
      join(blueprints, "skills/current/SKILL.md"),
      [
        "---",
        "metadata:",
        "  spindle:",
        "    version: 2.0.0",
        "---",
        "{{ computed.not_registered }}",
        "",
      ].join("\n"),
    );
    await put(
      join(blueprints, "agents/planned.agent.md"),
      "---\nmetadata:\n  spindle:\n    version: 1.0.0\n---\nNew Agent\n",
    );
    await put(configPath, configBytes.toString("utf8"));
    await put(currentEntry, currentBytes.toString("utf8"));
    await put(join(github, "skills/current/local.txt"), "keep destination-only file\n");
    await put(join(github, "skills/retired/local.txt"), "keep retired Skill\n");

    const result = runCliWithCatalog(
      project,
      ["update", "--no-interactive", "--include-new", "--on-conflict", "overwrite"],
      process.env.PATH ?? "",
      { SPINDLE_BLUEPRINTS_DIR: blueprints },
    );

    assert.notEqual(result.status, 0, result.stdout);
    assert.deepEqual(await readFile(configPath), configBytes);
    assert.deepEqual(await readFile(currentEntry), currentBytes);
    assert.equal(
      await readFile(join(github, "skills/current/local.txt"), "utf8"),
      "keep destination-only file\n",
    );
    assert.equal(
      await readFile(join(github, "skills/retired/local.txt"), "utf8"),
      "keep retired Skill\n",
    );
    await assert.rejects(readFile(join(github, "agents/planned.agent.md")), { code: "ENOENT" });
    assert.match(result.stderr, /not_registered/);
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("repeated Updates through one App render fresh Config with computed outputs", async () => {
  const blueprints = await makeTempDir("spindle-computed-app-blueprints-");
  const project = await makeTempDir("spindle-computed-app-project-");
  const github = join(project, ".github");
  const skillName = "int-test-driven-development";
  const sourcePath = join(blueprints, "skills", skillName, "SKILL.md");
  const installedPath = join(github, "skills", skillName, "SKILL.md");
  const descriptionSkill = await readFile(
    join(process.cwd(), "src/blueprints/skills", skillName, "SKILL.md"),
    "utf8",
  );
  const app = new App({ workspaceRoot: project, blueprintSourceRoot: blueprints });

  try {
    await cp(join(process.cwd(), "src/blueprints"), blueprints, { recursive: true });
    const source = matter(descriptionSkill);
    source.content += "\nRun owner={{ variables.owner }}\n";
    await writeFile(sourcePath, matter.stringify(source.content, source.data));

    await (await app.get(InitCommand)).run(["python"], ["owner=first-run"], false, "overwrite");
    const update = await app.get(UpdateCommand);

    const assertRendered = async (owner: string, version: string) => {
      const generated = matter(await readFile(installedPath, "utf8"));
      assert.equal(generated.data.description, description);
      assert.equal(generated.data.metadata.spindle.version, version);
      assert.ok(generated.content.includes(`Run owner=${owner}`));
      const config = await readFile(join(github, "spindle.json"), "utf8");
      assert.doesNotMatch(config, /computed|internal_skill_description/);
    };

    const updateSource = async (version: string, owner: string) => {
      const current = matter(await readFile(sourcePath, "utf8"));
      current.data.metadata.spindle.version = version;
      await writeFile(sourcePath, matter.stringify(current.content, current.data));
      const configPath = join(github, "spindle.json");
      const config = JSON.parse(await readFile(configPath, "utf8"));
      config.variables.owner = owner;
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    };

    await updateSource("900.0.0", "second-run");
    await update.run(false, "overwrite");
    await assertRendered("second-run", "900.0.0");

    await updateSource("901.0.0", "third-run");
    await update.run(false, "overwrite");
    await assertRendered("third-run", "901.0.0");
  } finally {
    await rm(blueprints, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("providers receive immutable resolved Config once per run and refresh across runs", async () => {
  const defaultVariables = Object.fromEntries(
    loadVariableDefinitions().map((definition) => [
      definition.name,
      definition.default ?? "supplied by test",
    ]),
  );
  const config: ResolvedConfig = {
    stacks: ["python", "typescript"],
    variables: defaultVariables,
  };
  let providerConfig: ResolvedConfig | undefined;
  class ConfigProvider extends ComputedVariableProvider {
    render() {
      providerConfig = this.config;
      return `${this.config.stacks.join(",")}:${this.config.variables.owner}:${this.config.variables.lint_command}`;
    }
  }
  let evaluations = 0;
  class CountingProvider extends ComputedVariableProvider {
    render() {
      evaluations += 1;
      return `evaluation-${evaluations}`;
    }
  }
  const registry = {
    config_summary: ConfigProvider,
    count: CountingProvider,
  };

  const app = new App({ workspaceRoot: "/project", blueprintSourceRoot: "/blueprints" });
  const firstRun = await app.create(ComputedContextService);
  let inputResolutions = 0;
  const [firstContext, repeatedContext] = await Promise.all([
    firstRun.resolve(async () => {
      inputResolutions += 1;
      return {
        stacks: [...config.stacks],
        variables: { ...config.variables },
      };
    }, registry),
    firstRun.resolve(async () => {
      inputResolutions += 1;
      return {
        stacks: [...config.stacks],
        variables: { ...config.variables },
      };
    }, registry),
  ]);
  assert.ok(firstContext);
  assert.strictEqual(repeatedContext, firstContext);
  assert.equal(inputResolutions, 1, "a run resolves its base Config once");
  assert.equal(firstContext.computed.config_summary, "python,typescript:nobody:just lint");
  assert.equal(firstContext.computed.count, "evaluation-1");
  assert.ok(providerConfig);
  assert.notStrictEqual(providerConfig.stacks, config.stacks);
  assert.notStrictEqual(providerConfig.variables, config.variables);
  assert.ok(Object.isFrozen(providerConfig.stacks));
  assert.ok(Object.isFrozen(providerConfig.variables));
  assert.throws(() => (providerConfig!.stacks as string[]).push("php-laravel"), TypeError);
  assert.throws(
    () => ((providerConfig!.variables as Record<string, string>).owner = "changed"),
    TypeError,
  );
  const renderContext = {
    ...firstContext,
    variables: {
      ...firstContext.variables,
      internal_skill_description: "user value",
    },
    computed: {
      ...firstContext.computed,
      internal_skill_description: description,
    },
  };
  assert.equal(
    renderText(
      "{{ computed.internal_skill_description }} | {{ variables.internal_skill_description }}",
      renderContext,
    ),
    `${description} | user value`,
  );
  assert.equal(renderText("{{ computed.count }}", renderContext), "evaluation-1");
  assert.equal(evaluations, 1, "reusing resolved values does not render the provider again");

  const secondRun = await app.create(ComputedContextService);
  const secondContext = await secondRun.resolve(
    async () => ({
      stacks: ["typescript"],
      variables: { ...config.variables, owner: "another project" },
    }),
    registry,
  );
  assert.ok(secondContext);
  assert.equal(secondContext.computed.config_summary, "typescript:another project:just lint");
  assert.equal(secondContext.computed.count, "evaluation-2");
  assert.equal(evaluations, 2, "a separate run renders a fresh value");

  const otherApp = new App({ workspaceRoot: "/other-project", blueprintSourceRoot: "/blueprints" });
  const isolatedRun = await otherApp.create(ComputedContextService);
  const isolatedContext = await isolatedRun.resolve(
    async () => ({
      stacks: ["python"],
      variables: { ...config.variables, owner: "isolated project" },
    }),
    registry,
  );
  assert.ok(isolatedContext);
  assert.equal(isolatedContext.computed.config_summary, "python:isolated project:just lint");
  assert.equal(isolatedContext.computed.count, "evaluation-3");
  assert.equal(evaluations, 3, "a separate App starts with a distinct fresh run");
});

test("provider failures stop context resolution with the public key and original error", async () => {
  class FailingProvider extends ComputedVariableProvider {
    render(): string {
      throw new Error("original provider failure");
    }
  }

  const app = new App({ workspaceRoot: "/project", blueprintSourceRoot: "/blueprints" });
  const contextService = await app.create(ComputedContextService);
  const resolvedContext = contextService.resolve(async () => ({ stacks: [], variables: {} }), {
    public_failure_name: FailingProvider,
  });
  await assert.rejects(
    resolvedContext,
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("public_failure_name") &&
      error.message.includes("original provider failure") &&
      error.cause instanceof Error &&
      error.cause.message === "original provider failure",
  );
});
