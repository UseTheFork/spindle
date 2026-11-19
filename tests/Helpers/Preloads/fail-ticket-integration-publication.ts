import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";

const rename = fs.rename;
let writes = 0;
fs.rename = async (source, destination) => {
  const failureAt = Number(process.env.SPINDLE_TEST_FAIL_WRITE ?? "2");
  if (String(destination) === process.env.SPINDLE_TEST_LEDGER && ++writes === failureAt) {
    throw new Error("Injected failure publishing the completed integration.");
  }
  await rename(source, destination);
};
syncBuiltinESMExports();
