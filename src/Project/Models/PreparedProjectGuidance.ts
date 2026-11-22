import type { ProjectSettingsData } from "@spindle/Settings/Services/ProjectSettingsService";

export class PreparedProjectGuidance {
  public constructor(
    public readonly workspace: string,
    public readonly settings: ProjectSettingsData,
    public readonly directories: readonly string[],
    public readonly files: {
      destination: string;
      content: string;
      original: string | undefined;
      createOnce: boolean;
    }[],
  ) {}
}
