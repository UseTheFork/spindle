#!/usr/bin/env node
import { ConsoleOutputService } from "@/Foundation/ConsoleOutputService";
import { SpindleExecutable } from "@/SpindleExecutable";

if (import.meta.main) {
  const output = new ConsoleOutputService();
  SpindleExecutable.run(process.argv.slice(2), process.cwd(), output).catch((error: unknown) => {
    output.error(error);
    process.exitCode = 1;
  });
}
