import { readFileSync } from "node:fs";

import { beforeEach, expect, test, vi } from "vitest";

import { publishSchema, validateReleaseInputs } from "../../../.github/scripts/publish-schema.mjs";

vi.mock("node:fs", () => ({ readFileSync: vi.fn() }));

const pkg = { name: "@use-the-fork/spindle", version: "1.2.3" };
const sha = "a".repeat(40);
const release = { tag_name: "v1.2.3", draft: false, prerelease: false };
let files: Record<string, string>;

beforeEach(() => {
  files = {
    "package.json": JSON.stringify(pkg),
    "build/spindle.schema.json": '{"type":"object"}',
    "CHANGELOG.md": "# Spindle\n\n## 1.2.3\n\nRelease notes.\n\n## 1.2.2\n\nOld notes.",
  };
  vi.mocked(readFileSync).mockImplementation((path) => {
    if (!(String(path) in files)) throw new Error(`Missing ${path}`);
    return files[String(path)];
  });
});

function fixture(overrides: Record<string, unknown> = {}) {
  const gh = vi.fn((...args: string[]) => {
    if (args[0] !== "api") return "";
    if (args[1].includes("/git/ref/")) return JSON.stringify({ object: { type: "commit", sha } });
    return JSON.stringify(release);
  });
  return {
    pkg,
    notes: "Release notes.",
    publishedPackages: JSON.stringify([pkg]),
    repository: "UseTheFork/spindle",
    sha,
    gh,
    ...overrides,
  };
}

test("validates the built schema and selects only the matching changelog entry", () => {
  expect(validateReleaseInputs()).toEqual({ pkg, notes: "Release notes." });
});

test.each([
  ["build/spindle.schema.json", "null"],
  ["build/spindle.schema.json", "not JSON"],
  ["package.json", JSON.stringify({ ...pkg, version: "undefined" })],
  ["package.json", JSON.stringify({ ...pkg, version: "1.2.3-01" })],
  ["CHANGELOG.md", "# Spindle\n\n## 1.2.2\n\nOld notes."],
])("rejects invalid release input %s", (path, contents) => {
  files[path] = contents;
  expect(() => validateReleaseInputs()).toThrow();
});

test("uploads the stable asset name to an existing matching release", () => {
  const input = fixture();
  publishSchema(input);
  expect(input.gh).toHaveBeenLastCalledWith(
    "release",
    "upload",
    "v1.2.3",
    "build/spindle.schema.json",
    "--repo",
    "UseTheFork/spindle",
    "--clobber",
  );
  expect(input.gh.mock.calls.some((args) => args[1] === "create")).toBe(false);
});

test.each([
  "",
  "{}",
  "[]",
  JSON.stringify([{ ...pkg, version: "9.0.0" }]),
  JSON.stringify([{ ...pkg, name: "other" }]),
])(
  "rejects malformed or mismatched publish output before any API call: %s",
  (publishedPackages) => {
    const input = fixture({ publishedPackages });
    expect(() => publishSchema(input)).toThrow();
    expect(input.gh).not.toHaveBeenCalled();
  },
);

test("rejects a mismatched tag without creating a release", () => {
  const input = fixture({ sha: "b".repeat(40) });
  expect(() => publishSchema(input)).toThrow("does not point");
  expect(input.gh).toHaveBeenCalledTimes(1);
});

test("resolves annotated tags before uploading", () => {
  const input = fixture();
  input.gh.mockImplementationOnce(() =>
    JSON.stringify({ object: { type: "tag", sha: "b".repeat(40) } }),
  );
  input.gh.mockImplementationOnce(() => JSON.stringify({ object: { type: "commit", sha } }));
  publishSchema(input);
  expect(input.gh).toHaveBeenCalledWith(
    "api",
    `repos/UseTheFork/spindle/git/tags/${"b".repeat(40)}`,
  );
});

test("creates a missing prerelease only with a verified tag and matching notes", () => {
  const prerelease = { ...pkg, version: "1.2.3-beta.1" };
  const input = fixture({ pkg: prerelease, publishedPackages: JSON.stringify([prerelease]) });
  input.gh.mockImplementationOnce(() => JSON.stringify({ object: { type: "commit", sha } }));
  input.gh.mockImplementationOnce(() => {
    throw Object.assign(new Error("not found"), { stderr: "gh: Not Found (HTTP 404)" });
  });
  publishSchema(input);
  expect(input.gh).toHaveBeenCalledWith(
    "release",
    "create",
    "v1.2.3-beta.1",
    "--repo",
    "UseTheFork/spindle",
    "--verify-tag",
    "--title",
    "v1.2.3-beta.1",
    "--notes",
    "Release notes.",
    "--prerelease",
  );
});

test("fails on release API errors instead of attempting creation", () => {
  const input = fixture();
  input.gh.mockImplementationOnce(() => JSON.stringify({ object: { type: "commit", sha } }));
  input.gh.mockImplementationOnce(() => {
    throw new Error("HTTP 500");
  });
  expect(() => publishSchema(input)).toThrow("HTTP 500");
  expect(input.gh).toHaveBeenCalledTimes(2);
});

test.each([
  { ...release, draft: true },
  { ...release, tag_name: "v9.0.0" },
])("rejects unexpected existing release metadata", (metadata) => {
  const input = fixture();
  input.gh.mockImplementationOnce(() => JSON.stringify({ object: { type: "commit", sha } }));
  input.gh.mockImplementationOnce(() => JSON.stringify(metadata));
  expect(() => publishSchema(input)).toThrow("unexpected metadata");
  expect(input.gh).toHaveBeenCalledTimes(2);
});

test("propagates upload failures", () => {
  const input = fixture();
  input.gh.mockImplementationOnce(() => JSON.stringify({ object: { type: "commit", sha } }));
  input.gh.mockImplementationOnce(() => JSON.stringify(release));
  input.gh.mockImplementationOnce(() => {
    throw new Error("upload failed");
  });
  expect(() => publishSchema(input)).toThrow("upload failed");
});

test("propagates missing tags without creating a release", () => {
  const input = fixture();
  input.gh.mockImplementationOnce(() => {
    throw new Error("tag missing");
  });
  expect(() => publishSchema(input)).toThrow("tag missing");
  expect(input.gh).toHaveBeenCalledTimes(1);
});

test("does not upload when release creation fails", () => {
  const input = fixture();
  input.gh.mockImplementationOnce(() => JSON.stringify({ object: { type: "commit", sha } }));
  input.gh.mockImplementationOnce(() => {
    throw Object.assign(new Error("not found"), { stderr: "gh: Not Found (HTTP 404)" });
  });
  input.gh.mockImplementationOnce(() => {
    throw new Error("creation failed");
  });
  expect(() => publishSchema(input)).toThrow("creation failed");
  expect(input.gh).toHaveBeenCalledTimes(3);
});
