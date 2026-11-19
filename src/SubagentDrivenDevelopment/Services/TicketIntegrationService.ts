import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";

import { Service } from "@spindle/Foundation/Service";
import { GitService } from "@spindle/Git/Services/GitService";
import type { Feature } from "@spindle/SubagentDrivenDevelopment/Models/Feature";
import type { FeatureLedger } from "@spindle/SubagentDrivenDevelopment/Models/FeatureLedger";
import type { Finding } from "@spindle/SubagentDrivenDevelopment/Models/Finding";
import type { Ticket } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import type { TicketIntegrationJournal } from "@spindle/SubagentDrivenDevelopment/Models/TicketIntegrationJournal";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { TicketReviewService } from "@spindle/SubagentDrivenDevelopment/Services/TicketReviewService";

export class TicketIntegrationService extends Service {
  public async integrate(
    reference: string,
    ticketId: string,
  ): Promise<
    | { kind: "conflict"; conflict: Extract<Finding, { type: "conflict" }> }
    | { kind: "merged"; feature: string; ticket: string; state: "Merged"; commit: string }
  > {
    this.assertApplicationBooted();
    const workspace = await this.app.make(FeatureWorkspaceService);
    const git = await this.app.make(GitService);
    return workspace.withLedgerTransaction(
      reference,
      async (feature, ledger, publish) => {
        if (ledger.pendingStart) throw new Error("Resume the pending start before integrating.");
        let journal = ledger.pendingIntegration;
        if (journal && journal.ticketId !== ticketId) {
          throw new Error(
            `Integration of '${journal.ticketId}' is pending. Run sdd next for the resume command.`,
          );
        }
        const ticket = ledger.tickets.find(({ id }) => id === ticketId);
        if (!ticket) throw new Error(`Unknown ticket '${ticketId}'.`);
        if (ticket.merged) throw new Error(`Ticket '${ticketId}' is already integrated.`);
        if (!journal) {
          journal = await this.prepare(feature, ticket, git);
          ledger.pendingIntegration = journal;
          await publish(ledger);
        }
        this.assertJournalMatches(feature.featureBranch, feature.featureWorktree, ticket, journal);
        const result = await this.complete(git, journal, ledger, publish);
        if (result.kind === "conflict") return result;
        const mergeCommit = result.commit;
        journal = { ...journal, phase: "merged", mergeCommit };
        await this.assertTicketCommit(git, journal);
        await this.assertFeatureWorktree(git, journal);
        await this.fastForwardFeature(git, journal);
        await this.removeTicketWorktree(git, journal);
        await this.removeTicketBranch(git, journal);
        ticket.merged = true;
        delete ticket.branch;
        delete ticket.worktree;
        delete ledger.pendingIntegration;
        await publish(ledger);
        return {
          kind: "merged",
          feature: feature.name,
          ticket: ticketId,
          state: "Merged" as const,
          commit: mergeCommit,
        };
      },
      { resumeIntegration: true },
    );
  }

  private async prepare(
    feature: Feature,
    ticket: Pick<
      Ticket,
      "id" | "branch" | "worktree" | "tasks" | "workRoundCommits" | "committedTaskIds" | "merged"
    >,
    git: GitService,
  ): Promise<TicketIntegrationJournal> {
    if (!feature.featureBranch || !feature.featureWorktree) {
      throw new Error(`Feature '${feature.name}' has no active worktree.`);
    }
    if (!ticket.branch || !ticket.worktree || ticket.tasks.length === 0) {
      throw new Error(`Ticket '${ticket.id}' has no active worktree or completed tasks.`);
    }
    const status = await (await this.app.make(TicketReviewService)).status(feature, ticket);
    if ("blocker" in status || status.state !== "Accepted") {
      throw new Error(
        `Ticket '${ticket.id}' is not accepted: ${"blocker" in status ? status.blocker : status.state}.`,
      );
    }
    const featureBranch = feature.featureBranch;
    const featureWorktree = feature.featureWorktree;
    const ticketBranch = ticket.branch;
    const ticketWorktree = ticket.worktree;
    await git.requireWorktreeBranch(featureWorktree, featureBranch);
    await git.requireWorktreeBranch(ticketWorktree, ticketBranch);
    this.assertClean(git, featureWorktree, "feature");
    this.assertClean(git, ticketWorktree, "ticket");
    this.assertNoGitOperation(git, featureWorktree);
    this.assertNoGitOperation(git, ticketWorktree);
    const featureCommit = this.git(git, featureWorktree, ["rev-parse", "--verify", "HEAD"]);
    const ticketCommit = this.git(git, ticketWorktree, ["rev-parse", "--verify", "HEAD"]);
    if (ticket.workRoundCommits.at(-1) !== ticketCommit) {
      throw new Error(`Ticket '${ticket.id}' is not at its latest recorded work-round commit.`);
    }
    return {
      ticketId: ticket.id,
      featureBranch,
      featureWorktree,
      ticketBranch,
      ticketWorktree,
      featureCommit,
      ticketCommit,
      phase: "merging",
    };
  }

