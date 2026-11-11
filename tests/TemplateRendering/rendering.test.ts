import { expect, test } from "vitest";

import { Application } from "@/Foundation/Application";
import { computedVariableProviders } from "@/TemplateRendering/Computed/ComputedVariableProviders";
import { resolveRenderContext } from "@/TemplateRendering/Computed/ResolveRenderContext";
import { renderText } from "@/TemplateRendering/Rendering/RenderText";

const context = {
  stacks: ["python", "typescript"],
  variables: { name: "Spindle" },
  computed: {
    internal_skill_description:
      "This is an internal skill do not load it unless explicitly required by the user or another skill.",
  },
};

test("standard Nunjucks expressions, blocks, and comments render from text", () => {
  const source =
    "Hello {{ variables.name }}! {% if 'python' in stacks %}Python{% else %}Other{% endif %}{# hidden #}";

  expect(renderText(source, context)).toBe("Hello Spindle! Python");
});

test("the authoring flowchart is available as a computed value", () => {
  const provider = computedVariableProviders.authoring_flowchart;
  const flowchart = new provider(new Application({ basePath: "/project" })).render();

  expect(flowchart).toContain("flowchart TD");
  expect(flowchart).toContain("ask one question per turn");
  expect(flowchart).toContain("Do not load other skills or announce the current flowchart step");
  expect(
    renderText("{{ computed.authoring_flowchart }}", {
      ...context,
      computed: { ...context.computed, authoring_flowchart: flowchart },
    }),
  ).toBe(flowchart);
});

test("Nunjucks raw blocks preserve literal Nunjucks-like placeholders", () => {
  const source = "{% raw %}{{VSCODE_FOO}} {% if x %}literal{% endif %}{% endraw %}";

  expect(renderText(source, context)).toBe("{{VSCODE_FOO}} {% if x %}literal{% endif %}");
});

test("rendering keeps autoescaping disabled", () => {
  expect(
    renderText("{{ variables.markup }}", {
      ...context,
      variables: { markup: '<b>&</b> "q"' },
    }),
  ).toBe('<b>&</b> "q"');
});

test("undefined values remain errors", () => {
  expect(() => renderText("{{ variables.missing }}", context)).toThrow(/undefined/i);
});

test("syntax failures and unknown computed values fail rendering", () => {
  expect(() => renderText("{% if %}broken{% endif %}", context)).toThrow();
  expect(() => renderText("{{ computed.not_registered }}", context)).toThrow(
    /Unknown computed output .*computed\.not_registered/,
  );
});

test("supplied values are rendered as data rather than recursively parsed as templates", () => {
  const supplied = "{{ variables.missing }}";
  expect(renderText("{{ variables.name }}", { ...context, variables: { name: supplied } })).toBe(
    supplied,
  );
});

test("shared context accepts caller inputs without Config or Blueprint defaults", () => {
  const resolved = resolveRenderContext(
    new Application({ basePath: "/project" }),
    { variables: { title: "Caller title" } },
    {},
  );

  expect(resolved.stacks).toEqual([]);
  expect(resolved.variables).toEqual({ title: "Caller title" });
  expect(renderText("{{ variables.title }}", resolved)).toBe("Caller title");
  expect(() => renderText("{{ variables.owner }}", resolved)).toThrow(/undefined/i);
});
