import { cancel, isCancel, multiselect, select, text } from "@clack/prompts";

export class BlueprintPrompts {
  private static ensureAnswer<T>(answer: T | symbol): T {
    // clack signals cancellation with a unique symbol
    if (typeof answer === "symbol" && isCancel(answer)) {
      cancel("Cancelled.");
      throw new Error("Cancelled by user.");
    }
    return answer as T;
  }

  public static async promptStacks(supported: readonly string[]): Promise<string[]> {
    const answer = await multiselect({
      message: "Which stacks does this project use?",
      options: supported.map((value) => ({ value, label: value })),
      required: true,
    });
    return BlueprintPrompts.ensureAnswer<string[]>(answer);
  }

  public static async promptSpindlePackageManager(): Promise<string> {
    const answer = await select({
      message: "Which package-manager command should Spindle use in generated guidance?",
      options: [
        { value: "npm run", label: "npm run" },
        { value: "pnpm exec", label: "pnpm exec" },
        { value: "yarn", label: "yarn" },
        { value: "bun", label: "bun" },
        { value: "other", label: "Other" },
      ],
    });
    const selection = BlueprintPrompts.ensureAnswer<string>(answer);
    if (selection !== "other") return selection;

    const custom = await text({
      message: "Enter the package-manager command prefix",
      validate: (value) =>
        (value ?? "").trim().length === 0 ? "A command prefix is required." : undefined,
    });
    return BlueprintPrompts.ensureAnswer<string>(custom).trim();
  }

  public static async promptConflict(kind: string, name: string): Promise<"overwrite" | "skip"> {
    const answer = await select<"overwrite" | "skip">({
      message: `${kind} '${name}' already exists. What should happen?`,
      options: [
        { value: "overwrite", label: "Overwrite" },
        { value: "skip", label: "Skip" },
      ],
    });
    return BlueprintPrompts.ensureAnswer<"overwrite" | "skip">(answer);
  }
}
