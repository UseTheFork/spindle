import type {
  ComputedVariableRegistry,
  ResolvedConfig,
} from "@/BlueprintManagement/Computed/ComputedVariableProvider";
import { computedVariableProviders } from "@/BlueprintManagement/Computed/ComputedVariableProviders";
import type { RenderContext } from "@/BlueprintManagement/Rendering/RenderText";
import { Service } from "@/Foundation/Service";

export class ComputedContextService extends Service {
  #resolvedContext: Promise<RenderContext | undefined> | undefined;

  resolve(
    resolveBaseContext: () => Promise<RenderContext | undefined>,
    registry: ComputedVariableRegistry = computedVariableProviders,
  ): Promise<RenderContext | undefined> {
    this.#resolvedContext ??= (async () => {
      const context = await resolveBaseContext();
      if (context === undefined) return undefined;

      const config: ResolvedConfig = {
        stacks: Object.freeze([...context.stacks]),
        variables: Object.freeze({ ...context.variables }),
      };
      const computed: Record<string, string> = {};
      for (const [name, Provider] of Object.entries(registry)) {
        try {
          computed[name] = new Provider(config).render();
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`Computed Variable '${name}' failed: ${detail}`, { cause: error });
        }
      }
      return { ...context, computed };
    })();
    return this.#resolvedContext;
  }
}
