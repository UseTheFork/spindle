import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import type { ContentIdentity } from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  IssueProgress,
  DeliveryProgress,
  FeaturePaths,
  IssueDocument,
} from "@/SubagentDrivenDevelopment/Models/Workflow";

export class CheckPolicy extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
  ) {
    super(app);
  }

  public hasCurrentCheckCoverage(
    feature: FeaturePaths,
    issue: IssueDocument,
    progress: IssueProgress,
  ): boolean {
    const identity = this.gitEvidence.contentIdentity(
      feature,
      issue,
      progress.baseSha,
      progress.checks,
    );
    return this.checkBlockers(feature, issue, progress, identity).length === 0;
  }

  public checkBlockers(
    feature: FeaturePaths,
    issue: IssueDocument,
    progress: IssueProgress,
    identity: ContentIdentity,
  ): string[] {
    const checks = progress.checks;
    if (!checks) return [];
    return checks.required
      .filter((requirement) => !requirement.removedAt)
      .flatMap((requirement) => {
        const records = checks.records.filter((record) => record.command === requirement.command);
        const preservedIntegrationEvidence = this.gitEvidence.integrationPreservesEvidence(
          progress,
          identity,
        );
        const current = records.filter((record) => {
          if (
            record.snapshot === identity.snapshot &&
            record.codeSnapshot === identity.codeSnapshot &&
            record.requirementsSnapshot === identity.requirementsSnapshot
          ) {
            return true;
          }
          if (
            preservedIntegrationEvidence &&
            record.snapshot === progress.acceptedEvidence?.snapshot &&
            record.codeSnapshot === progress.acceptedEvidence?.codeSnapshot &&
            record.requirementsSnapshot === progress.acceptedEvidence?.requirementsSnapshot
          ) {
            return true;
          }
          if (
            !record.coveredPaths ||
            !record.coverageSnapshot ||
            record.requirementsSnapshot !== identity.requirementsSnapshot
          ) {
            return false;
          }
          try {
            const scopedIdentity = this.gitEvidence.contentIdentity(
              feature,
              issue,
              progress.baseSha,
              checks,
              record.coveredPaths,
            );
            return scopedIdentity.codeSnapshot === record.coverageSnapshot;
          } catch {
            return false;
          }
        });
        const latest = current.at(-1);
        if (!latest) {
          const state = records.length > 0 ? "stale" : "missing";
          return [`Required check ${requirement.command} is ${state} for the current content.`];
        }
        if (latest.result !== "passed") {
          const suffix = latest.details ? ` Details: ${latest.details}` : "";
          return [`Required check ${requirement.command} is ${latest.result}.${suffix}`];
        }
        return [];
      });
  }

  public reviewCheckBlockers(
    feature: FeaturePaths,
    issue: IssueDocument,
    progress: IssueProgress,
    identity: ContentIdentity,
  ): string[] {
    const activeRequirements =
      progress.checks?.required.filter((requirement) => !requirement.removedAt) ?? [];
    if (activeRequirements.length === 0) {
      return ["Review requires at least one currently required passing check."];
    }
    return this.checkBlockers(feature, issue, progress, identity);
  }

  public deliveryCheckBlockers(delivery: DeliveryProgress, identity: ContentIdentity): string[] {
    const records = delivery.checks?.records ?? [];
    const hasPassingCheck = records.some(
      (record) =>
        record.result === "passed" &&
        record.snapshot === identity.snapshot &&
        record.codeSnapshot === identity.codeSnapshot &&
        record.requirementsSnapshot === identity.requirementsSnapshot,
    );
    const evidenceBlockers = hasPassingCheck
      ? []
      : ["At least one relevant test/check must pass for the current feature snapshot."];
    return [
      ...evidenceBlockers,
      ...(delivery.checks?.required ?? [])
        .filter((requirement) => !requirement.removedAt)
        .flatMap((requirement) => {
          const matchingRecords = records.filter(
            (record) =>
              record.command === requirement.command &&
              record.snapshot === identity.snapshot &&
              record.codeSnapshot === identity.codeSnapshot &&
              record.requirementsSnapshot === identity.requirementsSnapshot,
          );
          const latest = matchingRecords.at(-1);
          if (!latest)
            return [`Required delivery check ${requirement.command} is missing or stale.`];
          if (latest.result !== "passed") {
            return [`Required delivery check ${requirement.command} is ${latest.result}.`];
          }
          return [];
        }),
    ];
  }
}
