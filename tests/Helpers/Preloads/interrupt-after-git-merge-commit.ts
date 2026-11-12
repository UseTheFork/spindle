import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

const spawn = childProcess.spawnSync;

childProcess.spawnSync = ((command: string, args: string[], options: object) => {
  const result = spawn(command, args, options);
  if (
    command === "git" &&
    args[0] === "commit" &&
    args.includes("-m") &&
    args.some((argument) => argument.startsWith("spindle: merge ")) &&
    result.status === 0
  ) {
    process.stdout.write("INTERRUPTED_AFTER_MERGE_COMMIT");
    process.kill(process.pid, "SIGSTOP");
  }
  return result;
}) as typeof childProcess.spawnSync;

syncBuiltinESMExports();
