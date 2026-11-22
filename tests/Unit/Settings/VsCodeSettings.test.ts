import { projectSettingsSchema } from "@spindle/Settings/Models/ProjectSettings";
import { vsCodeSettingsSchema } from "@spindle/Settings/Models/VsCodeSettings";
import { expect, test } from "vitest";
import { z } from "zod";

test("VS Code management defaults to disabled for new and existing Project Settings", () => {
  expect(vsCodeSettingsSchema.parse({})).toEqual({ enabled: false });
  expect(projectSettingsSchema.parse({ stacks: [] }).vscode).toEqual({ enabled: false });
  expect(projectSettingsSchema.parse({ stacks: [], vscode: {} }).vscode).toEqual({
    enabled: false,
  });
});

test.each([true, false])("Project Settings accepts explicit VS Code management: %s", (enabled) => {
  expect(projectSettingsSchema.parse({ stacks: [], vscode: { enabled } }).vscode).toEqual({
    enabled,
  });
});

test.each([null, true, [], { enabled: "true" }, { enabled: 1 }, { extra: true }])(
  "invalid VS Code integration settings are rejected: %j",
  (vscode) => {
    expect(projectSettingsSchema.safeParse({ stacks: [], vscode }).success).toBe(false);
  },
);

test("the generated input schema describes VS Code management and its default", () => {
  const schema = z.toJSONSchema(projectSettingsSchema, { io: "input" });
  expect(schema.properties?.vscode).toMatchObject({
    type: "object",
    default: { enabled: false },
    properties: {
      enabled: {
        type: "boolean",
        default: false,
        description: expect.stringContaining("VS Code"),
      },
    },
  });
});
