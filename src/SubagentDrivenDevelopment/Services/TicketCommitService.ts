import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { Service } from "@spindle/Foundation/Service";
import { GitService } from "@spindle/Git/Services/GitService";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";

export class TicketCommitService extends Service {
  public async commit(reference: string, ticketId: string, message: string) {
    this.assertApplicationBooted();
    if (!message.trim() || message.includes("\0"))
      throw new Error("Provide a non-empty commit message without NUL characters.");

    const workspace = await this.app.make(FeatureWorkspaceService);
    const git = await this.app.make(GitService);
    return workspace.withLedgerTransaction(
      reference,
      async (feature, ledger, publish) => {
        if (ledger.pendingStart) throw new Error("Resume the pending start before committing.");
        let plan = ledger.pendingTicketCommit;
        if (plan && (plan.ticketId !== ticketId || plan.message !== message)) {
          throw new Error(
            "Resume the pending ticket commit with its original ticket and message. Run sdd next for the resume command.",
          );
        }

        const ticket = ledger.tickets.find(({ id }) => id === ticketId);
        if (!ticket) throw new Error(`Unknown ticket '${ticketId}'.`);
        if (!ticket.branch || !ticket.worktree || ticket.merged)
          throw new Error(`Ticket '${ticketId}' has no active worktree.`);
        const { branch, worktree } = ticket;
        if (plan && (plan.branch !== branch || plan.worktree !== worktree)) {
          throw new Error(
            "The recorded ticket worktree or branch no longer matches the pending commit.",
          );
        }
        if (ticket.tasks.length === 0 || ticket.tasks.some(({ state }) => state !== "Done")) {
          throw new Error(`All tasks on ticket '${ticketId}' must be Done before committing.`);
        }
        const committed = new Set(ticket.committedTaskIds ?? []);
        const taskIds = ticket.tasks.map(({ id }) => id).filter((id) => !committed.has(id));
        if (taskIds.length === 0)
          throw new Error(`Ticket '${ticketId}' has no new completed tasks to commit.`);
        if (
          plan &&
          (plan.taskIds.length !== taskIds.length ||
            plan.taskIds.some((id) => !taskIds.includes(id)))
        ) {
          throw new Error("The completed tasks no longer match the pending ticket commit.");
        }
        await git.requireWorktreeBranch(worktree, branch);
        const operationPaths = git.gitPaths(worktree, [
          "MERGE_HEAD",
          "CHERRY_PICK_HEAD",
          "REVERT_HEAD",
          "rebase-apply",
          "rebase-merge",
          "sequencer",
        ]);
        if (operationPaths.some((path) => existsSync(resolve(worktree, path)))) {
          throw new Error("Finish the Git operation in the ticket worktree before committing.");
        }
        const head = this.git(git, worktree, ["rev-parse", "--verify", "HEAD"]).trim();
        if (!plan) {
          const lastCommit = ticket.workRoundCommits.at(-1);
          if (lastCommit && head !== lastCommit) {
            throw new Error(
              "The ticket branch no longer matches its last recorded work-round commit.",
            );
          }
          this.git(git, worktree, ["add", "-A", "--", "."]);
          const tree = this.git(git, worktree, ["write-tree"]).trim();
          const commit = this.git(
            git,
            worktree,
            ["commit-tree", tree, "-p", head, "-F", "-"],
            message,
          ).trim();
          plan = { ticketId, branch, worktree, base: head, commit, taskIds, message };
          await publish({ ...ledger, pendingTicketCommit: plan });
        }

        const parents = this.git(git, worktree, [
          "rev-list",
          "--parents",
          "-n",
          "1",
          plan.commit,
        ]).trim();
        if (parents !== `${plan.commit} ${plan.base}`) {
          throw new Error("The journaled ticket commit does not have the recorded parent.");
        }
        if (head === plan.base) {
          const tree = this.git(git, worktree, ["rev-parse", `${plan.commit}^{tree}`]).trim();
          if (this.git(git, worktree, ["write-tree"]).trim() !== tree) {
            throw new Error("The ticket index changed since the pending commit was prepared.");
          }
          this.git(git, worktree, [
            "update-ref",
            "-m",
            "spindle ticket commit",
            `refs/heads/${branch}`,
            plan.commit,
            plan.base,
          ]);
        } else if (head !== plan.commit) {
          throw new Error(
            "The ticket branch moved away from the pending commit; no changes were discarded.",
          );
        }

        ticket.workRoundCommits.push(plan.commit);
        ticket.committedTaskIds = [...committed, ...plan.taskIds];
        delete ledger.pendingTicketCommit;
        await publish(ledger);
        return { feature: feature.name, ticket: ticketId, commit: plan.commit };
      },
      { resumeTicketCommit: true },
    );
  }

  private git(git: GitService, cwd: string, args: string[], input?: string): string {
    const result = git.run(args, { cwd, encoding: "utf8", input });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    return result.stdout;
  }
}
