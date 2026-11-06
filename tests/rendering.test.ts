import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { renderText } from "../src/render.ts";
import { supportedStacks } from "../src/utilities/stacks.ts";

const context = {
  stacks: ["python", "typescript"],
  variables: { name: "Spindle" },
  computed: {
    internal_skill_description:
      "This is an internal skill do not load it unless explicitly required by the user or another skill.",
  },
};

function assertNestedTestabilityExamples(rendered: string) {
  const section = rendered.split("## Designing for testability\n")[1]?.split("## Relationships")[0];
  assert.ok(section);
  for (const phrase of [
    "process the order using an injected payment gateway",
    "create the payment gateway inside the operation",
    "calculate the discount and return it",
    "change the cart total directly",
  ]) {
    assert.ok(section.includes(phrase), `testability guidance includes "${phrase}"`);
  }
  assert.doesNotMatch(section, /```(?:typescript|python|php)\n/);
  const items = section.split(/^\d+\. /m).slice(1);
  assert.equal(items.length, 3, "the section retains its three numbered entries");

  for (const [index, title] of [
    "Accept dependencies, don't create them.",
    "Return results, don't produce side effects.",
  ].entries()) {
    const [heading, ...lines] = items[index].trimEnd().split("\n");
    assert.equal(heading, `**${title}**`);
    // A nonblank continuation must stay inside the numbered item's three-space
    // indentation, including both fences and every line of their contents.
    for (const line of lines.filter((line) => line.trim())) {
      assert.match(line, /^ {3}/, `list entry ${index + 1}: ${line}`);
    }
    assert.deepEqual(
      [...items[index].matchAll(/^ {3}```(\w+)\n/gm)].map((match) => match[1]),
      ["text"],
      `list entry ${index + 1} contains one language-neutral pseudocode example`,
    );
    assert.equal(
      [...items[index].matchAll(/^ {3}```$/gm)].length,
      1,
      `list entry ${index + 1} closes its pseudocode fence`,
    );
  }
}

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

test("missing computed outputs name the reference in CRLF templates", () => {
  assert.throws(
    () => renderText("Frontmatter\r\n{{ computed.not_registered }}", context),
    /computed\.not_registered/,
  );
});

test("missing computed outputs name quoted bracket keys containing punctuation", () => {
  for (const source of ['{{ computed["missing-name"] }}', "{{ computed['missing-name'] }}"]) {
    assert.throws(() => renderText(source, context), /Unknown computed output .*missing-name/);
  }
});

test("legacy custom delimiters are literal text rather than template syntax", () => {
  const source = "<%= variables.name %> <% if true %>body<% endif %> <# note #>";

  assert.equal(renderText(source, context), source);
});

for (let selection = 1; selection < 1 << supportedStacks.length; selection += 1) {
  const stacks = supportedStacks.filter((_, index) => selection & (1 << index));

  test(`codebase design Blueprint renders language-neutral testability examples for ${stacks.join(", ")}`, async () => {
    const source = await readFile(
      new URL("../src/blueprints/skills/int-codebase-design/SKILL.md", import.meta.url),
      "utf8",
    );
    const renderContext = { stacks, variables: {}, computed: context.computed };
    const rendered = renderText(source, renderContext);
    const section = rendered
      .split("## Designing for testability\n")[1]
      ?.split("## Relationships")[0];
    assert.ok(section);
    assert.match(section, /Accept dependencies, don't create them/);
    assert.match(section, /Return results, don't produce side effects/);
    assert.match(section, /Small surface area/);
    assertNestedTestabilityExamples(rendered);
    assert.doesNotMatch(source, /{%[^%]*\bstacks\b|```(?:typescript|python|php)\n/);
    assert.doesNotMatch(rendered, /{%|{{/);
    const [before, after] = source.split(
      /## Designing for testability\n[\s\S]*?(?=## Relationships)/,
    );
    assert.ok(rendered.startsWith(renderText(before, renderContext)));
    assert.ok(rendered.endsWith(after));
  });
}

test("installed codebase design Skill keeps examples nested in their numbered entries", async () => {
  const installed = await readFile(
    new URL("../.github/skills/int-codebase-design/SKILL.md", import.meta.url),
    "utf8",
  );
  assertNestedTestabilityExamples(installed);
});
