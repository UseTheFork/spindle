import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";

const originalRemove = fs.rm.bind(fs);
fs.rm = async (path, ...args) => {
  if (String(path) === process.env.SPINDLE_TEST_FAIL_REMOVE_TARGET) {
    throw Object.assign(new Error("forced removal failure"), { code: "EIO" });
  }
  return originalRemove(path, ...args);
};

syncBuiltinESMExports();
