import { execFileSync, spawnSync } from "node:child_process";
import type {
  SpawnSyncOptionsWithBufferEncoding,
  SpawnSyncOptionsWithStringEncoding,
  SpawnSyncReturns,
} from "node:child_process";
import { realpath } from "node:fs/promises";

import { Service } from "@spindle/Foundation/Service";

export class GitService extends Service {
  public discoverRoot(startingDirectory: string): string {
    let root: string;
    try {
      root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd: startingDirectory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      throw this.discoveryError();
    }
    if (!root) throw this.discoveryError();
    return root;
  }

  public run(args: string[], options: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string>;
  public run(args: string[], options: SpawnSyncOptionsWithBufferEncoding): SpawnSyncReturns<Buffer>;
  public run(
    args: string[],
    options: SpawnSyncOptionsWithStringEncoding | SpawnSyncOptionsWithBufferEncoding,
  ): SpawnSyncReturns<string | Buffer> {
    return spawnSync("git", args, options);
  }

  public gitPaths(
    workspace: string,
    names: readonly string[],
    options: { env?: NodeJS.ProcessEnv } = {},
  ): string[] {
    if (names.length === 0) return [];

    const args = ["rev-parse", ...names.flatMap((name) => ["--git-path", name])];
    const result = this.run(args, { cwd: workspace, encoding: "utf8", ...options });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`git rev-parse --git-path failed: ${result.stderr.trim()}`);
    }

    const paths = result.stdout.split(/\r?\n/);
    if (paths.at(-1) === "") paths.pop();
    if (paths.length !== names.length) {
      throw new Error(
        `git rev-parse --git-path returned ${paths.length} paths for ${names.length} names.`,
      );
    }
    return paths;
  }

  public changedPaths(worktree: string, includeUntracked = true): string[] {
    const result = this.run(
      [
        "--no-optional-locks",
        "status",
        "--porcelain=v1",
        "-z",
        "--no-renames",
        includeUntracked ? "--untracked-files=all" : "--untracked-files=no",
        "--ignore-submodules=none",
      ],
      { cwd: worktree, encoding: "buffer" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`git status failed: ${result.stderr.toString("utf8").trim()}`);
    }

    const output = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(result.stdout);
    const entries = output.split("\0");
    entries.pop();
    return [...new Set(entries.map((entry) => entry.slice(3)))].sort();
  }

  public async requireWorktreeBranch(path: string, branch: string): Promise<void> {
    const worktree = await realpath(path);
    if (worktree !== path || this.discoverRoot(worktree) !== worktree) {
      throw new Error(`The recorded ticket worktree is not a Git worktree root: '${path}'.`);
    }
    const head = this.run(["symbolic-ref", "HEAD"], { cwd: worktree, encoding: "utf8" });
    if (head.error) throw head.error;
    if (head.status !== 0 || head.stdout.trim() !== `refs/heads/${branch}`) {
      throw new Error(`The recorded ticket branch is not checked out at '${worktree}'.`);
    }
  }

  private discoveryError(): Error {
    return new Error(
      "Unable to discover the Git working-tree root. Ensure Git is available and run Spindle inside a Git working tree.",
    );
  }
}
