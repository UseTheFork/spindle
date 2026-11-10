import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const writeFile = fs.promises.writeFile;

fs.promises.writeFile = async (path, data, options) => {
  if (path === process.env.SPINDLE_TEST_RACE_AGENT_PATH) {
    await writeFile(path, "created during write\n", { flag: "wx" });
  }
  return writeFile(path, data, options);
};

syncBuiltinESMExports();
