import { Option } from "commander";

export class BlueprintCommandOptions {
  public static conflictPolicyOption(description: string): Option {
    return new Option("--on-conflict <overwrite|skip>", description).choices(["overwrite", "skip"]);
  }

  public static noInteractiveOption(description: string): Option {
    return new Option("--no-interactive", description);
  }
}
