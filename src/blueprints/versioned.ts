import { basename } from "node:path";

import matter from "gray-matter";

import { compareSemver, parseSemver, readBlueprintVersion } from "../version.js";
import type { BlueprintUpdateInput, BlueprintUpdatePlan } from "./types.js";

export function validateVersionedMetadata(
  kind: string,
  entryFile: string,
  relativePath: string,
  renderedText: string,
) {
  if (relativePath !== entryFile) return;
  const version = matter(renderedText).data.metadata?.spindle?.version;
  if (typeof version !== "string" || parseSemver(version) === null) {
    throw new Error(
      `Invalid ${kind} metadata in '${relativePath}': expected a semver \`metadata.spindle.version\` in frontmatter.`,
    );
  }
}

export async function planVersionedUpdate(
  input: BlueprintUpdateInput,
  kind: string,
  entryFile: string,
  installedFile: (target: string) => string,
  malformedInstalledMetadata: "error" | "warning",
): Promise<BlueprintUpdatePlan> {
  const { name, sourceFiles, target, installed, resolveContext } = input;
  const source = sourceFiles.find((file) => file.outputPath === entryFile)?.sourcePath;
  const context = source === undefined ? undefined : await resolveContext();
  if (source !== undefined && context === undefined) {
    throw new Error(
      `Cannot render the shipped ${kind.toLowerCase()} Blueprint '${name}' without resolved project Variables.`,
    );
  }
  let renderedEntry: BlueprintUpdatePlan["renderedEntry"];
  const shipped =
    source === undefined
      ? null
      : await readBlueprintVersion(source, context, {
          onRendered: (sourceText, renderedText) => {
            renderedEntry = { sourcePath: source, outputPath: entryFile, sourceText, renderedText };
          },
        });
  const shippedVersion = shipped === null ? null : parseSemver(shipped);
  if (shipped === null || shippedVersion === null) {
    throw new Error(
      `The shipped ${kind.toLowerCase()} Blueprint '${name}' has no valid semver version in its ${entryFile}.`,
    );
  }
  if (!installed) return { status: "new", renderedEntry };

  const installedPath = installedFile(target);
  const installedText = await readBlueprintVersion(installedPath, undefined, {
    rejectMalformed: malformedInstalledMetadata === "error",
  });
  const installedVersion = installedText === null ? null : parseSemver(installedText);
  if (installedText === null || installedVersion === null) {
    const description =
      installedText === null ? "no version" : `non-semver version '${installedText}'`;
    return {
      status: "warning",
      warning: `Skipping ${kind} '${name}': installed ${basename(installedPath)} has ${description}.`,
    };
  }
  if (compareSemver(shippedVersion, installedVersion) > 0) {
    return {
      status: "update",
      installedVersion: installedText,
      availableVersion: shipped,
      versionedEntry:
        source === undefined ? undefined : { sourcePath: source, outputPath: entryFile },
      renderedEntry,
    };
  }
  return { status: "up-to-date" };
}
