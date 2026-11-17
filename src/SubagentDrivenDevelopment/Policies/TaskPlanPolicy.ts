import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";

import {
  APPROVED_TASK_PLAN_EXCEPTION,
  type ApprovedTaskPlanException,
} from "@spindle/SubagentDrivenDevelopment/Models/Assignments";
import type {
  FeatureLedger,
  TicketProgress,
} from "@spindle/SubagentDrivenDevelopment/Models/Workflow";

export class TaskPlanPolicy {
  public static recoveryTicketValidated(ledger: FeatureLedger): boolean {
    const recovery = ledger.tickets.find(
      (ticket) => ticket.id === APPROVED_TASK_PLAN_EXCEPTION.recoveryTicket,
    );
    const integration = recovery?.integration;
    const checks = integration?.postMerge?.checks;
    return (
      recovery?.status === "closed" &&
      recovery.execution === "integrated" &&
      integration?.postMerge?.status === "passed" &&
      integration.postMerge.mergeSha === integration.mergeSha &&
      !!checks?.required.length &&
      checks.required.every((requirement) => {
        const latest = [...checks.records]
          .reverse()
          .find((record) => record.command === requirement.command);
        return latest?.result === "passed" && latest.headSha === integration.mergeSha;
      })
    );
  }

  public static approvedExceptionCandidate(
    feature: string,
    ledger: FeatureLedger,
  ): TicketProgress | undefined {
    if (
      feature !== APPROVED_TASK_PLAN_EXCEPTION.feature ||
      !TaskPlanPolicy.recoveryTicketValidated(ledger)
    ) {
      return undefined;
    }
    const target = ledger.tickets.find(
      (ticket) => ticket.id === APPROVED_TASK_PLAN_EXCEPTION.ticket,
    );
    const pending = ledger.tickets.filter(
      (ticket) =>
        (ticket.integration ?? ticket.integrationHistory?.at(-1))?.postMerge?.status === "pending",
    );
    if (
      !target ||
      target.status !== "open" ||
      target.execution !== "integrated" ||
      target.tasks.length !== 0 ||
      target.taskPlanException ||
      target.integration?.postMerge?.status !== "pending" ||
      pending.length !== 1 ||
      pending[0]?.id !== APPROVED_TASK_PLAN_EXCEPTION.ticket
    ) {
      return undefined;
    }
    return target;
  }

  public static isApprovedTasklessCorrection(progress: TicketProgress): boolean {
    const exception = progress.taskPlanException;
    const assignment = progress.assignment;
    const attempt = progress.correctionAttempts?.at(-1);
    return (
      progress.id === APPROVED_TASK_PLAN_EXCEPTION.ticket &&
      progress.tasks.length === 0 &&
      !!exception &&
      TaskPlanPolicy.isExceptionForTicket(exception, progress.id) &&
      !!assignment &&
      assignment.action === "correct" &&
      assignment.approvedExceptionId === exception.id &&
      assignment.id === exception.assignmentId &&
      assignment.attempt === exception.attempt &&
      assignment.objective === exception.objective &&
      !!attempt &&
      attempt.assignmentId === assignment.id &&
      attempt.approvedExceptionId === exception.id &&
      attempt.number === exception.attempt &&
      attempt.findingIds.length === 0 &&
      !attempt.checkFailure
    );
  }

  public static isExceptionForTicket(
    exception: ApprovedTaskPlanException,
    ticket: string,
  ): boolean {
    return (
      exception.feature === APPROVED_TASK_PLAN_EXCEPTION.feature &&
      exception.ticket === ticket &&
      exception.recoveryTicket === APPROVED_TASK_PLAN_EXCEPTION.recoveryTicket &&
      exception.scope === APPROVED_TASK_PLAN_EXCEPTION.scope
    );
  }

  public static assertDefined(progress: TicketProgress): void {
    if (progress.tasks.length === 0) {
      throw new Error(
        `Ticket ${progress.id} needs a task plan before implementation starts; define tasks first.`,
      );
    }
  }

  public static acceptanceBlockers(
    progress: TicketProgress,
    verifyAcceptedReports = false,
  ): string[] {
    if (progress.tasks.length === 0) {
      if (TaskPlanPolicy.isApprovedTasklessCorrection(progress)) return [];
      return [`Ticket ${progress.id} has no task plan; define tasks before ticket completion.`];
    }
    const blockers = progress.tasks
      .filter((task) => task.status !== "accepted")
      .map((task) => `Task ${task.id} is ${task.status}, not accepted.`);
    if (verifyAcceptedReports)
      blockers.push(...TaskPlanPolicy.acceptedReportIntegrityBlockers(progress));
    return blockers;
  }

  public static acceptedReportIntegrityBlockers(progress: TicketProgress): string[] {
    const blockers: string[] = [];
    for (const task of progress.tasks) {
      if (task.status !== "accepted") continue;
      const assignment = task.assignment;
      if (!assignment || !assignment.reportSha256) {
        blockers.push(
          `Task ${task.id} has no stored report digest; accepted report integrity cannot be verified.`,
        );
        continue;
      }

      const report = assignment.report;
      const resolvedReport = resolve(report);
      const reportsDirectory = dirname(resolvedReport);
      if (
        !isAbsolute(report) ||
        resolvedReport !== report ||
        !/^[^/]+\.md$/.test(basename(resolvedReport))
      ) {
        blockers.push(
          `Task ${task.id} report path is unsafe; accepted report integrity cannot be verified.`,
        );
        continue;
      }

      let digest: string;
      try {
        const directory = lstatSync(reportsDirectory);
        const entry = lstatSync(resolvedReport);
        if (
          !directory.isDirectory() ||
          directory.isSymbolicLink() ||
          !entry.isFile() ||
          entry.isSymbolicLink() ||
          dirname(realpathSync(resolvedReport)) !== realpathSync(reportsDirectory)
        ) {
          blockers.push(
            `Task ${task.id} report path is unsafe; accepted report integrity cannot be verified.`,
          );
          continue;
        }
        digest = createHash("sha256").update(readFileSync(resolvedReport)).digest("hex");
      } catch (error) {
        const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
        blockers.push(
          missing
            ? `Task ${task.id} report is missing; accepted report integrity cannot be verified.`
            : `Task ${task.id} report is unavailable; accepted report integrity cannot be verified.`,
        );
        continue;
      }

      if (digest !== assignment.reportSha256) {
        blockers.push(
          `Task ${task.id} report changed after acceptance; accepted report integrity failed.`,
        );
      }
    }
    return blockers;
  }

  public static assertAllAccepted(progress: TicketProgress, verifyAcceptedReports = false): void {
    const blockers = TaskPlanPolicy.acceptanceBlockers(progress, verifyAcceptedReports);
    if (blockers.length > 0) {
      throw new Error(
        `Ticket ${progress.id} cannot submit implementation:\n${blockers.join("\n")}`,
      );
    }
  }

  public static assertEditable(progress: TicketProgress): void {
    if (progress.assignment) {
      throw new Error(
        `Ticket ${progress.id} task plan is frozen after implementation is assigned (${progress.assignment.status}).`,
      );
    }
  }
}
