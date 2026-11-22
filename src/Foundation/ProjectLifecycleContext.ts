import type { Application } from "@spindle/Foundation/Application";
import { Container } from "@spindle/Foundation/Container";
import type { ProjectSettingsData } from "@spindle/Settings/Services/ProjectSettingsService";

export class ProjectLifecycleContext extends Container {
  private readonly changes: string[] = [];

  public constructor(
    private readonly application: Application,
    public readonly mode: "init" | "update",
    public readonly settings: ProjectSettingsData,
  ) {
    super();
  }

  protected override get owner(): Application {
    return this.application;
  }

  public get completedChanges(): readonly string[] {
    return [...this.changes];
  }

  public recordChanges(result: { created: readonly string[]; updated: readonly string[] }): void {
    this.changes.push(...result.created, ...result.updated);
  }
}
