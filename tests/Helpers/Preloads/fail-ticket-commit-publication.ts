import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";

const rename = fs.rename;
let writes = 0;
fs.rename = async (source, destination) => {
  if (String(destination) === process.env.SPINDLE_TEST_LEDGER && ++writes === 2) {
    throw new Error("Injected failure publishing the completed commit.");
  }
  await rename(source, destination);
};
syncBuiltinESMExports();
