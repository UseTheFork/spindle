import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { InitCommand } from "@/BlueprintManagement/Commands/InitCommand";
import { UpdateCommand } from "@/BlueprintManagement/Commands/UpdateCommand";
import { Application } from "@/Foundation/Application";
import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";

import { serviceFixture } from "../../Helpers/SubagentDrivenDevelopment/helpers";

test("configuration commands require a booted application", async () => {
  const app = new Application({ basePath: "/workspace" });
  await expect(new InitCommand(app).run([], undefined, false, undefined)).rejects.toThrow(
    "Application services can only run after the application has booted.",
  );
  await expect(new UpdateCommand(app).run()).rejects.toThrow(
    "Application services can only run after the application has booted.",
  );
});

test("configuration parsing ignores legacy variables and preserves unknown data without defaults", () => {
  const raw = '{"stacks":["python","python"],"variables":{"owner":""},"custom":{"enabled":true}}';
  const state = LoadProjectConfiguration.parse(raw);
  expect(state.status).toBe("valid");
  if (state.status !== "valid") throw new Error("Expected valid state");
  expect(state.data).toEqual(JSON.parse(raw));
  const config = LoadProjectConfiguration.require(state);
  expect(config.config).toBe(state.data);
  expect(config.stacks).toBe(state.data.stacks);
});

test("configuration accepts an empty stack list and an optional tooling registry", () => {
  const state = LoadProjectConfiguration.parse(
    JSON.stringify({
      stacks: [],
      variables: {},
      spindle_package_manager: "pnpm",
      tooling: [{ key: "test-unit", section: "Testing", command: "pnpm test" }],
    }),
  );
  expect(state.status).toBe("valid");
  if (state.status !== "valid") throw new Error("Expected valid state");
  expect(state.data.stacks).toEqual([]);
  expect(state.data.spindle_package_manager).toBe("pnpm");
  expect(state.data.tooling).toEqual([
    { key: "test-unit", section: "Testing", command: "pnpm test" },
  ]);
});

test("invalid JSON retains its original text and SyntaxError separately from command messaging", () => {
  const state = LoadProjectConfiguration.parse("{");
  expect(state.status).toBe("invalid");
  if (state.status !== "invalid") throw new Error("Expected invalid state");
  expect(state.data).toBe("{");
  expect(state.error).toBeInstanceOf(SyntaxError);
  expect(() => LoadProjectConfiguration.require(state)).toThrow(
    ".github/spindle.json is not valid JSON. Run `spindle init`",
  );
});

test.each([
  null,
  { stacks: [1], variables: {} },
  { stacks: ["python"], spindle_package_manager: "" },
  { stacks: ["python"], spindle_package_manager: "pnpm\nrun" },
  {
    stacks: [],
    variables: {},
    tooling: [{ key: "bad key", section: "Testing", command: "pnpm test" }],
  },
  {
    stacks: [],
    variables: {},
    tooling: [
      { key: "duplicate", section: "Testing", command: "pnpm test" },
      { key: "duplicate", section: "Testing", command: "pnpm test --watch" },
    ],
  },
])("schema-invalid configuration remains inspectable without injecting defaults: %j", (data) => {
  const state = LoadProjectConfiguration.parse(JSON.stringify(data));
  expect(state.status).toBe("invalid");
  if (state.status !== "invalid") throw new Error("Expected invalid state");
  expect(state.data).toEqual(data);
  expect(state.error.message).toContain("malformed");
});

test("unsupported and empty stack IDs retain the existing validation errors", () => {
  for (const stack of ["", "unsupported"]) {
    const state = LoadProjectConfiguration.parse(
      JSON.stringify({ stacks: [stack], variables: {} }),
    );
    expect(() => LoadProjectConfiguration.require(state)).toThrow(
      `Invalid stack '${stack}'. Supported stacks: php-laravel, python, typescript.`,
    );
    if (state.status !== "invalid") throw new Error("Expected invalid state");
    expect(() => LoadProjectConfiguration.require(state)).toThrow(state.error);
  }
});

test("missing configuration is absent while unexpected filesystem errors propagate", async () => {
  const { repo } = await serviceFixture();
  const path = join(repo, "spindle.json");
  const absent = await LoadProjectConfiguration.load(path);
  expect(absent).toEqual({ status: "absent" });
  expect(() => LoadProjectConfiguration.require(absent)).toThrow(
    "This repository has no .github/spindle.json.",
  );
  mkdirSync(path);
  await expect(LoadProjectConfiguration.load(path)).rejects.toMatchObject({ code: "EISDIR" });
});

test("bootstrap binds invalid project data independently from application configuration without rewriting", async () => {
  const { repo } = await serviceFixture();
  const path = join(repo, ".github", "spindle.json");
  writeFileSync(path, '{"stacks":["unsupported"]}');
  const app = new Application({ basePath: repo });
  app.instance("path.workspace", repo);
  app.config.set("owner", "application");
  await new LoadProjectConfiguration().bootstrap(app);
  expect(app.value("config.project")).toMatchObject({
    status: "invalid",
    data: { stacks: ["unsupported"] },
  });
  expect(app.config.string("owner")).toBe("application");
  expect(app.config.has("project")).toBe(false);
  expect(readFileSync(path, "utf8")).toBe('{"stacks":["unsupported"]}');
});

test("init still rejects an existing malformed file and update demands valid bootstrapped configuration", async () => {
  const { repo, app } = await serviceFixture();
  writeFileSync(join(repo, ".github", "spindle.json"), "{");
  await new LoadProjectConfiguration().bootstrap(app);
  await expect((await app.make(InitCommand)).run([], undefined, false, undefined)).rejects.toThrow(
    "not valid JSON",
  );
  await expect((await app.make(UpdateCommand)).run()).rejects.toThrow(
    ".github/spindle.json is not valid JSON.",
  );
});
