import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type { IssueDocument } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { IssueRepository } from "@/SubagentDrivenDevelopment/Persistence/IssueRepository";

export class ReadinessPolicy extends Service {
  public constructor(
    app: Application,
    private readonly issueRepository: IssueRepository,
  ) {
    super(app);
  }
  public evaluate(issues: IssueDocument[]) {
    this.issueRepository.validateDependencyGraph(issues);
    const byId = new Map(issues.map((item) => [item.id, item]));
    const eligible = issues.filter((item) => item.status === "open" && !item.blocker);
    const ready: string[] = [];
    const unready: { issue: string; blockedBy: string[] }[] = [];
    for (const item of eligible) {
      const pending = item.blocked_by.filter((id) => {
        const dependencyIssue = byId.get(id);
        return !dependencyIssue || dependencyIssue.status !== "closed" || !!dependencyIssue.blocker;
      });
      if (pending.length === 0) ready.push(item.id);
      else unready.push({ issue: item.id, blockedBy: pending });
    }
    return { ready, unready };
  }
}
