import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { Service } from "@spindle/Foundation/Service";
import { GitService } from "@spindle/Git/Services/GitService";
import type { Feature } from "@spindle/SubagentDrivenDevelopment/Models/Feature";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { WorkGraphService } from "@spindle/SubagentDrivenDevelopment/Services/WorkGraphService";

export class TaskDispatchService extends Service {
  public async dispatch(reference: string, taskId: string, stoppedAttempt?: number) {
    this.assertApplicationBooted();
    const workspace = await this.app.make(FeatureWorkspaceService);
    const graph = await this.app.make(WorkGraphService);
    return workspace.withLedgerTransaction(reference, async (feature, ledger, publish) => {
      if (feature.pendingStart)
        throw new Error("Resume the pending start before dispatching tasks.");
      const { ticket, task } = this.findTask(ledger.tickets, taskId);
      if (stoppedAttempt !== undefined) {
        this.requireAttempt(stoppedAttempt);
        if (task.state !== "InProgress" || task.attempt !== stoppedAttempt) {
          throw new Error(
            `Stopped attempt ${stoppedAttempt} is not the active attempt for '${taskId}'.`,
          );
        }
      } else if (task.state === "InProgress") {
        throw new Error(`Task '${taskId}' already has active attempt ${task.attempt}.`);
      }

      const readiness = graph
        .readiness(feature)
        .tickets.find(({ ticketId }) => ticketId === ticket.id)
        ?.tasks.find((item) => item.taskId === taskId);
      if (!readiness) throw new Error(`Missing readiness for '${taskId}'.`);
      const blockers = readiness.blockers.filter(
        ({ code }) => stoppedAttempt === undefined || code !== "in-progress",
      );
      if (blockers.length > 0) {
        throw new Error(`Task '${taskId}' is not ready: ${JSON.stringify(blockers)}`);
      }

      const attempt = task.attempt + 1;
      this.requireAttempt(attempt);
      const featurePath = this.featurePath(feature.name);
      const assignmentCommand = `spindle sdd assignment --feature ${this.shellArgument(featurePath)} --task ${this.shellArgument(task.id)} --attempt ${attempt} --json`;
      if (task.deliveryMerge) {
        const git = await this.app.make(GitService);
        if (!ticket.delivery) {
          throw new Error(`Delivery task '${task.id}' has no delivery ticket metadata.`);
        }
        if (task.deliveryMerge.originalBranch !== ticket.delivery.originalBranch) {
          throw new Error(`Delivery task '${task.id}' targets a different original branch.`);
        }
        const sourceCommit = ticket.delivery.sourceCommit;
        const object = git.run(["cat-file", "-e", `${sourceCommit}^{commit}`], {
          cwd: this.app.workspaceRoot,
          encoding: "utf8",
        });
        if (object.error) throw object.error;
        if (object.status !== 0) {
          throw new Error(`Delivery source commit '${sourceCommit}' is not available locally.`);
        }
        const mergeBase = git.run(["merge-base", ticket.delivery.baseCommit, sourceCommit], {
          cwd: this.app.workspaceRoot,
          encoding: "utf8",
        });
        if (mergeBase.error) throw mergeBase.error;
        if (mergeBase.status === 1) {
          throw new Error("The feature and original branches no longer share a merge base.");
        }
        if (mergeBase.status !== 0) {
          throw new Error(`git merge-base failed: ${mergeBase.stderr.trim()}`);
        }
        task.deliveryMerge.sourceCommit = sourceCommit;
      }
      task.state = "InProgress";
      task.attempt = attempt;
      await publish(ledger);
      return {
        feature: feature.name,
        ticket: ticket.id,
        task: task.id,
        attempt,
        assignmentCommand,
      };
    });
  }

