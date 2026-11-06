import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync, statSync, type Stats } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

import { App, Service } from "../../app.js";
import { isPathInside } from "../../utilities/is-path-inside.js";

export type WorkspaceRequest = {
  workspacePath: string;
  reportsDirectory: string;
  ticket: string;
  round?: string;
};

export type ReportDestination = {
  relative: string;
  absolute: string;
};

export type WorkspaceResolution = {
  workspace: string;
  reportsDirectory: string;
  reports: {
    implementation: ReportDestination;
    codeReview: ReportDestination;
    taskReview: ReportDestination;
    scopedReview?: ReportDestination;
    finalReview: ReportDestination;
    finalFixReview: ReportDestination;
  };
};

export class SddWorkspaceCommand extends Service {
  constructor(app: App) {
    super(app);
  }

  run({
    workspacePath,
    reportsDirectory: relativeReportsDirectory,
    ticket,
    round,
  }: WorkspaceRequest): WorkspaceResolution {
    if (!isAbsolute(workspacePath)) {
      throw new Error("Workspace must be the absolute checkout root.");
    }

    const root = realpathSync(
      this.#git(workspacePath, ["rev-parse", "--show-toplevel"]).stdout.trim(),
    );
    if (realpathSync(workspacePath) !== root) {
      throw new Error("Workspace must be the absolute checkout root.");
    }
    this.#git(root, ["rev-parse", "--verify", "HEAD^{commit}"]);

    const segments = relativeReportsDirectory.split("/");
    if (
      !relativeReportsDirectory.startsWith(".scratch/") ||
      isAbsolute(relativeReportsDirectory) ||
      relativeReportsDirectory.includes("\\") ||
      segments.some(
        (part) => !part || part === "." || part === ".." || part.toLowerCase() === ".git",
      )
    ) {
      throw new Error("Reports directory must be inside .scratch without path traversal.");
    }

    const directory = join(root, ...segments);
    let ancestor = directory;
    while (!this.#lstatIfPresent(ancestor)) ancestor = dirname(ancestor);
    if (!statSync(ancestor).isDirectory() || !isPathInside(root, realpathSync(ancestor))) {
      throw new Error("Reports directory must remain inside this checkout.");
    }
    if (this.#checkIgnored(root, `${relativeReportsDirectory}/sdd-report.md`)) {
      throw new Error("Reports directory is ignored.");
    }

    if (!/^(0[1-9]|[1-9][0-9]*)$/.test(ticket)) {
      throw new Error("Ticket must be a positive numeric identifier, for example 03.");
    }
    if (round !== undefined && !/^[1-9][0-9]*$/.test(round)) {
      throw new Error("Round must be a positive integer.");
    }

    const report = (name: string): ReportDestination => ({
      relative: `${relativeReportsDirectory}/${name}.md`,
      absolute: join(directory, `${name}.md`),
    });
    const reports: WorkspaceResolution["reports"] = {
      implementation: report(`${ticket}-implementation`),
      codeReview: report(`${ticket}-code-review`),
      taskReview: report(`${ticket}-task-review`),
      ...(round ? { scopedReview: report(`${ticket}-round-${round}-review`) } : {}),
      finalReview: report("final-review"),
      finalFixReview: report("final-fix-review"),
    };

    for (const destination of Object.values(reports)) {
      if (this.#checkIgnored(root, destination.relative)) {
        throw new Error(`Report destination is ignored: ${destination.relative}`);
      }
      const target = this.#lstatIfPresent(destination.absolute);
      if (target && !target.isFile()) {
        throw new Error(`Report destination is not a regular file: ${destination.relative}`);
      }
    }

    return {
      workspace: root,
      reportsDirectory: directory,
      reports,
    };
  }

  #git(cwd: string, args: string[], accepted: number[] = [0]) {
    const result = spawnSync("git", ["--no-pager", "-c", "color.ui=false", ...args], {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    if (result.error) throw result.error;
    if (!accepted.includes(result.status ?? -1)) {
      throw new Error(`git ${args[0]} failed (${result.status}): ${result.stderr.trim()}`);
    }
    return result;
  }

  #checkIgnored(root: string, destination: string): boolean {
    return (
      this.#git(root, ["check-ignore", "--quiet", "--no-index", "--", destination], [0, 1])
        .status === 0
    );
  }

  #lstatIfPresent(path: string): Stats | undefined {
    try {
      return lstatSync(path);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }
}
