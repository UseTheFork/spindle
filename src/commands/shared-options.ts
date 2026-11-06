import { Option } from "commander";

export function conflictPolicyOption(description: string): Option {
  return new Option("--on-conflict <overwrite|skip>", description).choices(["overwrite", "skip"]);
}

export function noInteractiveOption(description: string): Option {
  return new Option("--no-interactive", description);
}