  private async complete(
    git: GitService,
    journal: TicketIntegrationJournal,
    ledger: FeatureLedger,
    publish: (ledger: FeatureLedger) => Promise<void>,
  ): Promise<
    | { kind: "conflict"; conflict: Extract<Finding, { type: "conflict" }> }
    | { kind: "ready"; commit: string }
  > {
    let active = journal;
    if (active.phase === "merging") {
      await git.requireWorktreeBranch(active.ticketWorktree, active.ticketBranch);
      if (
        this.branchCommit(git, active.featureWorktree, active.featureBranch) !==
        active.featureCommit
      ) {
        throw new Error("The feature branch moved away from the journaled integration commit.");
      }
      this.assertNoGitOperation(git, active.ticketWorktree, ["MERGE_HEAD"]);
      const head = this.git(git, active.ticketWorktree, ["rev-parse", "--verify", "HEAD"]);
      const mergeHeadPath = git.gitPaths(active.ticketWorktree, ["MERGE_HEAD"])[0];
      if (await this.exists(mergeHeadPath)) {
        const mergeHead = this.git(git, active.ticketWorktree, [
          "rev-parse",
          "--verify",
          "MERGE_HEAD",
        ]);
        if (mergeHead !== active.featureCommit) {
          throw new Error("The in-progress merge does not match the recorded feature commit.");
        }
        const paths = this.unmergedPaths(git, active.ticketWorktree);
        if (paths.length > 0) return this.recordConflict(active, paths, ledger, publish);
        this.git(git, active.ticketWorktree, ["-c", "core.editor=true", "merge", "--continue"]);
      } else if (head === active.ticketCommit) {
        if (
          this.isAncestor(git, active.ticketWorktree, active.featureCommit, active.ticketCommit)
        ) {
          active = { ...active, phase: "merged", mergeCommit: active.ticketCommit };
        } else {
          const merge = git.run(["merge", "--no-ff", "--no-edit", active.featureCommit], {
            cwd: active.ticketWorktree,
            encoding: "utf8",
          });
          if (merge.error) throw merge.error;
          if (merge.status !== 0) {
            const paths = this.unmergedPaths(git, active.ticketWorktree);
            if (paths.length > 0) return this.recordConflict(active, paths, ledger, publish);
            throw new Error(`git merge failed: ${merge.stderr.trim()}`);
          }
        }
      }

      if (active.phase === "merging") {
        const mergeCommit = this.git(git, active.ticketWorktree, ["rev-parse", "--verify", "HEAD"]);
        const parents = this.git(git, active.ticketWorktree, [
          "rev-list",
          "--parents",
          "-n",
          "1",
          mergeCommit,
        ])
          .trim()
          .split(/\s+/);
        if (
          parents.length !== 3 ||
          parents[1] !== active.ticketCommit ||
          parents[2] !== active.featureCommit
        ) {
          throw new Error(
            "The ticket branch did not produce the expected integration merge commit.",
          );
        }
        active = { ...active, phase: "merged", mergeCommit };
      }
      ledger.pendingIntegration = active;
      await publish(ledger);
    }
    if (!active.mergeCommit)
      throw new Error("The pending integration has no recorded merge commit.");
    const mergeCommit = active.mergeCommit;
    return { kind: "ready", commit: mergeCommit };
  }

  private async recordConflict(
    journal: TicketIntegrationJournal,
    paths: string[],
    ledger: FeatureLedger,
    publish: (ledger: FeatureLedger) => Promise<void>,
  ): Promise<{ kind: "conflict"; conflict: Extract<Finding, { type: "conflict" }> }> {
    if (paths.length === 0)
      throw new Error("The merge is conflicted but Git returned no conflicted paths.");
    const finding: Finding = {
      id: `F-${randomUUID()}`,
      title: "Integration conflict",
      type: "conflict",
      ticketId: journal.ticketId,
      conflictedPaths: paths,
      sourceCommit: journal.featureCommit,
      targetCommit: journal.ticketCommit,
      decision: "open",
    };
    ledger.findings.push(finding);
    delete ledger.pendingIntegration;
    await publish(ledger);
    if (finding.type !== "conflict") throw new Error("Expected an integration conflict finding.");
    return { kind: "conflict", conflict: finding };
  }

  private assertJournalMatches(
    featureBranch: string | undefined,
    featureWorktree: string | undefined,
    ticket: Pick<Ticket, "branch" | "worktree">,
    journal: TicketIntegrationJournal,
  ): void {
    if (
      featureBranch !== journal.featureBranch ||
      featureWorktree !== journal.featureWorktree ||
      ticket.branch !== journal.ticketBranch ||
      ticket.worktree !== journal.ticketWorktree
    ) {
      throw new Error(
        "The recorded branches or worktrees no longer match the pending integration.",
      );
    }
  }

