import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import type { CommitIdentity } from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  TicketProgress,
  DeliveryProgress,
  FeaturePaths,
  TicketDocument,
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
    ticket: TicketDocument,
    progress: TicketProgress,
  ): boolean {
    const identity = this.gitEvidence.commitIdentity(feature, ticket, progress.baseSha);
    return this.checkBlockers(feature, ticket, progress, identity).length === 0;
  }

  public checkBlockers(
    feature: FeaturePaths,
    ticket: TicketDocument,
    progress: TicketProgress,
    identity: CommitIdentity,
  ): string[] {
    const checks = progress.checks;
    if (!checks) return [];
    const workspace = progress.worktree
      ? this.gitEvidence.ticketWorkspace(progress)
      : this.app.workspaceRoot;
    try {
      const featureHead = this.gitEvidence.headSha(feature.workspace);
      this.gitEvidence.assertCommittedRequirements(feature, [ticket], featureHead);
      if (progress.worktree) {
        this.gitEvidence.assertTicketRequirementsCurrent(
          feature,
          ticket,
          identity.headSha,
          workspace!,
        );
      }
    } catch (error) {
      return [error instanceof Error ? error.message : String(error)];
    }

    return checks.required
      .filter((requirement) => !requirement.removedAt)
      .flatMap((requirement) => {
        const records = checks.records.filter((record) => record.command === requirement.command);
        const current = records.filter((record) =>
          this.gitEvidence.commitPreservesInputs(
            feature,
            ticket,
            record.headSha,
            identity.headSha,
            workspace!,
          ),
        );
        const latest = current.at(-1);
        if (!latest) {
          const state = records.length > 0 ? "stale" : "missing";
          return [`Required check ${requirement.command} is ${state} for the current commit.`];
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
    ticket: TicketDocument,
    progress: TicketProgress,
    identity: CommitIdentity,
  ): string[] {
    const activeRequirements =
      progress.checks?.required.filter((requirement) => !requirement.removedAt) ?? [];
    if (activeRequirements.length === 0) {
      return ["Review requires at least one currently required passing check."];
    }
    return this.checkBlockers(feature, ticket, progress, identity);
  }

  public deliveryCheckBlockers(
    feature: FeaturePaths,
    _tickets: TicketDocument[],
    delivery: DeliveryProgress,
    identity: CommitIdentity,
  ): string[] {
    const records = delivery.checks?.records ?? [];
    const currentRecord = (record: (typeof records)[number]) =>
      record.headSha === identity.headSha ||
      this.gitEvidence.deliveryInputsPreserved(
        feature,
        record.headSha,
        identity.headSha,
        this.app.workspaceRoot,
      );
    const hasPassingCheck = records.some(
      (record) => record.result === "passed" && currentRecord(record),
    );
    const evidenceBlockers = hasPassingCheck
      ? []
      : ["At least one relevant test/check must pass for the current committed inputs."];
    return [
      ...evidenceBlockers,
      ...(delivery.checks?.required ?? [])
        .filter((requirement) => !requirement.removedAt)
        .flatMap((requirement) => {
          const latest = records
            .filter((record) => record.command === requirement.command && currentRecord(record))
            .at(-1);
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
