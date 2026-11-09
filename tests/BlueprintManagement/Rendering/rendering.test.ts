import { expect, test } from "vitest";

import { renderText } from "@/BlueprintManagement/Rendering/RenderText";

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

test("missing computed outputs name the reference in CRLF templates", () => {
  expect(() => renderText("Frontmatter\r\n{{ computed.not_registered }}", context)).toThrow(
    /computed\.not_registered/,
  );
});

test("missing computed outputs name quoted bracket keys containing punctuation", () => {
  for (const source of ['{{ computed["missing-name"] }}', "{{ computed['missing-name'] }}"]) {
    expect(() => renderText(source, context)).toThrow(/Unknown computed output .*missing-name/);
  }
});

test("legacy custom delimiters are literal text rather than template syntax", () => {
  const source = "<%= variables.name %> <% if true %>body<% endif %> <# note #>";

  expect(renderText(source, context)).toBe(source);
});
