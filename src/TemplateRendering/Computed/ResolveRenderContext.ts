import type { Application } from "@spindle/Foundation/Application";
import type { ComputedVariableRegistry } from "@spindle/TemplateRendering/Computed/ComputedVariableProvider";
import { computedVariableProviders } from "@spindle/TemplateRendering/Computed/ComputedVariableProviders";
import type { RenderContext, RenderInputs } from "@spindle/TemplateRendering/Rendering/RenderText";

export class ResolveRenderContext {
  public static resolve(
    app: Application,
    inputs: RenderInputs,
    registry: ComputedVariableRegistry = computedVariableProviders,
  ): RenderContext {
    const stacks = [...(inputs.stacks ?? [])];
    const variables = { ...inputs.variables };
    const computed: Record<string, string> = {};
    for (const [name, Provider] of Object.entries(registry)) {
      try {
        const value = new Provider(app).render();
        if (value !== undefined) computed[name] = value;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Computed Variable '${name}' failed: ${detail}`, { cause: error });
      }
    }
    return { stacks, variables, computed };
  }
}
