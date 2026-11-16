import type { TaskFields } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import type { Command } from "commander";

type ListField = "editPaths" | "createPaths" | "referencePaths" | "dependencies";
type ClearOptions = Partial<TaskFields> & {
  clearEditPaths?: boolean;
  clearCreatePaths?: boolean;
  clearReferencePaths?: boolean;
  clearDependencies?: boolean;
};

export class TaskCommandFields {
  public static configure(command: Command, create: boolean): Command {
    const option = create ? "requiredOption" : "option";
    command[option]("--title <title>", "Task title");
    command[option]("--instructions <text>", "Task instructions");
    command[option]("--acceptance-criteria <criteria...>", "Task acceptance criteria");
    command
      .option("--edit-paths <paths...>", "Explicit paths to edit")
      .option("--create-paths <paths...>", "Explicit paths to create")
      .option("--reference-paths <paths...>", "Explicit reference paths")
      .option("--dependencies <tasks...>", "Dependencies in this ticket");
    if (!create) {
      command
        .option("--clear-edit-paths", "Remove all edit paths")
        .option("--clear-create-paths", "Remove all create paths")
        .option("--clear-reference-paths", "Remove all reference paths")
        .option("--clear-dependencies", "Remove all dependencies");
    }
    return command;
  }

  public static lists(options: ClearOptions, create: boolean): void {
    const lists: [ListField, keyof ClearOptions, string][] = [
      ["editPaths", "clearEditPaths", "--edit-paths"],
      ["createPaths", "clearCreatePaths", "--create-paths"],
      ["referencePaths", "clearReferencePaths", "--reference-paths"],
      ["dependencies", "clearDependencies", "--dependencies"],
    ];
    for (const [field, clear, flag] of lists) {
      if (options[clear] && options[field] !== undefined) {
        throw new Error(`${flag} cannot be combined with its clear option.`);
      }
      if (options[clear] || (create && options[field] === undefined)) options[field] = [];
    }
  }
}
