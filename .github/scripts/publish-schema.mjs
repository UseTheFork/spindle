import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const schemaPath = "build/spindle.schema.json";

export function validateReleaseInputs() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const versionPattern =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;
  if (pkg.name !== "@use-the-fork/spindle" || !versionPattern.test(pkg.version ?? "")) {
    throw new Error("Expected the standalone Spindle package with a valid release version");
  }
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("Expected a JSON schema object");
  }
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `## ${pkg.version}`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  const notes = start === -1 ? "" : lines.slice(start + 1, end === -1 ? undefined : end).join("\n").trim();
  if (!notes) {
    throw new Error(`Missing changelog entry for ${pkg.version}`);
  }
  return { pkg, notes };
}

export function publishSchema({
  pkg,
  notes,
  publishedPackages,
  repository,
  sha,
  gh = (...args) => execFileSync("gh", args, { encoding: "utf8" }).trim(),
}) {
  const published = JSON.parse(publishedPackages);
  if (
    !Array.isArray(published) ||
    published.length !== 1 ||
    published[0]?.name !== pkg.name ||
    published[0]?.version !== pkg.version
  ) {
    throw new Error("Published packages do not match the built Spindle version");
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") || !/^[a-f0-9]{40}$/.test(sha ?? "")) {
    throw new Error("Missing or invalid workflow repository/commit");
  }
  const tag = `v${pkg.version}`;
  const api = (path) => JSON.parse(gh("api", `repos/${repository}/${path}`));
  let object = api(`git/ref/tags/${encodeURIComponent(tag)}`).object;
  for (let depth = 0; object?.type === "tag" && depth < 5; depth++) {
    object = api(`git/tags/${object.sha}`).object;
  }
  if (object?.type !== "commit" || object.sha !== sha) {
    throw new Error(`Release tag ${tag} does not point to the workflow commit`);
  }

  let release;
  try {
    release = api(`releases/tags/${encodeURIComponent(tag)}`);
  } catch (error) {
    // Only a missing release permits creation; authentication and service failures must stop publishing.
    if (!String(error.stderr).includes("(HTTP 404)")) {
      throw error;
    }
  }
  if (release) {
    if (release.tag_name !== tag || release.draft || release.prerelease !== pkg.version.includes("-")) {
      throw new Error(`Existing release ${tag} has unexpected metadata`);
    }
  } else {
    gh(
      "release", "create", tag, "--repo", repository, "--verify-tag",
      "--title", tag, "--notes", notes,
      ...(pkg.version.includes("-") ? ["--prerelease"] : []),
    );
  }
  gh("release", "upload", tag, schemaPath, "--repo", repository, "--clobber");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputs = validateReleaseInputs();
  if (!process.argv.includes("--validate")) {
    publishSchema({
      ...inputs,
      publishedPackages: process.env.PUBLISHED_PACKAGES,
      repository: process.env.GITHUB_REPOSITORY,
      sha: process.env.GITHUB_SHA,
    });
  }
}
