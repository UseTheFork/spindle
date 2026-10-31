import nunjucks from "nunjucks";

const environment = new nunjucks.Environment(null, {
  autoescape: false,
  throwOnUndefined: true,
});

export interface RenderContext {
  stacks: string[];
  variables: Record<string, string>;
}

export function renderText(source: string, context: RenderContext) {
  return environment.renderString(source, context);
}
