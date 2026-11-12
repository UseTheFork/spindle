import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";

const originalWriteFile = fs.writeFile.bind(fs);
fs.writeFile = async (path, ...args) => {
  if (String(path) === process.env.SPINDLE_TEST_FAIL_WRITE_FILE) {
    throw Object.assign(new Error("injected Skill file write failure"), { code: "ENOSPC" });
  }
  return originalWriteFile(path, ...args);
};

syncBuiltinESMExports();
