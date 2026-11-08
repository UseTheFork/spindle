import { execFileSync } from "node:child_process";

export function discoverGitRoot(startingDirectory: string): string {
  let root: string;
  try {
    root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: startingDirectory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error(
      "Unable to discover the Git working-tree root. Ensure Git is available and run Spindle inside a Git working tree.",
    );
  }
  if (!root) {
    throw new Error(
      "Unable to discover the Git working-tree root. Ensure Git is available and run Spindle inside a Git working tree.",
    );
  }
  return root;
}
