import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type { ReadyOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import { PathSafety } from "@/SubagentDrivenDevelopment/Persistence/PathSafety";
import { ReadinessReader } from "@/SubagentDrivenDevelopment/Persistence/ReadinessReader";
import { ReadinessPolicy } from "@/SubagentDrivenDevelopment/Policies/ReadinessPolicy";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

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
    const { issues } = this.reader.read(feature);
    const result = this.policy.evaluate(issues);
    this.pathSafety.assertReadyReadable(feature.workspace);
    return result;
  }
}
