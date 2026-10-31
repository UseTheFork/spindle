import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { supportedStacks } from "../src/install.ts";
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

for (let selection = 1; selection < 1 << supportedStacks.length; selection += 1) {
  const stacks = supportedStacks.filter((_, index) => selection & (1 << index));

  test(`codebase design Blueprint renders testability examples for ${stacks.join(", ")}`, async () => {
    const source = await readFile(
      new URL("../src/blueprints/skills/int-codebase-design/SKILL.md", import.meta.url),
      "utf8",
    );
    const rendered = renderText(source, { stacks, variables: {} });
    const section = rendered.split("## Designing for testability\n")[1]?.split("## Relationships")[0];
    assert.ok(section);

    for (const [stack, language] of [
      ["typescript", "typescript"],
      ["python", "python"],
      ["php-laravel", "php"],
    ]) {
      const codeBlocks = section.match(new RegExp("```" + language + "\\n", "g")) ?? [];
      assert.equal(codeBlocks.length, stacks.includes(stack) ? 2 : 0, language);
    }

    assert.match(section, /Accept dependencies, don't create them/);
    assert.match(section, /Return results, don't produce side effects/);
    assert.match(section, /Small surface area/);
    assert.doesNotMatch(rendered, /{%|{{/);
    const [before, after] = source.split(/## Designing for testability\n[\s\S]*?(?=## Relationships)/);
    assert.ok(rendered.startsWith(before));
    assert.ok(rendered.endsWith(after));
  });
}
