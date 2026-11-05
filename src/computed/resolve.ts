import type { RenderContext } from "../render.js";
import { computedVariableProviders } from "./computed-variable-providers.js";
import type { ComputedVariableRegistry, ResolvedConfig } from "./provider.js";

export function resolveComputedVariables(
  config: ResolvedConfig,
  registry: ComputedVariableRegistry = computedVariableProviders,
) {
  const resolved: Record<string, string> = {};
  for (const [name, Provider] of Object.entries(registry)) {
    try {
      resolved[name] = new Provider(config).render();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Computed Variable '${name}' failed: ${detail}`, { cause: error });
    }
  }
  return resolved;
}

export function createComputedContextResolver(
  resolveBaseContext: () => Promise<RenderContext | undefined>,
  registry: ComputedVariableRegistry = computedVariableProviders,
) {
  let resolvedContext: Promise<RenderContext | undefined> | undefined;
  return () => {
    resolvedContext ??= (async () => {
      const context = await resolveBaseContext();
      if (context === undefined) return undefined;
      const config = {
        stacks: Object.freeze([...context.stacks]),
        variables: Object.freeze({ ...context.variables }),
      };
      return {
        ...context,
        computed: resolveComputedVariables(config, registry),
      };
    })();
    return resolvedContext;
  };
}
