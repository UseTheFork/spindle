import { Service } from "@spindle/Foundation/Service";
import type { ComputedVariableRegistry } from "@spindle/TemplateRendering/Computed/ComputedVariableProvider";
import { computedVariableProviders } from "@spindle/TemplateRendering/Computed/ComputedVariableProviders";
import { ResolveRenderContext } from "@spindle/TemplateRendering/Computed/ResolveRenderContext";
import type { RenderContext, RenderInputs } from "@spindle/TemplateRendering/Rendering/RenderText";

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
