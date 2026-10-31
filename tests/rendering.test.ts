import assert from "node:assert/strict";
import { test } from "node:test";

import { renderText } from "../src/render.ts";

const context = { stacks: ["python", "typescript"], variables: { name: "Spindle" } };

test("standard Nunjucks expressions, blocks, and comments render from text", () => {
  const source =
    "Hello {{ variables.name }}! {% if 'python' in stacks %}Python{% else %}Other{% endif %}{# hidden #}";

  assert.equal(renderText(source, context), "Hello Spindle! Python");
});

test("Nunjucks raw blocks preserve literal Nunjucks-like placeholders", () => {
  const source = "{% raw %}{{VSCODE_FOO}} {% if x %}literal{% endif %}{% endraw %}";

  assert.equal(renderText(source, context), "{{VSCODE_FOO}} {% if x %}literal{% endif %}");
});

test("rendering keeps autoescaping disabled", () => {
  assert.equal(
    renderText("{{ variables.markup }}", {
      ...context,
      variables: { markup: '<b>&</b> "q"' },
    }),
    '<b>&</b> "q"',
  );
});

test("undefined values remain errors", () => {
  assert.throws(() => renderText("{{ variables.missing }}", context), /undefined/i);
});

test("legacy custom delimiters are literal text rather than template syntax", () => {
  const source = "<%= variables.name %> <% if true %>body<% endif %> <# note #>";

  assert.equal(renderText(source, context), source);
});
