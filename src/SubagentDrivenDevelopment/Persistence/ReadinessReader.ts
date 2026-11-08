import { readFileSync } from "node:fs";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type {
  FeaturePaths,
  FeatureLedger,
  IssueDocument,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import { IssueRepository } from "@/SubagentDrivenDevelopment/Persistence/IssueRepository";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { PathSafety } from "@/SubagentDrivenDevelopment/Persistence/PathSafety";

export class ReadinessReader extends Service {
  public constructor(
    app: Application,
    private readonly issueRepository: IssueRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly pathSafety: PathSafety,
  ) {
    super(app);
  }
  public read(feature: FeaturePaths): { ledger: FeatureLedger; issues: IssueDocument[] } {
    let ledger: FeatureLedger | undefined;
    let issues: IssueDocument[] | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.pathSafety.assertReadyReadable(feature.workspace);
      const ledgerRaw = readFileSync(feature.ledger, "utf8");
      this.ledgerRepository.validateLedger(JSON.parse(ledgerRaw) as unknown, feature.feature);
      const observedIssues = this.issueRepository.readIssues(feature.workspace);
      this.pathSafety.assertReadyReadable(feature.workspace);

      const confirmedLedgerRaw = readFileSync(feature.ledger, "utf8");
      const confirmedLedger = this.ledgerRepository.validateLedger(
        JSON.parse(confirmedLedgerRaw) as unknown,
        feature.feature,
      );
      const confirmedIssues = this.issueRepository.readIssues(feature.workspace);
      this.pathSafety.assertReadyReadable(feature.workspace);
      const observedIssueContents = new Map(observedIssues.map((issue) => [issue.id, issue.raw]));
      const issuesMatch =
        observedIssueContents.size === confirmedIssues.length &&
        confirmedIssues.every((issue) => observedIssueContents.get(issue.id) === issue.raw);
      if (ledgerRaw === confirmedLedgerRaw && issuesMatch) {
        ledger = confirmedLedger;
        issues = confirmedIssues;
        break;
      }
    }
    if (!ledger || !issues) {
      throw new Error("Issue data changed while reading the ready queue; retry ready.");
    }
    return { ledger, issues };
  }
}
