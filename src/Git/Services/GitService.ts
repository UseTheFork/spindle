import { execFileSync, spawnSync } from "node:child_process";
import type {
  SpawnSyncOptionsWithBufferEncoding,
  SpawnSyncOptionsWithStringEncoding,
  SpawnSyncReturns,
} from "node:child_process";

import { Service } from "@/services/Service";

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

  private discoveryError(): Error {
    return new Error(
      "Unable to discover the Git working-tree root. Ensure Git is available and run Spindle inside a Git working tree.",
    );
  }
}
