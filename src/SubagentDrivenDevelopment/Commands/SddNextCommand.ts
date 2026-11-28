import { Command } from "@spindle/Commands/Command";
import { CommandOptions } from "@spindle/Commands/CommandOptions";
import type { Application } from "@spindle/Foundation/Application";
import { ConsoleOutputService } from "@spindle/Foundation/ConsoleOutputService";
import { ProjectSettingsService } from "@spindle/Settings/Services/ProjectSettingsService";
import { SddCommandGroup } from "@spindle/SubagentDrivenDevelopment/Commands/SddCommandGroup";
import type { TaskCheckpoint } from "@spindle/SubagentDrivenDevelopment/Models/Task";
import { DeliveryService } from "@spindle/SubagentDrivenDevelopment/Services/DeliveryService";
import {
  DocumentationService,
  type DocumentationStatus,
} from "@spindle/SubagentDrivenDevelopment/Services/DocumentationService";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { SddReviewService } from "@spindle/SubagentDrivenDevelopment/Services/SddReviewService";
import { WorkGraphService } from "@spindle/SubagentDrivenDevelopment/Services/WorkGraphService";
import type { Command as CommanderCommand } from "commander";

export class SddNextCommand extends Command {
  public static register(program: CommanderCommand, createApp: () => Promise<Application>): void {
    SddCommandGroup.register(program)
      .command("next")
      .description("Report work graph readiness and blockers without changing the workspace.")
      .requiredOption(
        "--feature <directory>",
        "Feature workspace name or directory",
        CommandOptions.once("--feature"),
      )
      .option("--verbose", "Include work graph details")
      .allowExcessArguments(false)
      .action(async ({ feature, verbose }: { feature: string; verbose?: boolean }) => {
        const app = await createApp();
        const data = await (await app.make(SddNextCommand)).run(feature, verbose);
        const human = [`Feature ${data.feature}`, ...data.notices];
        if (data.documentation) human.push(`Documentation: ${data.documentation.state}`);
        if (data.featureReview) human.push(`Feature review: ${data.featureReview.state}`);
        if (data.actions.length > 0) human.push("Available actions:", ...data.actions);
        for (const ticket of data.tickets) {
          human.push(
            `${ticket.ticketId}: ${ticket.acceptance ?? SddNextCommand.describe(ticket.blockers)}`,
          );
          for (const task of ticket.tasks) {
            human.push(`  ${task.taskId}: ${SddNextCommand.describe(task.blockers)}`);
            if (task.checkpoint) {
              const checkpoint = task.checkpoint;
              human.push(
                `    Checkpoint (attempt ${checkpoint.attempt}, ${checkpoint.recordedAt}): ${checkpoint.phase} - ${checkpoint.summary}`,
                `    Next: ${checkpoint.next}`,
              );
              if (checkpoint.blocker) human.push(`    Blocker: ${checkpoint.blocker}`);
            }
          }
        }
        if (data.graph) human.push(JSON.stringify(data.graph, null, 2));
        (await app.make(ConsoleOutputService)).result({ level: "info", human, data });
      });
  }

