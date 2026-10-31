export interface VariableDefinition {
  name: string;
  description: string;
  default?: string;
}

// All Blueprint kinds share this statically typed Variable namespace.
export const variableDefinitions: readonly VariableDefinition[] = [
  { name: "lint_command", description: "Lint command", default: "just lint" },
  { name: "owner", description: "Team owner", default: "nobody" },
];

export function loadVariableDefinitions(): VariableDefinition[] {
  return variableDefinitions.map((definition) => ({ ...definition }));
}

export function parseVariableFlags(
  flags: string[],
  definitions: VariableDefinition[],
): Record<string, string> {
  const known = new Set(definitions.map((definition) => definition.name));
  const supplied: Record<string, string> = {};
  for (const flag of flags) {
    const separator = flag.indexOf("=");
    if (separator <= 0) {
      throw new Error(`Invalid --var '${flag}'. Use --var <name>=<value>.`);
    }
    const name = flag.slice(0, separator);
    if (!known.has(name)) {
      const available = [...known].join(", ") || "none";
      throw new Error(`Unknown variable '${name}'. Available variables: ${available}.`);
    }
    supplied[name] = flag.slice(separator + 1);
  }
  return supplied;
}