  private async assertFeatureWorktree(
    git: GitService,
    journal: TicketIntegrationJournal,
  ): Promise<void> {
    await git.requireWorktreeBranch(journal.featureWorktree, journal.featureBranch);
    this.assertNoGitOperation(git, journal.featureWorktree);
    this.assertClean(git, journal.featureWorktree, "feature");
    const head = this.git(git, journal.featureWorktree, ["rev-parse", "--verify", "HEAD"]);
    if (head !== journal.featureCommit && head !== journal.mergeCommit) {
      throw new Error("The feature branch moved away from the pending integration.");
    }
  }

  private async fastForwardFeature(
    git: GitService,
    journal: TicketIntegrationJournal,
  ): Promise<void> {
    if (!journal.mergeCommit) throw new Error("The pending integration has no merge commit.");
    const head = this.git(git, journal.featureWorktree, ["rev-parse", "--verify", "HEAD"]);
    if (head !== journal.mergeCommit) {
      this.git(git, journal.featureWorktree, ["merge", "--ff-only", journal.mergeCommit]);
    }
  }

  private async removeTicketWorktree(
    git: GitService,
    journal: TicketIntegrationJournal,
  ): Promise<void> {
    if (!(await this.exists(journal.ticketWorktree))) return;
    await git.requireWorktreeBranch(journal.ticketWorktree, journal.ticketBranch);
    await this.assertTicketCommit(git, journal);
    this.assertClean(git, journal.ticketWorktree, "ticket");
    this.assertNoGitOperation(git, journal.ticketWorktree);
    this.git(git, journal.featureWorktree, ["worktree", "remove", journal.ticketWorktree]);
  }

  private async assertTicketCommit(
    git: GitService,
    journal: TicketIntegrationJournal,
  ): Promise<void> {
    if (!journal.mergeCommit) throw new Error("The pending integration has no merge commit.");
    const branch = this.branchCommit(git, journal.featureWorktree, journal.ticketBranch);
    if (branch !== undefined && branch !== journal.mergeCommit) {
      throw new Error("The ticket branch moved away from the pending integration commit.");
    }
    if (await this.exists(journal.ticketWorktree)) {
      const head = this.git(git, journal.ticketWorktree, ["rev-parse", "--verify", "HEAD"]);
      if (head !== journal.mergeCommit) {
        throw new Error("The ticket worktree moved away from the pending integration commit.");
      }
    }
  }

  private async removeTicketBranch(
    git: GitService,
    journal: TicketIntegrationJournal,
  ): Promise<void> {
    const current = this.branchCommit(git, journal.featureWorktree, journal.ticketBranch);
    if (!current) return;
    if (current !== journal.mergeCommit) {
      throw new Error("The ticket branch moved away from the pending integration commit.");
    }
    this.git(git, journal.featureWorktree, ["branch", "-d", "--", journal.ticketBranch]);
  }

  private assertClean(git: GitService, worktree: string, name: string): void {
    const paths = git.changedPaths(worktree);
    if (paths.length > 0) {
      throw new Error(`The ${name} worktree has outstanding changes: ${JSON.stringify(paths)}.`);
    }
  }

  private assertNoGitOperation(
    git: GitService,
    worktree: string,
    allowed: readonly string[] = [],
  ): void {
    const names = [
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
      "rebase-apply",
      "rebase-merge",
      "sequencer",
    ].filter((name) => !allowed.includes(name));
    const paths = git.gitPaths(worktree, names);
    if (paths.some((path) => existsSync(resolve(worktree, path)))) {
      throw new Error("Finish the Git operation in the worktree before integrating.");
    }
  }

  private unmergedPaths(git: GitService, worktree: string): string[] {
    const result = git.run(["diff", "--name-only", "--diff-filter=U", "-z"], {
      cwd: worktree,
      encoding: "buffer",
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`git diff failed: ${result.stderr.toString("utf8").trim()}`);
    return new TextDecoder("utf-8", { fatal: true })
      .decode(result.stdout)
      .split("\0")
      .filter(Boolean);
  }

  private isAncestor(git: GitService, cwd: string, ancestor: string, commit: string): boolean {
    const result = git.run(["merge-base", "--is-ancestor", ancestor, commit], {
      cwd,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status === 0) return true;
    if (result.status === 1) return false;
    throw new Error(`git merge-base failed: ${result.stderr.trim()}`);
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

  private git(git: GitService, cwd: string, args: string[]): string {
    const result = git.run(args, { cwd, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    return result.stdout.replace(/\r?\n$/, "");
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
}
