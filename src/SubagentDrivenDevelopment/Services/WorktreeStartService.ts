import { lstat, mkdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { Service } from "@spindle/Foundation/Service";
import { GitService } from "@spindle/Git/Services/GitService";
import { ProjectSettingsService } from "@spindle/Settings/Services/ProjectSettingsService";
import type { StartJournal } from "@spindle/SubagentDrivenDevelopment/Models/StartJournal";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { WorkGraphService } from "@spindle/SubagentDrivenDevelopment/Services/WorkGraphService";

export class WorktreeStartService extends Service {
  public async start(reference: string, ticketId?: string) {
    this.assertApplicationBooted();
    const workspace = await this.app.make(FeatureWorkspaceService);
    const git = await this.app.make(GitService);
    const graph = await this.app.make(WorkGraphService);
    const settings = ProjectSettingsService.current(this.app);
    const config = settings.status === "valid" ? settings.data.sdd : undefined;
    const original = await realpath(this.app.workspaceRoot);

    return workspace.withLedgerTransaction(reference, async (feature, ledger, publish) => {
      const branch = `sdd/${feature.name}/${ticketId ?? "feature"}`;
      const ticket =
        ticketId === undefined ? undefined : ledger.tickets.find(({ id }) => id === ticketId);
      if (ticketId !== undefined && !ticket) throw new Error(`Unknown ticket '${ticketId}'.`);
      let plan = ledger.pendingStart;
      if (
        plan &&
        (plan.branch !== branch ||
          (ticketId === undefined
            ? plan.kind !== "feature"
            : plan.kind !== "ticket" || plan.ticketId !== ticketId))
      ) {
        throw new Error(
          `A start is already pending for '${plan.branch}'. Run sdd next for the resume command.`,
        );
      }

      if (!plan) {
        if (ticket) {
          if (!ledger.featureBranch || !ledger.featureWorktree)
            throw new Error("Start the feature first.");
          if (ticket.branch || ticket.worktree)
            throw new Error(`Ticket '${ticket.id}' has already started.`);
          const readiness = graph
            .readiness(feature)
            .tickets.find(({ ticketId: id }) => id === ticket.id);
          if (!readiness?.ready)
            throw new Error(
              `Ticket '${ticket.id}' is not ready: ${JSON.stringify(readiness?.blockers)}`,
            );
        } else if (ledger.originalBranch || ledger.featureBranch || ledger.featureWorktree) {
          throw new Error(`Feature '${feature.name}' has already started.`);
        }
        if (!config)
          throw new Error(
            "Set sdd.worktree_directory in .spindle/config.json before starting work.",
          );
        const worktree = await this.canonicalPath(
          resolve(original, config.worktree_directory, feature.name, ticketId ?? "feature"),
        );
        this.assertExternal(original, worktree);
        const sourceRef = ticket
          ? `refs/heads/${ledger.featureBranch}`
          : this.run(git, original, ["symbolic-ref", "HEAD"]);
        if (!sourceRef.startsWith("refs/heads/")) {
          throw new Error("The start source must be a local branch.");
        }
        const commit = this.run(git, original, ["rev-parse", "--verify", `${sourceRef}^{commit}`]);
        if (this.branchCommit(git, original, branch) || (await this.exists(worktree))) {
          throw new Error(`Start destination already exists: '${branch}' or '${worktree}'.`);
        }
        plan = ticket
          ? { kind: "ticket", ticketId: ticket.id, branch, worktree, commit }
          : {
              kind: "feature",
              originalBranch: sourceRef.slice("refs/heads/".length),
              branch,
              worktree,
              commit,
            };
        await publish({ ...ledger, pendingStart: plan });
      }

      try {
        await this.ensureWorktree(git, original, plan);
      } catch (error) {
        throw new Error(
          `Could not complete start for '${branch}': ${error instanceof Error ? error.message : String(error)}. Start remains journaled.`,
          { cause: error },
        );
      }
      if (plan.kind === "feature") {
        ledger.originalBranch = plan.originalBranch;
        ledger.featureBranch = plan.branch;
        ledger.featureWorktree = plan.worktree;
      } else if (ticket) {
        ticket.branch = plan.branch;
        ticket.worktree = plan.worktree;
      }
      delete ledger.pendingStart;
      await publish(ledger);
      return {
        feature: feature.name,
        branch: plan.branch,
        worktree: plan.worktree,
        ...(ticket ? { ticket: ticket.id, setupCommands: config?.setup_command ?? [] } : {}),
      };
    });
  }

  private async ensureWorktree(
    git: GitService,
    original: string,
    plan: StartJournal,
  ): Promise<void> {
    this.assertExternal(original, plan.worktree);
    if ((await this.canonicalPath(plan.worktree)) !== plan.worktree) {
      throw new Error(`Worktree path no longer resolves to '${plan.worktree}'`);
    }
    const ref = `refs/heads/${plan.branch}`;
    const entries = this.run(git, original, ["worktree", "list", "--porcelain", "-z"])
      .split("\0\0")
      .map((entry) => entry.split("\0"));
    const registered = entries.find(
      (entry) => entry.includes(`branch ${ref}`) || entry.includes(`worktree ${plan.worktree}`),
    );
    const current = this.branchCommit(git, original, plan.branch);
    if (current && current !== plan.commit)
      throw new Error(`Branch '${plan.branch}' moved from the recorded start commit`);
    if (!registered) {
      if (await this.exists(plan.worktree))
        throw new Error(`Unregistered worktree destination exists at '${plan.worktree}'`);
      await mkdir(dirname(plan.worktree), { recursive: true });
      this.run(git, original, [
        "worktree",
        "add",
        ...(current ? [] : ["-b", plan.branch]),
        "--",
        plan.worktree,
        current ? plan.branch : plan.commit,
      ]);
    } else if (
      !registered.includes(`branch ${ref}`) ||
      !registered.includes(`worktree ${plan.worktree}`)
    ) {
      throw new Error(
        `Git has a different worktree registered for '${plan.branch}' or '${plan.worktree}'`,
      );
    }
    if (
      this.run(git, plan.worktree, ["rev-parse", "--show-toplevel"]) !== plan.worktree ||
      this.run(git, plan.worktree, ["symbolic-ref", "HEAD"]) !== ref ||
      this.run(git, plan.worktree, ["rev-parse", "--verify", "HEAD"]) !== plan.commit
    ) {
      throw new Error(`Worktree '${plan.worktree}' does not match the recorded start`);
    }
  }

  private assertExternal(original: string, path: string): void {
    const offset = relative(original, path);
    if (
      !isAbsolute(path) ||
      (offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset))
    ) {
      throw new Error("SDD worktrees must be outside the original checkout.");
    }
  }

  private async canonicalPath(path: string): Promise<string> {
    if (await this.exists(path)) return realpath(path);
    return join(await this.canonicalPath(dirname(path)), basename(path));
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await lstat(path);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
      throw error;
    }
  }

  private branchCommit(git: GitService, cwd: string, branch: string): string | undefined {
    const result = git.run(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status === 1) return undefined;
    if (result.status !== 0)
      throw new Error(`Cannot inspect branch '${branch}': ${result.stderr.trim()}`);
    return result.stdout.trim();
  }

  private run(git: GitService, cwd: string, args: string[]): string {
    const result = git.run(args, { cwd, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    return result.stdout.replace(/\r?\n$/, "");
  }
}
