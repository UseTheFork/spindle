import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const originalReadFileSync = fs.readFileSync;
const originalWriteFileSync = fs.writeFileSync;
const originalExistsSync = fs.existsSync;
let paused = false;

const readFileSync = (...args: Parameters<typeof fs.readFileSync>) => {
  const [path] = args;
  if (!paused && String(path) === process.env.SPINDLE_TEST_READY_TARGET) {
    paused = true;
    originalWriteFileSync(process.env.SPINDLE_TEST_READY_PAUSE!, "paused");
    const signal = new Int32Array(new SharedArrayBuffer(4));
    const deadline = Date.now() + 15_000;
    while (!originalExistsSync(process.env.SPINDLE_TEST_READY_RESUME!) && Date.now() < deadline) {
      Atomics.wait(signal, 0, 0, 10);
    }
  }
  return Reflect.apply(originalReadFileSync, fs, args) as ReturnType<typeof fs.readFileSync>;
};
fs.readFileSync = readFileSync as typeof fs.readFileSync;

syncBuiltinESMExports();
