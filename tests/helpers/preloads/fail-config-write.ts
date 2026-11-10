import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";

const originalWriteFile = fs.writeFile.bind(fs);
fs.writeFile = async (path, ...args) => {
  if (String(path).endsWith("/.github/spindle.json")) {
    throw new Error("forced Config write failure");
  }
  return originalWriteFile(path, ...args);
};
syncBuiltinESMExports();
