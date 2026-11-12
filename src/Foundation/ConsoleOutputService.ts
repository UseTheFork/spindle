import chalk from "chalk";

export type ConsoleOutputMode = "human" | "json";
export type ConsoleOutputLevel = "success" | "info" | "warning";

export interface ConsoleResult<T> {
  readonly level: "success" | "info";
  readonly human: string | readonly string[];
  readonly data: T;
}

export class ConsoleOutputService {
  private mode: ConsoleOutputMode = "human";

  public setMode(mode: ConsoleOutputMode): void {
    this.mode = mode;
  }

  public result<T>({ level, human, data }: ConsoleResult<T>): void {
    if (this.mode === "json") {
      if (data === undefined) throw new Error("Command results must define JSON data.");
      console.log(JSON.stringify({ ok: true, data }));
      return;
    }
    for (const message of typeof human === "string" ? [human] : human) {
      console.log(this.format(level, message));
    }
  }

  public notice(level: ConsoleOutputLevel, message: string): void {
    console.error(
      this.mode === "json" ? JSON.stringify({ level, message }) : this.format(level, message),
    );
  }

  public error(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      this.mode === "json"
        ? JSON.stringify({ ok: false, error: { message } })
        : `${chalk.red.bold("spindle:")} ${message}`,
    );
  }

  private format(level: ConsoleOutputLevel, message: string): string {
    if (level === "success") return `${chalk.green("✔")} ${message}`;
    if (level === "warning") return chalk.yellow(message);
    return message;
  }
}
