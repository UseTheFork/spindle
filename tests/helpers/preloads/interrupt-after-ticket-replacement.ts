import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const rename = fs.renameSync;

fs.renameSync = (source, destination) => {
  rename(source, destination);
  if (String(destination) === process.env.SPINDLE_TEST_INTERRUPT_TARGET) {
    process.stdout.write(process.env.SPINDLE_TEST_INTERRUPT_MARKER ?? "");
    process.kill(process.pid, "SIGSTOP");
  }
};

syncBuiltinESMExports();
