import { realpathSync } from "node:fs";
import { join, relative } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitService } from "@/Git/Services/GitService";
import { lstatIfPresent, isPathInside } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";

export class PathSafety extends Service {
  public constructor(
    app: Application,
    private readonly git: GitService,
  ) {
    super(app);
  }

  public assertTicketPath(workspace: string, path: string): void {
    const ticketsDirectory = join(workspace, "tickets");
    const directoryEntry = lstatIfPresent(ticketsDirectory);
    if (!directoryEntry?.isDirectory() || directoryEntry.isSymbolicLink()) {
      throw new Error("Feature tickets path must be a real directory.");
    }
    if (
      !isPathInside(ticketsDirectory, path) ||
      !/^T-\d{4,}\.md$/.test(path.slice(ticketsDirectory.length + 1))
    ) {
      throw new Error("Ticket path must be a numbered Markdown file inside tickets/.");
    }
    const entry = lstatIfPresent(path);
    if (entry && !entry.isFile()) throw new Error(`Ticket path must be a regular file: ${path}.`);
    if (entry && !isPathInside(ticketsDirectory, realpathSync(path))) {
      throw new Error("Ticket file must remain inside the feature tickets directory.");
    }
    const root = realpathSync(this.app.workspaceRoot);
    const relativePath = relative(root, path);
    if (this.isIgnored(root, relativePath))
      throw new Error(`Ticket path is ignored: ${relativePath}`);
  }

  public isIgnored(root: string, relativePath: string): boolean {
    const result = this.git.run(
      [
        "--no-pager",
        "-c",
        "color.ui=false",
        "check-ignore",
        "--quiet",
        "--no-index",
        "--",
        relativePath,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`git check-ignore failed: ${result.stderr.trim()}`);
    }
    return result.status === 0;
  }

  public assertReadyReadable(workspace: string): void {
    if (lstatIfPresent(join(workspace, ".sdd-write-recovery.json"))) {
      throw new Error("Pending ticket recovery journal; run a mutating ticket command to recover.");
    }
    if (lstatIfPresent(join(workspace, ".sdd-tickets.lock"))) {
      throw new Error("Ticket updates are in progress; retry ready after the lock is released.");
    }
  }
}
