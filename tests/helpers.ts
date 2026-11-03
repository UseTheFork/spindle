import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";

const cli = resolve(process.cwd(), "src/index.ts");
const tsxLoader = import.meta.resolve("tsx");

export async function makeTempDir(prefix = "spindle-cli-") {
  const parent = join(process.cwd(), "tests", ".generated");
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, prefix));
}

// Runs the real CLI in `project`; node and tsx use absolute paths, and callers supply the desired PATH.
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

// Build an explicit catalog for the source files authored by legacy CLI fixture
// helpers. This is test setup only: the production CLI never discovers content
// from filenames or directory layouts.
function writeFixtureCatalog(blueprints: string) {
  const catalogPath = join(blueprints, "catalog.yaml");
  if (existsSync(catalogPath)) return;

  const filesUnder = (root: string, predicate: (path: string) => boolean): string[] => {
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.isFile() && predicate(path)) files.push(path.slice(root.length + 1));
      }
    };
    if (existsSync(root)) visit(root);
    return files.sort();
  };
  const entries = (paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, { path, status: "active", stacks: [] }]));
  const skillPaths = existsSync(join(blueprints, "skills"))
    ? readdirSync(join(blueprints, "skills"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(entry.name, ""))
        .filter((path) => existsSync(join(blueprints, "skills", path, "SKILL.md")))
        .map((path) => `${path.replaceAll("\\", "/").replace(/\/?$/, "/")}`)
    : [];
  const catalog = {
    agents: entries(filesUnder(join(blueprints, "agents"), (path) => path.endsWith(".agent.md"))),
    instructions: entries(
      filesUnder(join(blueprints, "instructions"), (path) => path.endsWith(".instructions.md")),
    ),
    skills: Object.fromEntries(
      skillPaths.map((path) => [path, { path, status: "active", stacks: [] }]),
    ),
  };
  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
}

export function runCliWithFixtureCatalog(
  project: string,
  args: string[],
  searchPath: string,
  env: Record<string, string> = {},
) {
  const blueprints = env.SPINDLE_BLUEPRINTS_DIR;
  if (blueprints) writeFixtureCatalog(blueprints);
  return runCli(project, args, searchPath, env);
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

export function runCliInteractiveWithFixtureCatalog(
  project: string,
  args: string[],
  searchPath: string,
  responses: { trigger: string; input: string; beforeInput?: () => void }[],
  env: Record<string, string> = {},
) {
  const blueprints = env.SPINDLE_BLUEPRINTS_DIR;
  if (blueprints) writeFixtureCatalog(blueprints);
  return runCliInteractive(project, args, searchPath, responses, env);
}
