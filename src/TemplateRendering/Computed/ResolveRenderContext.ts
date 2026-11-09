import type {
  ComputedVariableRegistry,
  ResolvedInputs,
} from "@/TemplateRendering/Computed/ComputedVariableProvider";
import { computedVariableProviders } from "@/TemplateRendering/Computed/ComputedVariableProviders";
import type { RenderContext, RenderInputs } from "@/TemplateRendering/Rendering/RenderText";

export function resolveRenderContext(
  inputs: RenderInputs,
  registry: ComputedVariableRegistry = computedVariableProviders,
): RenderContext {
  const stacks = [...(inputs.stacks ?? [])];
  const variables = { ...inputs.variables };
  const resolvedInputs: ResolvedInputs = {
    stacks: Object.freeze(stacks),
    variables: Object.freeze(variables),
  };
  const computed: Record<string, string> = {};
  for (const [name, Provider] of Object.entries(registry)) {
    try {
      computed[name] = new Provider(resolvedInputs).render();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Computed Variable '${name}' failed: ${detail}`, { cause: error });
    }
  }
  return { stacks, variables, computed };
}