  public async assignment(reference: string, taskId: string, attempt: number) {
    this.assertApplicationBooted();
    if (!isAbsolute(reference)) throw new Error("Assignment requires an absolute --feature path.");
    this.requireAttempt(attempt);
    const feature = await (await this.app.make(FeatureWorkspaceService)).load(reference);
    const { ticket, task } = this.findTask(feature.tickets, taskId);
    this.requireActiveAssignment(task, attempt);
    if (!ticket.worktree || ticket.merged)
      throw new Error(`Ticket '${ticket.id}' has no active worktree.`);
    if (
      task.deliveryMerge &&
      (!ticket.delivery ||
        task.deliveryMerge.originalBranch !== ticket.delivery.originalBranch ||
        !task.deliveryMerge.sourceCommit)
    ) {
      throw new Error(`Delivery task '${task.id}' has no valid merge assignment.`);
    }
    const finding =
      task.discoveredFrom === undefined
        ? feature.findings.find(
            (item) =>
              item.type === "conflict" &&
              item.ticketId === ticket.id &&
              item.fixWork?.type === "task" &&
              item.fixWork.taskId === task.id,
          )
        : feature.findings.find(({ id }) => id === task.discoveredFrom);
    if (task.discoveredFrom !== undefined && !finding) {
      throw new Error(`Originating finding '${task.discoveredFrom}' was not found.`);
    }
    const conflictMerge =
      finding?.type === "conflict" &&
      finding.ticketId === ticket.id &&
      finding.decision === "open" &&
      finding.fixWork?.type === "task" &&
      finding.fixWork.taskId === task.id;
    const merge = conflictMerge || task.deliveryMerge !== undefined;
    if (task.deliveryMerge && !ticket.delivery) {
      throw new Error(`Delivery task '${task.id}' has no delivery ticket metadata.`);
    }

    return {
      role: merge ? "merge-agent" : "worker",
      feature: feature.name,
      ticket: ticket.id,
      task: task.id,
      attempt,
      worktree: ticket.worktree,
      instructions: task.instructions,
      writeScope: task.writeScope,
      context: task.context ?? [],
      requirements: ticket.requirements,
      acceptanceCriteria: ticket.acceptanceCriteria,
      ...(task.deliveryMerge
        ? {
            delivery: {
              originalBranch: task.deliveryMerge.originalBranch,
              sourceCommit: task.deliveryMerge.sourceCommit,
              targetCommit: ticket.delivery?.baseCommit,
            },
          }
        : {}),
      ...(finding === undefined ? {} : { finding }),
      reportPath: join(
        this.featurePath(feature.name),
        "reports",
        `${task.id}-attempt-${attempt}.md`,
      ),
      workerRules: [
        "Work in the assigned ticket worktree and change only files in the write scope.",
        "You may read other files and run focused tests. Other workers may be editing outside your scope.",
        "Do not change workflow records or run other SDD commands.",
        merge
          ? task.deliveryMerge
            ? "Merge the assigned original-branch commit with the feature base as the first parent. Resolve only files in the write scope, create the merge commit, and do not move either branch."
            : "Resolve only the assigned merge; stage those resolutions and create its merge commit."
          : "Do not stage or commit changes.",
      ],
      reportInstructions: merge
        ? "Write only to the assigned report path. Summarize the merge commit, conflict resolutions, test results, and blockers, then notify the controller."
        : "Write only to the assigned report path. Summarize changes, test results, and blockers, then notify the controller.",
    };
  }

