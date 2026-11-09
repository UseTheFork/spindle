import nunjucks from "nunjucks";

const environment = new nunjucks.Environment(null, {
  autoescape: false,
  throwOnUndefined: true,
});

function missingComputedOutput(source: string, error: unknown) {
  if (!(error instanceof Error)) return undefined;
  const location = /\[Line (\d+), Column (\d+)\]/.exec(error.message);
  if (!location) return undefined;

  const line = Number(location[1]);
  const column = Number(location[2]);
  let lineStart = 0;
  for (let currentLine = 1; currentLine < line; currentLine += 1) {
    const newline = source.indexOf("\n", lineStart);
    if (newline < 0) return undefined;
    lineStart = newline + 1;
  }
  const offset = lineStart + column - 1;
  const opening = source.lastIndexOf("{{", offset);
  const closing = source.indexOf("}}", offset);
  if (opening < 0 || closing < 0) return undefined;

  const expression = source.slice(opening + 2, closing);
  return /^\s*computed(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*(?:"([^"]*)"|'([^']*)')\s*\])/
    .exec(expression)
    ?.slice(1)
    .find((name) => name !== undefined);
}

export interface RenderInputs {
  readonly stacks?: readonly string[];
  readonly variables?: Readonly<Record<string, string>>;
}

export interface RenderContext {
  readonly stacks: string[];
  readonly variables: Record<string, string>;
  readonly computed?: Record<string, string>;
}

export function renderText(source: string, context: RenderContext): string {
  try {
    return environment.renderString(source, context);
  } catch (error) {
    const name = missingComputedOutput(source, error);
    if (name !== undefined) {
      throw new Error(`Unknown computed output 'computed.${name}'.`, { cause: error });
    }
    throw error;
  }
}
