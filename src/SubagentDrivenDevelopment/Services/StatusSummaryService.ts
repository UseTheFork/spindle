import { Service } from "@spindle/Foundation/Service";
import { ProjectSettingsService } from "@spindle/Settings/Services/ProjectSettingsService";
import { StatusSummaryFormatter } from "@spindle/SubagentDrivenDevelopment/Support/StatusSummaryFormatter";

export class StatusSummaryService extends Service {
  public statusSummary(data: unknown, spec: string, heading: string): string[] {
    this.assertApplicationBooted();
    return StatusSummaryFormatter.statusSummary(data, spec, heading, this.commandPrefix());
  }

  public finishSummary(data: unknown): string[] {
    this.assertApplicationBooted();
    return StatusSummaryFormatter.finishSummary(data, this.commandPrefix());
  }

  public nextSummary(data: unknown): string[] {
    this.assertApplicationBooted();
    return StatusSummaryFormatter.nextSummary(data, this.commandPrefix());
  }

  private commandPrefix(): string {
    const { settings } = ProjectSettingsService.requireCurrent(this.app);
    return settings.spindle_package_manager!.concat(" spindle");
  }
}
