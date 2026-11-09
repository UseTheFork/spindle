import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

import { renderText } from "@/BlueprintManagement/Rendering/RenderText";
import { Stacks } from "@/Support/Stacks";

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
  expect(section).toBeTruthy();
  for (const phrase of [
    "process the order using an injected payment gateway",
    "create the payment gateway inside the operation",
    "calculate the discount and return it",
    "change the cart total directly",
  ]) {
    expect(section.includes(phrase), `testability guidance includes "${phrase}"`).toBeTruthy();
  }
  expect(section).not.toMatch(/```(?:typescript|python|php)\n/);
  const items = section.split(/^\d+\. /m).slice(1);
  expect(items.length, "the section retains its three numbered entries").toBe(3);

  for (const [index, title] of [
    "Accept dependencies, don't create them.",
    "Return results, don't produce side effects.",
  ].entries()) {
    const [heading, ...lines] = items[index].trimEnd().split("\n");
    expect(heading).toBe(`**${title}**`);
    // A nonblank continuation must stay inside the numbered item's three-space
    // indentation, including both fences and every line of their contents.
    for (const line of lines.filter((line) => line.trim())) {
      expect(line, `list entry ${index + 1}: ${line}`).toMatch(/^ {3}/);
    }
    expect(
      [...items[index].matchAll(/^ {3}```(\w+)\n/gm)].map((match) => match[1]),
      `list entry ${index + 1} contains one language-neutral pseudocode example`,
    ).toEqual(["text"]);
    expect(
      [...items[index].matchAll(/^ {3}```$/gm)].length,
      `list entry ${index + 1} closes its pseudocode fence`,
    ).toBe(1);
  }
}

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

for (let selection = 1; selection < 1 << Stacks.supported.length; selection += 1) {
  const stacks = Stacks.supported.filter((_, index) => selection & (1 << index));

  test(`codebase design Blueprint renders language-neutral testability examples for ${stacks.join(", ")}`, async () => {
    const source = await readFile(
      new URL("../../../src/Blueprints/skills/int-codebase-design/SKILL.md", import.meta.url),
      "utf8",
    );
    const renderContext = { stacks, variables: {}, computed: context.computed };
    const rendered = renderText(source, renderContext);
    const section = rendered
      .split("## Designing for testability\n")[1]
      ?.split("## Relationships")[0];
    expect(section).toBeTruthy();
    expect(section).toMatch(/Accept dependencies, don't create them/);
    expect(section).toMatch(/Return results, don't produce side effects/);
    expect(section).toMatch(/Small surface area/);
    assertNestedTestabilityExamples(rendered);
    expect(source).not.toMatch(/{%[^%]*\bstacks\b|```(?:typescript|python|php)\n/);
    expect(rendered).not.toMatch(/{%|{{/);
    const [before, after] = source.split(
      /## Designing for testability\n[\s\S]*?(?=## Relationships)/,
    );
    expect(rendered.startsWith(renderText(before, renderContext))).toBeTruthy();
    expect(rendered.endsWith(after)).toBeTruthy();
  });
}

test("installed codebase design Skill keeps examples nested in their numbered entries", async () => {
  const installed = await readFile(
    new URL("../../../.github/skills/int-codebase-design/SKILL.md", import.meta.url),
    "utf8",
  );
  assertNestedTestabilityExamples(installed);
});