  public async submit(reference: string, taskId: string, attempt: number) {
    this.assertApplicationBooted();
    this.requireAttempt(attempt);
    const workspace = await this.app.make(FeatureWorkspaceService);
    const git = await this.app.make(GitService);
    return workspace.withLedgerTransaction(reference, async (feature, ledger, publish) => {
      if (feature.pendingStart)
        throw new Error("Resume the pending start before submitting tasks.");
      const { ticket, task } = this.findTask(ledger.tickets, taskId);
      this.requireActiveAssignment(task, attempt);
      if (!ticket.worktree || ticket.merged) {
        throw new Error(`Ticket '${ticket.id}' has no active worktree.`);
      }
      const mergeFinding = ledger.findings.find(
        (finding) =>
          finding.type === "conflict" &&
          finding.ticketId === ticket.id &&
          finding.decision === "open" &&
          finding.fixWork?.type === "task" &&
          finding.fixWork.taskId === task.id,
      );
      if (
        ledger.findings.some(
          (finding) =>
            finding.type === "conflict" &&
            finding.ticketId === ticket.id &&
            finding.decision === "open" &&
            finding.id !== mergeFinding?.id,
        )
      ) {
        throw new Error("Task submission cannot complete while another merge conflict is pending.");
      }

      const worktree = ticket.worktree;
      if (!ticket.branch) throw new Error(`Ticket '${ticket.id}' has no recorded branch.`);
      await git.requireWorktreeBranch(worktree, ticket.branch);
      if (task.deliveryMerge) {
        if (!ticket.delivery || !task.deliveryMerge.sourceCommit) {
          throw new Error(`Delivery task '${task.id}' has no recorded merge source.`);
        }
        const unmerged = this.git(git, worktree, ["diff", "--name-only", "--diff-filter=U", "-z"])
          .split("\0")
          .filter(Boolean);
        if (unmerged.length > 0) {
          throw new Error(`Resolve merge conflicts before submitting: ${JSON.stringify(unmerged)}`);
        }
        const operationPaths = git.gitPaths(worktree, [
          "MERGE_HEAD",
          "CHERRY_PICK_HEAD",
          "REVERT_HEAD",
          "rebase-apply",
          "rebase-merge",
          "sequencer",
        ]);
        if (operationPaths.some((path) => existsSync(resolve(worktree, path)))) {
          throw new Error("Finish the Git operation before submitting the delivery merge task.");
        }
        const head = this.git(git, worktree, ["rev-parse", "--verify", "HEAD"]);
        const parents = this.git(git, worktree, ["rev-list", "--parents", "-n", "1", head])
          .trim()
          .split(/\s+/);
        if (
          parents.length !== 3 ||
          parents[1] !== ticket.delivery.baseCommit ||
          parents[2] !== task.deliveryMerge.sourceCommit
        ) {
          throw new Error(
            "Delivery task must merge its recorded feature base and original-branch commit.",
          );
        }
        const changed = this.git(git, worktree, [
          "diff",
          "--no-renames",
          "--name-only",
          "-z",
          ticket.delivery.baseCommit,
          head,
        ])
          .split("\0")
          .filter(Boolean);
        const uncovered = changed.filter((path) => !task.writeScope.includes(path));
        if (uncovered.length > 0) {
          throw new Error(
            `Delivery merge changed paths outside its write scope: ${JSON.stringify(uncovered)}`,
          );
        }
        const outstanding = git.changedPaths(worktree);
        if (outstanding.length > 0) {
          throw new Error(
            `Delivery worktree has uncommitted paths: ${JSON.stringify(outstanding)}`,
          );
        }
        task.state = "Done";
        ticket.workRoundCommits.push(head);
        ticket.committedTaskIds = [...new Set([...(ticket.committedTaskIds ?? []), task.id])];
        await publish(ledger);
        return {
          feature: feature.name,
          ticket: ticket.id,
          task: task.id,
          attempt,
          state: task.state,
          commit: head,
        };
      }
      if (mergeFinding) {
        if (mergeFinding.type !== "conflict") {
          throw new Error("Merge task must be linked to an integration conflict.");
        }
        if (!mergeFinding.sourceCommit || !mergeFinding.targetCommit) {
          throw new Error(
            `Conflict finding '${mergeFinding.id}' has no integration commit details.`,
          );
        }
        const unmerged = this.git(git, worktree, ["diff", "--name-only", "--diff-filter=U", "-z"])
          .split("\0")
          .filter(Boolean);
        if (unmerged.length > 0) {
          throw new Error(`Resolve merge conflicts before submitting: ${JSON.stringify(unmerged)}`);
        }
        const operationPaths = git.gitPaths(worktree, [
          "MERGE_HEAD",
          "CHERRY_PICK_HEAD",
          "REVERT_HEAD",
          "rebase-apply",
          "rebase-merge",
          "sequencer",
        ]);
        if (operationPaths.some((path) => existsSync(resolve(worktree, path)))) {
          throw new Error("Finish the Git operation before submitting the merge task.");
        }
        const head = this.git(git, worktree, ["rev-parse", "--verify", "HEAD"]);
        const parents = this.git(git, worktree, ["rev-list", "--parents", "-n", "1", head])
          .trim()
          .split(/\s+/);
        if (
          parents.length !== 3 ||
          parents[1] !== mergeFinding.targetCommit ||
          parents[2] !== mergeFinding.sourceCommit
        ) {
          throw new Error(
            "Merge task must commit the resolved integration merge with its recorded parents.",
          );
        }
        const changed = this.git(git, worktree, [
          "diff",
          "--no-renames",
          "--name-only",
          "-z",
          mergeFinding.targetCommit,
          head,
        ])
          .split("\0")
          .filter(Boolean);
        const uncovered = changed.filter((path) => !task.writeScope.includes(path));
        if (uncovered.length > 0) {
          throw new Error(
            `Merge task changed paths outside its write scope: ${JSON.stringify(uncovered)}`,
          );
        }
        const outstanding = git.changedPaths(worktree);
        if (outstanding.length > 0) {
          throw new Error(
            `Merge task worktree has uncommitted paths: ${JSON.stringify(outstanding)}`,
          );
        }
        task.state = "Done";
        mergeFinding.decision = "resolved";
        ticket.workRoundCommits.push(head);
        ticket.committedTaskIds = [...new Set([...(ticket.committedTaskIds ?? []), task.id])];
        await publish(ledger);
        return {
          feature: feature.name,
          ticket: ticket.id,
          task: task.id,
          attempt,
          state: task.state,
          commit: head,
          finding: mergeFinding.id,
        };
      }
      const assigned = new Set(
        ticket.tasks
          .filter(({ state }) => state === "InProgress" || state === "Done")
          .flatMap(({ writeScope }) => writeScope),
      );
      const unassigned = git.changedPaths(worktree).filter((path) => !assigned.has(path));
      if (unassigned.length > 0) {
        throw new Error(
          `Task '${taskId}' has unassigned changed paths in its ticket worktree: ${JSON.stringify(unassigned)}`,
        );
      }
      task.state = "Done";
      await publish(ledger);
      return {
        feature: feature.name,
        ticket: ticket.id,
        task: task.id,
        attempt,
        state: task.state,
      };
    });
  }

