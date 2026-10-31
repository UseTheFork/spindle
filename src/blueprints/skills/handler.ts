import { join } from "node:path";

import matter from "gray-matter";

import { blueprintsRoot } from "../../install.js";
import {
  compareSemver,
  parseSemver,
  readSkillVersion,
  skillVersionIsTemplated,
} from "../../version.js";
import type { BlueprintHandler } from "../types.js";

export const skillHandler: BlueprintHandler = {
  kind: "Skill",
  sourceDirectory: () => join(blueprintsRoot(), "skills"),
  destinationDirectory: (githubDirectory) => join(githubDirectory, "skills"),
  validateMetadata: (relativePath, renderedText) => {
    if (relativePath !== "SKILL.md") return;
    const version = matter(renderedText).data.version;
    if (typeof version !== "string" || parseSemver(version) === null) {
      throw new Error(
        `Invalid Skill metadata in '${relativePath}': expected a semver \`version\` in frontmatter.`,
      );
    }
  },
  planUpdate: async ({ name, source, target, installed, resolveContext }) => {
    const skillFile = join(source, "SKILL.md");
    const context = (await skillVersionIsTemplated(skillFile)) ? await resolveContext() : undefined;
    const shipped = await readSkillVersion(skillFile, context);
    const shippedVersion = shipped === null ? null : parseSemver(shipped);
    if (shipped === null || shippedVersion === null) {
      throw new Error(
        `The shipped skill Blueprint '${name}' has no valid semver version in its SKILL.md.`,
      );
    }
    if (!installed) return { status: "new" };

    const installedText = await readSkillVersion(join(target, "SKILL.md"));
    const installedVersion = installedText === null ? null : parseSemver(installedText);
    if (installedText === null || installedVersion === null) {
      const description =
        installedText === null ? "no version" : `non-semver version '${installedText}'`;
      return {
        status: "warning",
        warning: `Skipping '${name}': installed SKILL.md has ${description}.`,
      };
    }
    if (compareSemver(shippedVersion, installedVersion) > 0) {
      return {
        status: "update",
        installedVersion: installedText,
        availableVersion: shipped,
      };
    }
    return { status: "up-to-date" };
  },
};
