import type { Application } from "@/Foundation/Application";
import { Service } from "@/services/Service";
import type {
  FeaturePaths,
  FeatureLedger,
  IssueDocument,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import { IssueRepository } from "@/SubagentDrivenDevelopment/Persistence/IssueRepository";
import { CheckPolicy } from "@/SubagentDrivenDevelopment/Policies/CheckPolicy";

export class ReadinessPolicy extends Service {
  public constructor(
    app: Application,
    private readonly issueRepository: IssueRepository,
    private readonly checkPolicy: CheckPolicy,
  ) {
    super(app);
  }
  public evaluate(feature: FeaturePaths, ledger: FeatureLedger, issues: IssueDocument[]) {
    this.issueRepository.validateDependencyGraph(issues);
    const progress = new Map(ledger.issues.map((item) => [item.id, item]));
    const byId = new Map(issues.map((item) => [item.id, item]));
    const eligible = issues.filter(
      (item) =>
        item.status === "ready-for-agent" && progress.get(item.id)?.execution === "unstarted",
    );
    const ready: string[] = [];
    const unready: { issue: string; blockedBy: string[] }[] = [];
    for (const item of eligible) {
      const pending = item.blocked_by.filter((id) => {
        const dependencyProgress = progress.get(id);
        const dependencyIssue = byId.get(id);
        return (
          !dependencyProgress ||
          dependencyProgress.execution !== "integrated" ||
          !dependencyIssue ||
          !this.checkPolicy.hasCurrentCheckCoverage(feature, dependencyIssue, dependencyProgress)
        );
      });
      if (pending.length === 0) ready.push(item.id);
      else unready.push({ issue: item.id, blockedBy: pending });
    }
    for (const item of issues) {
      if (!progress.has(item.id))
        throw new Error(`Issue ${item.id} has no ledger execution record.`);
    }
    for (const id of progress.keys()) {
      if (!byId.has(id)) throw new Error(`Ledger issue ${id} has no corresponding Markdown issue.`);
    }
    return { ready, unready };
  }
}