  private findTask<T extends Pick<Feature["tickets"][number], "id" | "tasks">>(
    tickets: readonly T[],
    taskId: string,
  ) {
    const ticket = tickets.find(({ tasks }) => tasks.some(({ id }) => id === taskId));
    const task = ticket?.tasks.find(({ id }) => id === taskId);
    if (!ticket || !task) throw new Error(`Unknown task '${taskId}'.`);
    return { ticket, task };
  }

  private featurePath(name: string): string {
    return this.app.workspacePath(join(".spindle", "features", name));
  }

  private git(git: GitService, cwd: string, args: string[]): string {
    const result = git.run(args, { cwd, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    return result.stdout.replace(/\r?\n$/, "");
  }

  private requireAttempt(attempt: number): void {
    if (!Number.isSafeInteger(attempt) || attempt < 1)
      throw new Error("Attempt must be a positive safe integer.");
  }

  private requireActiveAssignment(
    task: Pick<Feature["tickets"][number]["tasks"][number], "id" | "state" | "attempt">,
    attempt: number,
  ): void {
    if (task.state !== "InProgress" || task.attempt !== attempt) {
      throw new Error(`Attempt ${attempt} is not the active assignment for '${task.id}'.`);
    }
  }

  private shellArgument(value: string): string {
    return /^[a-zA-Z0-9_./-]+$/.test(value) && value === value.trim()
      ? value
      : `'${value.replaceAll("'", "'\\''")}'`;
  }
}
