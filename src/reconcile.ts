import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  assertSafeInstallPaths,
  exists,
  installDirectory,
  type ConflictPolicy,
} from "./install.js";
import type { RenderContext } from "./render.js";
import { compareSemver, parseSemver, readSkillVersion } from "./version.js";

export interface SkillOutcome {
  name: string;
  status: "installed" | "updated" | "skipped" | "up-to-date";
  warning?: string;
}

interface ReconcileCommon {
  githubDirectory: string;
  stubRoot: string;
  context: RenderContext;
  conflictPolicy?: ConflictPolicy;
  chooseConflict?: (
    name: string,
    installedVersion?: string,
    availableVersion?: string,
  ) => Promise<ConflictPolicy>;
}

type ReconcileOptions =
  | (ReconcileCommon & {
      mode: "init";
      config: { stacks: string[]; variables: Record<string, string> };
    })
  | (ReconcileCommon & { mode: "update"; config?: never });

interface PlannedSkill {
  name: string;
  status: "install" | "conflict" | "update" | "warning" | "up-to-date";
  warning?: string;
  installedVersion?: string;
  availableVersion?: string;
}

export async function reconcileSkills(options: ReconcileOptions): Promise<SkillOutcome[]> {
  const { mode, githubDirectory, stubRoot, context } = options;
  const skillsDirectory = join(githubDirectory, "skills");
  const stubsDirectory = join(stubRoot, "skills");
  const stubNames = (await readdir(stubsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (stubNames.length === 0) {
    throw new Error("No skill stubs are available to install.");
  }
  await assertSafeInstallPaths(githubDirectory, stubNames);

  const plan: PlannedSkill[] = [];
  for (const name of stubNames) {
    const target = join(skillsDirectory, name);
    const installed = await exists(target);

    if (mode === "init") {
      plan.push({ name, status: installed ? "conflict" : "install" });
      continue;
    }

    if (!installed) continue;

    const shipped = await readSkillVersion(join(stubsDirectory, name, "SKILL.md"));
    const shippedVersion = shipped === null ? null : parseSemver(shipped);
    if (shipped === null || shippedVersion === null) {
      throw new Error(`The shipped stub '${name}' has no valid semver version in its SKILL.md.`);
    }

    const installedVersionText = await readSkillVersion(join(target, "SKILL.md"));
    const installedVersion =
      installedVersionText === null ? null : parseSemver(installedVersionText);
    if (installedVersionText === null || installedVersion === null) {
      const description =
        installedVersionText === null
          ? "no version"
          : `non-semver version '${installedVersionText}'`;
      plan.push({
        name,
        status: "warning",
        warning: `Skipping '${name}': installed SKILL.md has ${description}.`,
      });
      continue;
    }

    if (compareSemver(shippedVersion, installedVersion) > 0) {
      plan.push({
        name,
        status: "update",
        installedVersion: installedVersionText,
        availableVersion: shipped,
      });
    } else {
      plan.push({ name, status: "up-to-date" });
    }
  }

  const decisions = new Map<string, ConflictPolicy>();
  for (const skill of plan) {
    if (skill.status !== "conflict" && skill.status !== "update") continue;
    if (options.conflictPolicy !== undefined) {
      decisions.set(skill.name, options.conflictPolicy);
    } else if (options.chooseConflict) {
      decisions.set(
        skill.name,
        await options.chooseConflict(skill.name, skill.installedVersion, skill.availableVersion),
      );
    } else if (skill.status === "conflict") {
      throw new Error(
        `Skill '${skill.name}' already exists; pass --on-conflict <overwrite|skip> to choose what to do in non-interactive runs.`,
      );
    } else {
      throw new Error(
        `Skill '${skill.name}' is outdated (${skill.installedVersion} -> ${skill.availableVersion}); pass --on-conflict <overwrite|skip> to choose what to do in non-interactive runs.`,
      );
    }
  }

  const outcomes: SkillOutcome[] = [];
  for (const skill of plan) {
    if (skill.status === "warning") {
      outcomes.push({ name: skill.name, status: "skipped", warning: skill.warning });
      continue;
    }
    if (skill.status === "up-to-date") {
      outcomes.push({ name: skill.name, status: "up-to-date" });
      continue;
    }
    if (
      (skill.status === "conflict" || skill.status === "update") &&
      decisions.get(skill.name) === "skip"
    ) {
      outcomes.push({ name: skill.name, status: "skipped" });
      continue;
    }

    const target = join(skillsDirectory, skill.name);
    if (skill.status === "conflict" || skill.status === "update") {
      await rm(target, { recursive: true, force: true });
    }
    await mkdir(skillsDirectory, { recursive: true });
    await installDirectory(join(stubsDirectory, skill.name), target, context);
    outcomes.push({
      name: skill.name,
      status: mode === "init" ? "installed" : "updated",
    });
  }

  if (options.mode === "init") {
    await writeFile(
      join(githubDirectory, "spindle.json"),
      `${JSON.stringify(options.config, null, 2)}\n`,
    );
  }

  return outcomes;
}
