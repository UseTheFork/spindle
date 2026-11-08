import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { InitCommand } from "@/commands/init/init-command";
import { UpdateCommand } from "@/commands/update/update-command";
import {
  parseProjectConfiguration,
  loadProjectConfiguration,
  readConfig,
  requireProjectConfiguration,
} from "@/config/ProjectConfiguration";
import { Application } from "@/foundation/Application";
import { LoadProjectConfiguration } from "@/foundation/bootstrap/LoadProjectConfiguration";

import { serviceFixture } from "../SubagentDrivenDevelopment/helpers/helpers";

test("configuration parsing preserves duplicate stacks, empty variables, and unknown data without defaults", () => {
  const raw = '{"stacks":["python","python"],"variables":{"owner":""},"custom":{"enabled":true}}';
  const state = parseProjectConfiguration(raw);
  expect(state.status).toBe("valid");
  if (state.status !== "valid") throw new Error("Expected valid state");
  expect(state.data).toEqual(JSON.parse(raw));
  const config = requireProjectConfiguration(state);
  expect(config.config).toBe(state.data);
  expect(config.stacks).toBe(state.data.stacks);
  expect(config.variables).toBe(state.data.variables);
  expect(config.variables).not.toHaveProperty("project");
});

test("invalid JSON retains its original text and SyntaxError separately from command messaging", () => {
  const state = parseProjectConfiguration("{");
  expect(state.status).toBe("invalid");
  if (state.status !== "invalid") throw new Error("Expected invalid state");
  expect(state.data).toBe("{");
  expect(state.error).toBeInstanceOf(SyntaxError);
  expect(() => requireProjectConfiguration(state)).toThrow(
    ".github/spindle.json is not valid JSON. Run `spindle init`",
  );
});

test.each([
  null,
  { stacks: [], variables: {} },
  { stacks: ["python"], variables: [] },
  { stacks: ["python"], variables: { owner: 1 } },
  { stacks: [1], variables: {} },
  { stacks: ["python"] },
])("schema-invalid configuration remains inspectable without injecting defaults: %j", (data) => {
  const state = parseProjectConfiguration(JSON.stringify(data));
  expect(state.status).toBe("invalid");
  if (state.status !== "invalid") throw new Error("Expected invalid state");
  expect(state.data).toEqual(data);
  expect(state.error.message).toContain("malformed");
});

test("unsupported and empty stack IDs retain the existing validation errors", () => {
  for (const stack of ["", "unsupported"]) {
    const state = parseProjectConfiguration(JSON.stringify({ stacks: [stack], variables: {} }));
    expect(() => requireProjectConfiguration(state)).toThrow(
      `Invalid stack '${stack}'. Supported stacks: php-laravel, python, typescript.`,
    );
    if (state.status !== "invalid") throw new Error("Expected invalid state");
    expect(() => requireProjectConfiguration(state)).toThrow(state.error);
  }
});

test("missing configuration is absent while unexpected filesystem errors propagate", async () => {
  const { repo } = await serviceFixture();
  const path = join(repo, "spindle.json");
  await expect(loadProjectConfiguration(path)).resolves.toEqual({ status: "absent" });
  await expect(readConfig(path)).rejects.toThrow("This repository has no .github/spindle.json.");
  mkdirSync(path);
  await expect(loadProjectConfiguration(path)).rejects.toMatchObject({ code: "EISDIR" });
});

test("bootstrap binds invalid project data independently from application configuration without rewriting", async () => {
  const { repo } = await serviceFixture();
  mkdirSync(join(repo, ".github"));
  const path = join(repo, ".github", "spindle.json");
  writeFileSync(path, '{"stacks":[]}');
  const app = new Application({ basePath: repo });
  app.instance("path.workspace", repo);
  app.config.set("owner", "application");
  await new LoadProjectConfiguration().bootstrap(app);
  expect(app.value("config.project")).toMatchObject({ status: "invalid", data: { stacks: [] } });
  expect(app.config.string("owner")).toBe("application");
  expect(app.config.has("project")).toBe(false);
  expect(readFileSync(path, "utf8")).toBe('{"stacks":[]}');
});

test("init still rejects an existing malformed file and update demands valid bootstrapped configuration", async () => {
  const { repo, app } = await serviceFixture();
  mkdirSync(join(repo, ".github"));
  writeFileSync(join(repo, ".github", "spindle.json"), "{");
  await new LoadProjectConfiguration().bootstrap(app);
  await expect((await app.make(InitCommand)).run([], [], false, undefined)).rejects.toThrow(
    "This repository already has .github/spindle.json;",
  );
  await expect((await app.make(UpdateCommand)).run(false, undefined)).rejects.toThrow(
    ".github/spindle.json is not valid JSON.",
  );
});
