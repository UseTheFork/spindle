import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { test, expect, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

import matter from "gray-matter";

import type { BlueprintCatalogDefinition } from "@/BlueprintManagement/Catalog/BlueprintCatalog";
import { blueprintCatalog } from "@/BlueprintManagement/Catalog/BlueprintCatalog";
import { InitCommand } from "@/BlueprintManagement/Commands/InitCommand";
import { UpdateCommand } from "@/BlueprintManagement/Commands/UpdateCommand";
import { ComputedContextService } from "@/BlueprintManagement/Computed/ComputedContextService";
import {
  ComputedVariableProvider,
  type ResolvedConfig,
} from "@/BlueprintManagement/Computed/ComputedVariableProvider";
import { renderText } from "@/BlueprintManagement/Rendering/RenderText";
import { loadVariableDefinitions } from "@/BlueprintManagement/Rendering/Variables";

import { applicationFixture } from "../../application-fixture";
import { makeTempDir, runCliWithCatalog, writeCatalogFixture } from "../../helpers.ts";

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
    await cp(join(process.cwd(), "src/Blueprints"), blueprints, { recursive: true });
    writeCatalogFixture(blueprints, blueprintCatalog);

    for (const name of shippedInternalSkills) {
      const source = await readFile(join(blueprints, "skills", name, "SKILL.md"), "utf8");
      expect(
        matter(source).data.description,
        `${name} frontmatter must use the shared computed description`,
      ).toBe("{{ computed.internal_skill_description }}");
    }

    const initialized = runCliWithCatalog(
      project,
      ["init", "--stack", "python", "--var", "owner=core", "--no-interactive"],
      process.env.PATH ?? "",
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );
    expect(initialized.status, initialized.stderr).toBe(0);

    const installedPath = (name: string) => join(project, ".github", "skills", name, "SKILL.md");
    const currentSkill = "int-code-review";
    const outdatedSkill = "int-test-driven-development";
    const currentBeforeUpdate = await readFile(installedPath(currentSkill), "utf8");
    const outdatedBefore = await readFile(installedPath(outdatedSkill), "utf8");

    for (const name of shippedInternalSkills) {
      const source = matter(await readFile(join(blueprints, "skills", name, "SKILL.md"), "utf8"));
      const generated = await readFile(installedPath(name), "utf8");
      const parsed = matter(generated);
      expect(parsed.data.description, `${name} generated description`).toBe(description);
      expect(parsed.data.metadata.spindle.version, `${name} retains its Blueprint version`).toBe(
        source.data.metadata.spindle.version,
      );
      expect(generated, `${name} has no unresolved interpolation`).not.toMatch(/{{|}}/);
      if (name === "int-writing-skills") {
        expect(
          parsed.content.includes(description),
          "the unrelated Internal visibility guidance in the body remains literal",
        ).toBeTruthy();
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
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );
    expect(updated.status, updated.stderr).toBe(0);

    const refreshed = await readFile(installedPath(outdatedSkill), "utf8");
    expect(refreshed, "the outdated Skill is updated").not.toBe(outdatedBefore);
    expect(matter(refreshed).data.description).toBe(description);
    expect(matter(refreshed).data.metadata.spindle.version).toBe("2.0.0");
    expect(
      await readFile(installedPath(currentSkill), "utf8"),
      "an otherwise-current matching Skill remains byte-identical",
    ).toBe(currentBeforeUpdate);
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
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(await readFile(join(project, ".github/spindle.json"), "utf8"));
    expect(config).toEqual({
      stacks: ["python"],
      variables: { lint_command: "just lint", owner: "core" },
    });

    const skillPath = join(project, ".github/skills/demo/SKILL.md");
    const skill = await readFile(skillPath, "utf8");
    expect(matter(skill).data.description).toBe(description);
    expect(matter(skill).data.metadata.spindle.version).toBe("1.0.0");
    expect(matter(skill).content).toBe("\nOwner=core; stacks=python;\n");
    expect(skill).not.toMatch(/{{|}}/);
    expect(await readFile(join(project, ".github/skills/demo/supporting.txt"), "utf8")).toBe(
      `Skill: ${description}\n`,
    );

    for (const [kind, entry, support, body] of [
      ["agents", "guide.agent.md", "guide-support.txt", "Agent body:"],
      ["instructions", "testing.instructions.md", "testing-support.txt", "Instruction body:"],
    ]) {
      const path = join(project, `.github/${kind}/${entry}`);
      const content = await readFile(path, "utf8");
      expect(matter(content).data.description).toBe(description);
      expect(matter(content).data.metadata.spindle.version).toBe("1.0.0");
      expect(matter(content).content).toBe(`\n${body} ${description}\n`);
      expect(content).not.toMatch(/{{|}}/);
      expect(await readFile(join(project, `.github/${kind}/${support}`), "utf8")).toBe(
        `${kind === "agents" ? "Agent" : "Instruction"} file: ${description}\n`,
      );
    }
    expect(JSON.stringify(config)).not.toMatch(/computed|internal_skill_description/);
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
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stderr).toBe(0);
    const updated = await readFile(join(github, "skills/demo/SKILL.md"), "utf8");
    expect(matter(updated).data.description).toBe(description);
    expect(matter(updated).data.metadata.spindle.version).toBe("2.0.0");
    expect(matter(updated).content).toBe("\nOwner=existing; stacks=typescript;\n");
    expect(updated).not.toMatch(/{{|}}/);
    expect(await readFile(join(github, "skills/demo/supporting.txt"), "utf8")).toBe(
      `Update: ${description}\n`,
    );
    expect(await readFile(join(github, "spindle.json"))).toEqual(configBytes);
    expect(configBytes.toString("utf8")).not.toMatch(/computed|internal_skill_description/);
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
      { SPINDLE_TEST_BLUEPRINTS_DIR: blueprints },
    );

    expect(result.status, result.stdout).not.toBe(0);
    expect(await readFile(configPath)).toEqual(configBytes);
    expect(await readFile(currentEntry)).toEqual(currentBytes);
    expect(await readFile(join(github, "skills/current/local.txt"), "utf8")).toBe(
      "keep destination-only file\n",
    );
    expect(await readFile(join(github, "skills/retired/local.txt"), "utf8")).toBe(
      "keep retired Skill\n",
    );
    await expect(readFile(join(github, "agents/planned.agent.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(result.stderr).toMatch(/not_registered/);
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
    join(process.cwd(), "src/Blueprints/skills", skillName, "SKILL.md"),
    "utf8",
  );
  const app = applicationFixture(project, blueprints);

  try {
    await cp(join(process.cwd(), "src/Blueprints"), blueprints, { recursive: true });
    const source = matter(descriptionSkill);
    source.content += "\nRun owner={{ variables.owner }}\n";
    await writeFile(sourcePath, matter.stringify(source.content, source.data));

    await (await app.make(InitCommand)).run(["python"], ["owner=first-run"], false, "overwrite");
    const update = await app.make(UpdateCommand);

    const assertRendered = async (owner: string, version: string) => {
      const generated = matter(await readFile(installedPath, "utf8"));
      expect(generated.data.description).toBe(description);
      expect(generated.data.metadata.spindle.version).toBe(version);
      expect(generated.content.includes(`Run owner=${owner}`)).toBeTruthy();
      const config = await readFile(join(github, "spindle.json"), "utf8");
      expect(config).not.toMatch(/computed|internal_skill_description/);
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

  const app = applicationFixture("/project", "/blueprints");
  const firstRun = await app.make(ComputedContextService);
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
  expect(firstContext).toBeTruthy();
  if (!firstContext?.computed) throw new Error("Missing resolved computed context.");
  expect(repeatedContext).toBe(firstContext);
  expect(inputResolutions, "a run resolves its base Config once").toBe(1);
  expect(firstContext.computed.config_summary).toBe("python,typescript:nobody:just lint");
  expect(firstContext.computed.count).toBe("evaluation-1");
  expect(providerConfig).toBeTruthy();
  if (!providerConfig) throw new Error("Missing computed provider configuration.");
  expect(providerConfig.stacks).not.toBe(config.stacks);
  expect(providerConfig.variables).not.toBe(config.variables);
  expect(Object.isFrozen(providerConfig.stacks)).toBeTruthy();
  expect(Object.isFrozen(providerConfig.variables)).toBeTruthy();
  expect(() => (providerConfig!.stacks as string[]).push("php-laravel")).toThrow(TypeError);
  expect(() => ((providerConfig!.variables as Record<string, string>).owner = "changed")).toThrow(
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
  expect(
    renderText(
      "{{ computed.internal_skill_description }} | {{ variables.internal_skill_description }}",
      renderContext,
    ),
  ).toBe(`${description} | user value`);
  expect(renderText("{{ computed.count }}", renderContext)).toBe("evaluation-1");
  expect(evaluations, "reusing resolved values does not render the provider again").toBe(1);

  const secondRun = await app.make(ComputedContextService);
  const secondContext = await secondRun.resolve(
    async () => ({
      stacks: ["typescript"],
      variables: { ...config.variables, owner: "another project" },
    }),
    registry,
  );
  expect(secondContext).toBeTruthy();
  if (!secondContext?.computed) throw new Error("Missing second computed context.");
  expect(secondContext.computed.config_summary).toBe("typescript:another project:just lint");
  expect(secondContext.computed.count).toBe("evaluation-2");
  expect(evaluations, "a separate run renders a fresh value").toBe(2);

  const otherApp = applicationFixture("/other-project", "/blueprints");
  const isolatedRun = await otherApp.make(ComputedContextService);
  const isolatedContext = await isolatedRun.resolve(
    async () => ({
      stacks: ["python"],
      variables: { ...config.variables, owner: "isolated project" },
    }),
    registry,
  );
  expect(isolatedContext).toBeTruthy();
  if (!isolatedContext?.computed) throw new Error("Missing isolated computed context.");
  expect(isolatedContext.computed.config_summary).toBe("python:isolated project:just lint");
  expect(isolatedContext.computed.count).toBe("evaluation-3");
  expect(evaluations, "a separate App starts with a distinct fresh run").toBe(3);
});

test("provider failures stop context resolution with the public key and original error", async () => {
  class FailingProvider extends ComputedVariableProvider {
    render(): string {
      throw new Error("original provider failure");
    }
  }

  const app = applicationFixture("/project", "/blueprints");
  const contextService = await app.make(ComputedContextService);
  const resolvedContext = contextService.resolve(async () => ({ stacks: [], variables: {} }), {
    public_failure_name: FailingProvider,
  });
  await expect(resolvedContext).rejects.toMatchObject({
    message: expect.stringContaining("public_failure_name"),
    cause: expect.objectContaining({ message: "original provider failure" }),
  });
  await expect(resolvedContext).rejects.toThrow(/original provider failure/);
});
