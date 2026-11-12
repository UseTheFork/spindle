import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname } from "node:path";

const writeFile = fs.promises.writeFile;

fs.promises.writeFile = async (path, data, options) => {
  const parent = typeof path === "string" ? dirname(path) : "";
  if (
    parent === process.env.SPINDLE_TEST_FAIL_WRITE_DIR ||
    dirname(parent) === process.env.SPINDLE_TEST_FAIL_WRITE_DIR
  ) {
    await writeFile(path, "partial write\n", options);
    throw Object.assign(new Error("Injected ENOSPC while writing Agent"), { code: "ENOSPC" });
  }
  return writeFile(path, data, options);
};

syncBuiltinESMExports();
