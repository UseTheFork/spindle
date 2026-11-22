import { isDeepStrictEqual } from "node:util";

import type { BlueprintOutcome } from "@spindle/BlueprintManagement/Types/Reconciliation";
import { ProjectLifecycleContext } from "@spindle/Foundation/ProjectLifecycleContext";
import { Service } from "@spindle/Foundation/Service";
import {
  ProjectSettingsService,
  type ProjectSettingsData,
} from "@spindle/Settings/Services/ProjectSettingsService";

export class BlueprintLifecycleService extends Service {
  private running = false;

  public async run(
    mode: "init" | "update",
    settings: ProjectSettingsData,
    reconcile: () => Promise<BlueprintOutcome[]>,
  ): Promise<BlueprintOutcome[]> {
    this.assertApplicationBooted();
    if (this.running) throw new Error("A project lifecycle operation is already running.");
    this.running = true;
    const context = new ProjectLifecycleContext(this.app, mode, settings);
    try {
      const outcomes = await ProjectSettingsService.withTemporaryState(
        this.app,
        { status: "valid", data: settings },
        async () => {
          await this.app.runProjectHooks(mode === "init" ? "beforeInit" : "beforeUpdate", context);
          return reconcile();
        },
      );
      try {
        const persisted = ProjectSettingsService.require(
          await ProjectSettingsService.refresh(this.app),
        );
        if (!isDeepStrictEqual(persisted.settings, settings)) {
          throw new Error("Project Settings changed during reconciliation; run again.");
        }
        await this.app.runProjectHooks(mode === "init" ? "afterInit" : "afterUpdate", context);
      } catch (error) {
        const completed = outcomes.filter(
          (outcome) =>
            outcome.status === "installed" ||
            outcome.status === "updated" ||
            outcome.status === "removed",
        );
        throw new Error(
          `${error instanceof Error ? error.message : String(error)} Completed Blueprint changes: ${completed.map((outcome) => `${outcome.status} ${outcome.kind} '${outcome.name}'`).join(", ") || "none"}. Completed lifecycle changes: ${context.completedChanges.join(", ") || "none"}. Application stopped; rollback was not attempted.`,
          { cause: error },
        );
      }
      return outcomes;
    } finally {
      this.running = false;
    }
  }
}