  public async run(reference: string, verbose = false) {
    this.assertApplicationBooted();
    const feature = await (await this.app.make(FeatureWorkspaceService)).load(reference);
    const { tickets: readiness } = (await this.app.make(WorkGraphService)).readiness(feature);
    const tasksById = new Map(
      feature.tickets.flatMap(({ tasks }) => tasks.map((task) => [task.id, task] as const)),
    );
    const tickets: ((typeof readiness)[number] & {
      acceptance?: "Accepted" | "InAcceptance" | "Blocked";
      tasks: ((typeof readiness)[number]["tasks"][number] & {
        checkpoint?: TaskCheckpoint;
        agent?: string;
      })[];
    })[] = readiness.map((ticket) => ({
      ...ticket,
      tasks: ticket.tasks.map((task) => {
        const record = tasksById.get(task.taskId);
        const checkpoint =
          record?.state === "InProgress"
            ? record.checkpoints?.filter(({ attempt }) => attempt === record.attempt).at(-1)
            : undefined;
        return {
          ...task,
          ...(checkpoint ? { checkpoint } : {}),
          ...(feature.tickets.find(({ id }) => id === ticket.ticketId)?.documentation
            ? { agent: DocumentationService.agent }
            : {}),
        };
      }),
    }));
    const settings = ProjectSettingsService.current(this.app);
    const canStart = settings.status === "valid" && settings.data.sdd !== undefined;
    const actions: string[] = [];
    const notices = tickets.length === 0 ? ["No tickets in this feature."] : [];
    const start = `spindle sdd start --feature ${feature.name}`;
    const ticketStart = (ticketId: string) =>
      `spindle sdd ticket start --feature ${feature.name} --ticket ${ticketId}`;
    if (feature.specification === undefined) {
      notices.push(
        "Fill in spec.md with the approved specification before creating tickets or starting work.",
      );
    } else if (feature.completed) {
      notices.push("Feature is complete.");
    } else if (feature.pendingMergeOperation) {
      notices.push("A merge operation is pending. Run the listed command to resume it.");
      actions.push(
        `spindle sdd assignment --feature ${SddNextCommand.shellArgument(this.app.featuresPath(feature.name))} --merge ${feature.pendingMergeOperation.id} --json`,
      );
    } else if (feature.pendingTicketCommit) {
      const { ticketId, message } = feature.pendingTicketCommit;
      notices.push("A ticket commit is pending. Run the listed command to resume it.");
      const quoted = `'${message.replaceAll("'", "'\\''")}'`;
      const command = `spindle sdd ticket commit --feature ${feature.name} --ticket ${ticketId}`;
      actions.push(
        message === "-"
          ? `printf '%s' '-' | ${command} --message -`
          : `${command} --message=${quoted}`,
      );
    } else if (feature.pendingStart) {
      notices.push("A start is pending. Run the listed command to resume it.");
      actions.push(
        feature.pendingStart.kind === "feature"
          ? start
          : ticketStart(feature.pendingStart.ticketId),
      );
    } else if (tickets.length === 0) {
      notices.push(
        "Run /sdd-to-tickets with the approved spec to plan tickets and tasks before starting.",
      );
    } else {
      if (
        canStart &&
        !feature.featureBranch &&
        !feature.featureWorktree &&
        !feature.originalBranch
      ) {
        actions.push(start);
      } else if (canStart && feature.featureBranch && feature.featureWorktree) {
        const ready = new Set(tickets.filter(({ ready }) => ready).map(({ ticketId }) => ticketId));
        for (const ticket of feature.tickets) {
          if (ready.has(ticket.id) && !ticket.worktree && !ticket.branch)
            actions.push(ticketStart(ticket.id));
        }
      }
      for (const ticket of tickets) {
        for (const blocker of ticket.blockers) {
          if (blocker.code !== "undecided-finding") continue;
          const finding = feature.findings.find(({ id }) => id === blocker.findingId);
          if (
            finding?.type === "review" &&
            !feature.tickets.find(({ id }) => id === ticket.ticketId)?.merged
          ) {
            notices.push(
              `${ticket.ticketId}: finding ${finding.id} needs a decision. Use finding fix or finding dismiss.`,
            );
          }
        }
        for (const task of ticket.tasks) {
          if (task.ready)
            actions.push(`spindle sdd dispatch --feature ${feature.name} --task ${task.taskId}`);
        }
      }
      for (const ticket of feature.tickets) {
        if (ticket.documentation && !ticket.merged && ticket.tasks.length === 0) {
          notices.push(
            `${ticket.id}: create its final documentation task with spindle sdd task create --feature ${feature.name} --ticket ${ticket.id}. Supply --instructions and the planned --write-scope paths. Assign it to ${DocumentationService.agent}.`,
          );
        }
        if (
          ticket.worktree &&
          ticket.branch &&
          !ticket.merged &&
          ticket.tasks.length > 0 &&
          ticket.tasks.every(({ state }) => state === "Done") &&
          ticket.tasks.some(({ id }) => !ticket.committedTaskIds?.includes(id))
        ) {
          notices.push(
            `All tasks on ${ticket.id} are Done. Run ticket commit with a commit message.`,
          );
        }
        if (
          ticket.merged ||
          ticket.workRoundCommits.length === 0 ||
          ticket.tasks.some(
            ({ id, state }) => state !== "Done" || !ticket.committedTaskIds?.includes(id),
          )
        )
          continue;
        const status = await (await this.app.make(SddReviewService)).status(feature, ticket);
        if ("blocker" in status) {
          notices.push(status.blocker);
        } else {
          const item = tickets.find(({ ticketId }) => ticketId === ticket.id);
          if (item) item.acceptance = status.state;
          if (status.state === "InAcceptance" && !status.hasRound) {
            actions.push(`spindle sdd review --feature ${feature.name} --ticket ${ticket.id}`);
          } else if (status.state === "Accepted") {
            actions.push(`spindle sdd integrate --feature ${feature.name} --ticket ${ticket.id}`);
          }
        }
      }
    }
    let featureReview:
      | {
          state: "Accepted" | "InReview" | "Blocked";
          codeRevision: string;
          hasRound: boolean;
        }
      | undefined;
    let documentation: DocumentationStatus | undefined;
    if (
      feature.featureBranch &&
      feature.featureWorktree &&
      !feature.completed &&
      !feature.pendingStart &&
      !feature.pendingTicketCommit &&
      !feature.pendingMergeOperation
    ) {
      documentation = await (await this.app.make(DocumentationService)).status(feature);
    }
    if (
      !feature.pendingStart &&
      !feature.pendingTicketCommit &&
      !feature.pendingMergeOperation &&
      !feature.completed &&
      feature.tickets.length > 0 &&
      feature.tickets.every(({ merged }) => merged)
    ) {
      const status = await (await this.app.make(SddReviewService)).featureStatus(feature);
      if ("blocker" in status) {
        notices.push(status.blocker);
      } else {
        featureReview = {
          state: status.state,
          codeRevision: status.codeRevision,
          hasRound: status.hasRound,
        };
        if (documentation?.state === "Current" && status.state === "InReview") {
          actions.push(`spindle sdd review --feature ${feature.name} --target feature`);
        } else if (status.state === "Blocked") {
          const reviewIds = new Set(
            feature.reviewRounds
              .filter(({ target }) => target.type === "feature")
              .flatMap(({ reviews }) => reviews.map(({ id }) => id)),
          );
          for (const finding of feature.findings) {
            if (
              finding.type === "review" &&
              reviewIds.has(finding.reviewId) &&
              finding.decision.status === "open"
            ) {
              notices.push(
                `Feature finding ${finding.id} needs a decision. Use finding fix or finding dismiss.`,
              );
            }
          }
        }
      }
    }
    if (
      featureReview &&
      documentation &&
      documentation.state !== "Current" &&
      documentation.state !== "InProgress"
    ) {
      const blocker = await (await this.app.make(DocumentationService)).creationBlocker(feature);
      notices.push(
        documentation.state === "Stale"
          ? "Documentation is stale for the current feature commit."
          : "The final documentation task is missing.",
      );
      if (blocker) notices.push(blocker);
      else actions.push(DocumentationService.creationCommand(feature.name));
    }
    if (
      featureReview?.state === "Accepted" &&
      documentation?.state === "Current" &&
      !feature.completed
    ) {
      const reviews = await this.app.make(SddReviewService);
      if (!reviews.hasPassedFeatureReview(feature)) {
        notices.push("At least one feature review round must pass before delivery.");
      } else {
        const delivery = await (await this.app.make(DeliveryService)).plan(reference);
        if (delivery.needsDelivery) {
          const scope = delivery.requiredWriteScope
            .map((path) => ` --write-scope=${SddNextCommand.shellArgument(path)}`)
            .join("");
          actions.push(`spindle sdd delivery create --feature ${feature.name}${scope}`);
        } else {
          actions.push(`spindle sdd finish --feature ${feature.name}`);
        }
      }
    }
    if (actions.length === 0 && feature.specification !== undefined && tickets.length > 0) {
      if (!feature.completed) notices.push("No workflow actions available in this CLI yet.");
      if (!feature.completed && settings.status === "valid" && !settings.data.sdd) {
        notices.push(
          "Configure sdd.worktree_directory in .spindle/config.json to start worktrees.",
        );
      }
    }
    const graph = verbose
      ? feature.tickets.map(({ id, dependencies, merged, worktree, tasks, documentation }) => ({
          id,
          dependencies,
          merged,
          worktree,
          ...(documentation ? { documentation } : {}),
          tasks: tasks.map(
            ({ id, state, attempt, dependencies, writeScope, deliveryMerge, checkpoints }) => ({
              id,
              state,
              attempt,
              dependencies,
              writeScope,
              ...(deliveryMerge ? { deliveryMerge } : {}),
              ...(checkpoints ? { checkpoints } : {}),
            }),
          ),
        }))
      : undefined;
    return {
      feature: feature.name,
      actions,
      notices,
      tickets,
      ...(documentation ? { documentation } : {}),
      ...(featureReview ? { featureReview } : {}),
      ...(graph ? { graph } : {}),
    };
  }

  private static describe(blockers: readonly { code: string }[]): string {
    if (blockers.length === 0) return "ready";
    return blockers
      .map(({ code, ...details }) =>
        [code.replaceAll("-", " "), ...Object.values(details)].join(" "),
      )
      .join("; ");
  }

  private static shellArgument(value: string): string {
    return /^[a-zA-Z0-9_./-]+$/.test(value) && value === value.trim()
      ? value
      : `'${value.replaceAll("'", "'\\''")}'`;
  }
}
