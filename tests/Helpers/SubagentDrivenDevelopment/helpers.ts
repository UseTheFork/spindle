import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { LoadProjectSettings } from "@spindle/Foundation/Bootstrap/LoadProjectSettings";
import { applicationFixture } from "@test/Helpers/ApplicationFixture";
import { makeTempDirSync, repoRoot } from "@test/Helpers/TemporaryDirectories";
import { vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

export function fixture() {
  const directory = makeTempDirSync("spindle-sdd-workflow-test-");
  const repo = join(directory, "checkout");
  mkdirSync(repo);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(repo, ".github"), { recursive: true });
  mkdirSync(join(repo, ".spindle"), { recursive: true });
  writeFileSync(
    join(repo, ".spindle", "config.json"),
    `${JSON.stringify({ stacks: ["python"], spindle_package_manager: "pnpm" }, null, 2)}\n`,
  );
  writeFileSync(join(repo, "tracked.txt"), "base\n");
  git("add", ".");
  git("commit", "-qm", "base");
  return { repo, git };
}

export async function serviceFixture() {
  const workspace = fixture();
  const app = applicationFixture(workspace.repo, join(repoRoot, "assets/Blueprints"));
  await new LoadProjectSettings().bootstrap(app);
  await app.boot();
  return { ...workspace, app };
}
