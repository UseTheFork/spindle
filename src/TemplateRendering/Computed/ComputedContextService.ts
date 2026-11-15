import { Service } from "@/Foundation/Service";
import type { ComputedVariableRegistry } from "@/TemplateRendering/Computed/ComputedVariableProvider";
import { computedVariableProviders } from "@/TemplateRendering/Computed/ComputedVariableProviders";
import { ResolveRenderContext } from "@/TemplateRendering/Computed/ResolveRenderContext";
import type { RenderContext, RenderInputs } from "@/TemplateRendering/Rendering/RenderText";

export class ComputedContextService extends Service {
  private resolvedContext: Promise<RenderContext | undefined> | undefined;

  public resolve(
    resolveBaseContext: () => Promise<RenderInputs | undefined>,
    registry: ComputedVariableRegistry = computedVariableProviders,
  ): Promise<RenderContext | undefined> {
    this.resolvedContext ??= (async () => {
      const inputs = await resolveBaseContext();
      return inputs === undefined
        ? undefined
        : ResolveRenderContext.resolve(this.app, inputs, registry);
    })();
    return this.resolvedContext;
  }
}
