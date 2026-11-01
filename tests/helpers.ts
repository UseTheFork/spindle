import { spawn, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";

const cli = resolve(process.cwd(), "src/index.ts");
const tsxLoader = import.meta.resolve("tsx");

export async function makeTempDir(prefix = "spindle-cli-") {
  const parent = join(process.cwd(), ".scratch");
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, prefix));
}

// A directory holding a stub executable `just`, so the prerequisite check passes.
export async function makeJustStubDir() {
  const directory = await makeTempDir("spindle-just-");
  const name = process.platform === "win32" ? "just.exe" : "just";
  await writeFile(join(directory, name), "#!/bin/sh\nexit 0\n");
  await chmod(join(directory, name), 0o755);
  return directory;
}

// Runs the real CLI in `project`; node and tsx are addressed by absolute path so `searchPath` is free to exclude them.
// Colors are off unless a test opts in, so output assertions stay independent of the parent's terminal.
export function runCli(
  project: string,
  args: string[],
  searchPath: string,
  env: Record<string, string> = {},
) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, ...args], {
    cwd: project,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", ...env, PATH: searchPath, Path: searchPath },
  });
}

export function runCliInteractive(
  project: string,
  args: string[],
  searchPath: string,
  responses: { trigger: string; input: string; beforeInput?: () => void }[],
  env: Record<string, string> = {},
) {
  const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const command = `stty cols 100 rows 30; ${[process.execPath, "--import", tsxLoader, cli, ...args]
    .map(shellQuote)
    .join(" ")}`;
  return new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn("script", ["-qfec", command, "/dev/null"], {
        cwd: project,
        env: { ...process.env, FORCE_COLOR: "0", ...env, PATH: searchPath, Path: searchPath },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const pending = [...responses];
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Interactive CLI timed out. Output: ${stdout}\n${stderr}`));
      }, 15_000);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        // oxlint-disable-next-line no-control-regex -- Remove terminal escape sequences from PTY output.
        const visibleOutput = stdout.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
        for (let index = 0; index < pending.length;) {
          if (visibleOutput.includes(pending[index].trigger)) {
            const [response] = pending.splice(index, 1);
            try {
              response.beforeInput?.();
              child.stdin.write(response.input);
            } catch (error) {
              clearTimeout(timer);
              child.kill();
              reject(error);
              return;
            }
          } else {
            index += 1;
          }
        }
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (status) => {
        clearTimeout(timer);
        resolve({ status, stdout, stderr });
      });
    },
  );
}

export function pathWith(directory: string) {
  return `${directory}${delimiter}${process.env.PATH ?? ""}`;
}
