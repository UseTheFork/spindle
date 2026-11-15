import { beforeAll } from "vitest";

import { Application } from "@spindle/Foundation/Application";
import { ProjectSettingsService } from "@spindle/Settings/Services/ProjectSettingsService";
import { StatusSummaryService } from "@spindle/SubagentDrivenDevelopment/Services/StatusSummaryService";

export async function createStatusSummaryService(
  packageManager: string,
): Promise<StatusSummaryService> {
  const app = new Application({ basePath: process.cwd() });
  app.instance(
    "settings.project",
    ProjectSettingsService.parse(
      JSON.stringify({ stacks: ["python"], spindle_package_manager: packageManager }),
    ),
  );
  app.singleton(StatusSummaryService);
  await app.boot();
  return app.make(StatusSummaryService);
}

let summary: StatusSummaryService;

beforeAll(async () => {
  summary = await createStatusSummaryService("pnpm");
});

export function nextSummary(data: unknown): string[] {
  return summary.nextSummary(data);
}
