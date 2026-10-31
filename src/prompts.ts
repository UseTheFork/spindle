import { cancel, isCancel, multiselect, select, text } from "@clack/prompts";

import type { VariableDefinition } from "./variables.js";

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

export async function promptConflict(skill: string): Promise<"overwrite" | "skip"> {
  const answer = await select<"overwrite" | "skip">({
    message: `Skill '${skill}' already exists. What should happen?`,
    options: [
      { value: "overwrite", label: "Overwrite" },
      { value: "skip", label: "Skip" },
    ],
  });
  return ensureAnswer<"overwrite" | "skip">(answer);
}

export async function promptOutdated(
  skill: string,
  installed: string,
  available: string,
): Promise<"overwrite" | "skip"> {
  const answer = await select<"overwrite" | "skip">({
    message: `Skill '${skill}' is outdated (installed ${installed}, available ${available}). What should happen?`,
    options: [
      { value: "overwrite", label: "Overwrite" },
      { value: "skip", label: "Skip" },
    ],
  });
  return ensureAnswer<"overwrite" | "skip">(answer);
}

export async function promptNewSkills(skills: string[]): Promise<string[]> {
  const answer = await multiselect({
    message: "Which new Skills should be installed?",
    options: skills.map((value) => ({ value, label: value })),
    initialValues: skills,
    required: false,
  });
  return ensureAnswer<string[]>(answer);
}
