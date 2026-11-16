import type { Application } from "@spindle/Foundation/Application";
import { Service } from "@spindle/Foundation/Service";
import type { ReadyOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { PathSafety } from "@spindle/SubagentDrivenDevelopment/Persistence/PathSafety";
import { ReadinessReader } from "@spindle/SubagentDrivenDevelopment/Persistence/ReadinessReader";
import { ReadinessPolicy } from "@spindle/SubagentDrivenDevelopment/Policies/ReadinessPolicy";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class ReadinessService extends Service {
  public constructor(
    app: Application,
    private readonly featureInspectionService: FeatureInspectionService,
    private readonly reader: ReadinessReader,
    private readonly policy: ReadinessPolicy,
    private readonly pathSafety: PathSafety,
  ) {
    super(app);
  }
  public ready(options: ReadyOptions) {
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    const { tickets, ledger } = this.reader.read(feature);
    const result = this.policy.evaluate(tickets, ledger);
    this.pathSafety.assertReadyReadable(feature.workspace);
    return result;
  }
}
