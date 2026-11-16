import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

import { Application } from "@spindle/Foundation/Application";
import { GitService } from "@spindle/Git/Services/GitService";

import { fixture, serviceFixture } from "@test/Helpers/SubagentDrivenDevelopment/helpers";

test("Git is bound early as an application-owned singleton without registration-time discovery", async () => {
  const discovery = vi.spyOn(GitService.prototype, "discoverRoot");
  try {
    const app = new Application({ basePath: "/not-a-checkout" });
    expect(app.bound(GitService)).toBe(true);
    const git = await app.make(GitService);
    expect(await app.make(GitService)).toBe(git);
    expect(git.isBooted).toBe(true);
    expect(discovery).not.toHaveBeenCalled();
    expect(await new Application({ basePath: "/another-checkout" }).make(GitService)).not.toBe(git);
  } finally {
    discovery.mockRestore();
  }
});

test("repository discovery uses the explicit starting directory and preserves its error", async () => {
  const { repo, directory } = (() => {
    const workspace = fixture();
    return { ...workspace, directory: join(workspace.repo, "..") };
  })();
  const git = await new Application({ basePath: repo }).make(GitService);
  const nested = join(repo, "nested");
  mkdirSync(nested);
  expect(git.discoverRoot(nested)).toBe(repo);
  expect(() => git.discoverRoot(join(directory, "missing"))).toThrow(
    "Unable to discover the Git working-tree root.",
  );
});

test("Git execution preserves binary bytes, process statuses, and text output", async () => {
  const { repo, app } = await serviceFixture();
  const git = await app.make(GitService);
  const bytes = Buffer.from([0, 255, 10, 13, 128, 65]);
  const stored = git.run(["hash-object", "-w", "--stdin"], {
    cwd: repo,
    encoding: "utf8",
    input: bytes,
  });
  expect(stored.status).toBe(0);
  const retrieved = git.run(["cat-file", "blob", stored.stdout.trim()], {
    cwd: repo,
    encoding: "buffer",
  });
  expect(retrieved.status).toBe(0);
  expect(retrieved.stdout).toEqual(bytes);
  const failure = git.run(["rev-parse", "--verify", "missing-reference"], {
    cwd: repo,
    encoding: "utf8",
  });
  expect(failure.status).toBe(128);
  expect(typeof failure.stderr).toBe("string");
  expect(failure.stderr).toContain("fatal:");
});

test("Git path lookup batches names in order and reports failures", async () => {
  const { repo } = fixture();
  const git = await new Application({ basePath: repo }).make(GitService);
  const run = vi.spyOn(git, "run");

  try {
    const names = ["MERGE_HEAD", "hooks/pre-commit"];
    const paths = git.gitPaths(repo, names);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      ["rev-parse", "--git-path", names[0], "--git-path", names[1]],
      { cwd: repo, encoding: "utf8" },
    );
    expect(paths).toEqual(
      names.map((name) =>
        execFileSync("git", ["rev-parse", "--git-path", name], {
          cwd: repo,
          encoding: "utf8",
        }).trim(),
      ),
    );
  } finally {
    run.mockRestore();
  }

  const emptyRun = vi.spyOn(git, "run");
  try {
    expect(git.gitPaths(repo, [])).toEqual([]);
    expect(emptyRun).not.toHaveBeenCalled();
  } finally {
    emptyRun.mockRestore();
  }

  expect(() => git.gitPaths(join(repo, ".."), ["MERGE_HEAD"])).toThrow(
    /git rev-parse --git-path failed/,
  );
});
