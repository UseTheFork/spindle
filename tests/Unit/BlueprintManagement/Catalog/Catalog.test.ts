import { expect, test } from "vitest";

import {
  blueprintCatalog,
  validateBlueprintCatalog,
} from "@/BlueprintManagement/Catalog/BlueprintCatalog";

test("catalog validation preserves schema and path diagnostics for static definitions", () => {
  const entry = { path: "selected.agent.md", stacks: [] };
  const definition = (value: unknown) => ({
    agents: { selected: value },
    instructions: {},
    skills: {},
  });
  const cases: { data: unknown; diagnostic: RegExp }[] = [
    { data: null, diagnostic: /must be an object/ },
    { data: { agents: {}, instructions: {} }, diagnostic: /missing required 'skills'/ },
    { data: { ...definition(entry), other: {} }, diagnostic: /Unknown Blueprint Catalog kind/ },
    { data: { ...definition(entry), agents: [] }, diagnostic: /must be a mapping/ },
    { data: definition(null), diagnostic: /must be an entry mapping/ },
    { data: definition({ ...entry, extra: true }), diagnostic: /Unknown field 'extra'/ },
    {
      data: definition({ path: entry.path }),
      diagnostic: /missing required 'stacks'/,
    },
    { data: definition({ ...entry, status: "removed" }), diagnostic: /Unknown field 'status'/ },
    {
      data: definition({ ...entry, stacks: "python" }),
      diagnostic: /must be a list of Stack names/,
    },
    { data: definition({ ...entry, stacks: ["ruby"] }), diagnostic: /Invalid Stack 'ruby'/ },
    {
      data: { agents: {}, instructions: {}, skills: { selected: entry } },
      diagnostic: /must select a directory/,
    },
  ];
  for (const path of [
    "",
    "/",
    "../escape",
    "/absolute",
    "C:/absolute",
    "a\\b",
    "a//b",
    "./a",
    "*.md",
  ]) {
    cases.push({
      data: definition({ ...entry, path }),
      diagnostic: /non-empty relative path|unsafe/,
    });
  }
  for (const { data, diagnostic } of cases) {
    expect(() => validateBlueprintCatalog(data)).toThrow(diagnostic);
  }
});

test("static catalog normalization preserves logical keys, directories, and Stack selection data", () => {
  expect(
    validateBlueprintCatalog({
      agents: {
        reviewer: {
          path: "group/reviewer.agent.md",
          stacks: ["python", "typescript"],
          canReview: true,
        },
      },
      instructions: {},
      skills: { selected: { path: "selected/", stacks: [] } },
    }),
  ).toEqual({
    agents: [
      {
        key: "reviewer",
        path: "group/reviewer.agent.md",
        directory: false,
        stacks: ["python", "typescript"],
        canReview: true,
      },
    ],
    instructions: [],
    skills: [{ key: "selected", path: "selected", directory: true, stacks: [] }],
  });
});

test("catalog review eligibility is agent-only and must be boolean", () => {
  const entry = { path: "reviewer.agent.md", stacks: [] };
  const catalog = (agents: unknown, instructions: unknown, skills: unknown) => ({
    agents,
    instructions,
    skills,
  });

  expect(
    validateBlueprintCatalog(catalog({ reviewer: { ...entry, canReview: true } }, {}, {}))
      .agents[0],
  ).toEqual({
    key: "reviewer",
    path: "reviewer.agent.md",
    directory: false,
    stacks: [],
    canReview: true,
  });
  expect(blueprintCatalog.agents["sdd-reviewer"]?.canReview).toBe(true);
  expect(blueprintCatalog.agents["sdd-code-reviewer"]?.canReview).toBe(true);
  expect(blueprintCatalog.agents["sdd-task-reviewer"]?.canReview).toBe(true);
  expect(
    validateBlueprintCatalog(catalog({ reviewer: { ...entry, canReview: false } }, {}, {}))
      .agents[0]?.canReview,
  ).toBe(false);
  expect(() =>
    validateBlueprintCatalog(catalog({ reviewer: { ...entry, canReview: "yes" } }, {}, {})),
  ).toThrow(/canReview.*boolean/);
  expect(() =>
    validateBlueprintCatalog(catalog({}, { reviewer: { ...entry, canReview: true } }, {})),
  ).toThrow(/canReview.*agents/);
  expect(() =>
    validateBlueprintCatalog(
      catalog({}, {}, { reviewer: { path: "reviewer/", stacks: [], canReview: true } }),
    ),
  ).toThrow(/canReview.*agents/);
});
