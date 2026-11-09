import { cancel, isCancel, multiselect, select, text } from "@clack/prompts";

import type { VariableDefinition } from "@/BlueprintManagement/Rendering/Variables";

function ensureAnswer<T>(answer: T | symbol): T {
  // clack signals cancellation with a unique symbol
  if (typeof answer === "symbol" && isCancel(answer)) {
    cancel("Cancelled.");
    throw new Error("Cancelled by user.");
  }
  return answer as T;
}

export async function promptStacks(supported: readonly string[]): Promise<string[]> {
  const answer = await multiselect({
    message: "Which stacks does this project use?",
    options: supported.map((value) => ({ value, label: value })),
    required: true,
  });
  return ensureAnswer<string[]>(answer);
}

export async function promptVariable(definition: VariableDefinition): Promise<string> {
  const answer = await text({
    message: `${definition.name}: ${definition.description}`,
    defaultValue: definition.default,
    initialValue: definition.default,
    validate: (value) =>
      (value ?? "").length === 0 && definition.default === undefined
        ? "A value is required."
        : undefined,
  });
  return ensureAnswer<string>(answer);
}

export async function promptConflict(kind: string, name: string): Promise<"overwrite" | "skip"> {
  const answer = await select<"overwrite" | "skip">({
    message: `${kind} '${name}' already exists. What should happen?`,
    options: [
      { value: "overwrite", label: "Overwrite" },
      { value: "skip", label: "Skip" },
    ],
  });
  return ensureAnswer<"overwrite" | "skip">(answer);
}

export async function promptOutdated(
  kind: string,
  name: string,
  installed: string,
  available: string,
): Promise<"overwrite" | "skip"> {
  const answer = await select<"overwrite" | "skip">({
    message: `${kind} '${name}' is outdated (installed ${installed}, available ${available}). What should happen?`,
    options: [
      { value: "overwrite", label: "Overwrite" },
      { value: "skip", label: "Skip" },
    ],
  });
  return ensureAnswer<"overwrite" | "skip">(answer);
}

export async function promptNewBlueprints(kind: string, names: string[]): Promise<string[]> {
  const answer = await multiselect({
    message: `Which new ${kind}s should be installed?`,
    options: names.map((value) => ({ value, label: value })),
    initialValues: names,
    required: false,
  });
  return ensureAnswer<string[]>(answer);
}
