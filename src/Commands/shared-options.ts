import { Option } from "commander";

export function once(option: string) {
  let seen = false;
  return (value: string): string => {
    if (seen) {
      throw new Error(`Option '${option}' may only be provided once.`);
    }
    seen = true;
    return value;
  };
}

export function conflictPolicyOption(description: string): Option {
  return new Option("--on-conflict <overwrite|skip>", description).choices(["overwrite", "skip"]);
}

export function noInteractiveOption(description: string): Option {
  return new Option("--no-interactive", description);
}
