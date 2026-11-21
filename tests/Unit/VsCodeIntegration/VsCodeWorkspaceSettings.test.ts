import { VsCodeWorkspaceSettings } from "@spindle/VsCodeIntegration/Settings/VsCodeWorkspaceSettings";
import { expect, test } from "vitest";

const path = ".vscode/settings.json";

test("missing Workspace Settings produce a valid document with literal dotted keys", () => {
  const managed = {
    "chat.subagents.allowInvocationsFromSubagents": true,
    "literal.template": "{{ computed.missing }}",
  };
  const content = VsCodeWorkspaceSettings.merge(undefined, managed, path);
  expect(VsCodeWorkspaceSettings.parse(content, path)).toEqual(managed);
  expect(content).toContain('  "chat.subagents.allowInvocationsFromSubagents": true');
  expect(content.endsWith("\n")).toBe(true);
});

test("targeted changes preserve unrelated content, comments, tabs, and CRLF", () => {
  const original = [
    "// Workspace preferences",
    "{",
    '\t"editor.fontSize" : 16, // Keep this comment',
    '\t"chat.subagents.allowInvocationsFromSubagents": false,',
    '\t"custom": { "nested": [1, 2,], },',
    "}",
    "",
  ].join("\r\n");
  const content = VsCodeWorkspaceSettings.merge(
    original,
    {
      "chat.subagents.allowInvocationsFromSubagents": true,
      "chat.editor.workingSet.enabled": false,
    },
    path,
  );
  expect(content).toContain("// Workspace preferences\r\n");
  expect(content).toContain('\t"editor.fontSize" : 16, // Keep this comment\r\n');
  expect(content).toContain('\t"custom": { "nested": [1, 2,], },\r\n');
  expect(content).toContain('\t"chat.editor.workingSet.enabled": false');
  expect(content.replaceAll("\r\n", "")).not.toContain("\n");
  expect(VsCodeWorkspaceSettings.parse(content, path)).toEqual({
    "editor.fontSize": 16,
    "chat.subagents.allowInvocationsFromSubagents": true,
    custom: { nested: [1, 2] },
    "chat.editor.workingSet.enabled": false,
  });
});

test("the entire instruction array is replaced and repeated preparation is byte-identical", () => {
  const key = "github.copilot.chat.commitMessageGeneration.instructions";
  const managed = { [key]: [{ file: ".github/copilot/commit-message-style.md" }] };
  const original = JSON.stringify({
    [key]: [{ text: "Custom instructions" }, { file: "other.md" }],
    unrelated: true,
  });
  const content = VsCodeWorkspaceSettings.merge(original, managed, path);
  expect(VsCodeWorkspaceSettings.parse(content, path)).toEqual({
    ...managed,
    unrelated: true,
  });
  expect(content).not.toContain("other.md");
  expect(VsCodeWorkspaceSettings.merge(content, managed, path)).toBe(content);
});

test("already matching managed values preserve the original formatting exactly", () => {
  const original = '{\n    "managed" : true, // Local explanation\n    "other": 1,\n}\n';
  expect(VsCodeWorkspaceSettings.merge(original, { managed: true }, path)).toBe(original);
});

test("inserting managed keys does not move comments belonging to unrelated settings", () => {
  const original = '{\n  "unrelated": 1 // Keep this explanation here\n}\n';
  const content = VsCodeWorkspaceSettings.merge(original, { managed: true }, path);
  expect(content).toContain('  "unrelated": 1 // Keep this explanation here\n');
  expect(VsCodeWorkspaceSettings.parse(content, path)).toEqual({ managed: true, unrelated: 1 });
});

test("nested indentation does not determine indentation for new top-level settings", () => {
  const original = '{ "unrelated": {\n      "nested": true\n  },\n  "another": 1\n}\n';
  const content = VsCodeWorkspaceSettings.merge(original, { managed: true }, path);
  expect(content).toContain('\n  "managed": true,');
  expect(content).toContain('"unrelated": {\n      "nested": true\n  },');
});

test("matching object values are unchanged even when property order differs", () => {
  const original = '{ "managed": { "b": 2, "a": 1 } }';
  expect(VsCodeWorkspaceSettings.merge(original, { managed: { a: 1, b: 2 } }, path)).toBe(original);
});

test("every duplicate managed key is overwritten without removing unrelated comments", () => {
  const original =
    '{ "managed": false, /* Keep this */ "unrelated": 1, "managed": false, "managed": true }';
  const content = VsCodeWorkspaceSettings.merge(original, { managed: true }, path);
  expect(VsCodeWorkspaceSettings.parse(content, path)).toEqual({ unrelated: 1, managed: true });
  expect(content.match(/"managed": true/g)).toHaveLength(3);
  expect(content).toContain('/* Keep this */ "unrelated": 1');
});

test.each(["{", '{"key": }', '{"key": 1} trailing', "", "// Only a comment"])(
  "invalid JSONC is rejected with its destination: %j",
  (source) => {
    expect(() => VsCodeWorkspaceSettings.merge(source, { managed: true }, path)).toThrow(
      `'${path}'`,
    );
    expect(() => VsCodeWorkspaceSettings.merge(source, { managed: true }, path)).toThrow(
      "not valid JSONC",
    );
  },
);

test.each(["[]", "null", "true", "1", '"string"'])(
  "non-object settings roots are rejected: %s",
  (source) => {
    expect(() => VsCodeWorkspaceSettings.merge(source, { managed: true }, path)).toThrow(
      `'${path}' must contain a JSONC object.`,
    );
  },
);
