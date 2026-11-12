import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { defaultCommitSettings } from "@/Settings/Models/CommitSettings";
import { ComputedVariableProvider } from "@/TemplateRendering/Computed/ComputedVariableProvider";

export class CommitGuidanceProvider extends ComputedVariableProvider {
  public render(): string {
    const state = LoadProjectConfiguration.current(this.app);
    if (state.status === "invalid") throw state.error;
    const settings =
      state.status === "valid"
        ? (state.data.commit ?? defaultCommitSettings)
        : defaultCommitSettings;
    const scope = settings.scopes_enabled ? `(${settings.allowed_scopes[0]})` : "";
    const example = (type: string, description: string) => {
      const title = `${type}${scope}: ${description}`;
      return title.length <= settings.title_max_length ? title : `${type}${scope}: x`;
    };
    return [
      `The complete first line must be at most ${settings.title_max_length} characters.`,
      settings.allow_body
        ? "A body is optional. Separate it from the title with a blank line."
        : "Use the title only; do not include a body or footer.",
      settings.scopes_enabled
        ? `A scope is mandatory. Allowed scopes: ${settings.allowed_scopes.join(", ")}. If none fits, ask the user to select or add one.`
        : "Do not include a scope.",
      settings.allow_breaking_changes
        ? `Mark every breaking change with ! before the colon.${settings.allow_body ? " A BREAKING CHANGE: footer may provide details." : ""}`
        : "Breaking-change notation is disabled. If the change is breaking, tell the user rather than produce a misleading message.",
      "",
      "Examples:",
      `- ${example("feat", "add login")}`,
      `- ${example("fix", "handle missing token")}`,
    ].join("\n");
  }
}
