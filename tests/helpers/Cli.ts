import { execFileSync, spawn, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

import { withCatalogFixture, writeFixtureCatalog } from "./CatalogFixtures.ts";
import { repoRoot } from "./TemporaryDirectories.ts";

const cli = join(repoRoot, "src/index.ts");
const tsconfig = join(repoRoot, "tsconfig.json");
const checkout = repoRoot;
const tsxLoader = import.meta.resolve("tsx");
const catalogLoader = join(repoRoot, "tests/helpers/preloads/load-catalog-fixture.ts");

function nodeArguments(env: Record<string, string>) {
  return [
    "--import",
    tsxLoader,
    ...(env.SPINDLE_TEST_PRELOAD ? ["--import", resolve(repoRoot, env.SPINDLE_TEST_PRELOAD)] : []),
    ...(env.SPINDLE_TEST_CATALOG || env.SPINDLE_TEST_BLUEPRINTS_DIR
      ? ["--import", catalogLoader]
      : []),
    cli,
  ];
}

export function runCli(
  project: string,
  args: string[],
  searchPath: string,
  env: Record<string, string> = {},
) {
  ensureGitWorkspace(project);
  return runCliRaw(project, args, searchPath, env);
}

export function runCliRaw(
  project: string,
  args: string[],
  searchPath: string,
  env: Record<string, string> = {},
) {
  return spawnSync(process.execPath, [...nodeArguments(env), ...args], {
    cwd: project,
    encoding: "utf8",
    env: {
      ...process.env,
      TSX_TSCONFIG_PATH: tsconfig,
      GIT_CEILING_DIRECTORIES: checkout,
      FORCE_COLOR: "0",
      ...env,
      PATH: searchPath,
      Path: searchPath,
    },
  });
}

function ensureGitWorkspace(project: string) {
  let root: string | undefined;
  try {
    root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: project,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Test workspaces are initialized below, rather than inheriting the checkout's Git root.
  }
  if (root !== resolve(project)) {
    execFileSync("git", ["init", "-q"], { cwd: project, stdio: "ignore" });
  }
}

export function runCliWithCatalog(
  project: string,
  args: string[],
  searchPath: string,
  env: Record<string, string> = {},
) {
  return runCli(project, args, searchPath, withCatalogFixture(env));
}

export function runCliWithFixtureCatalog(
  project: string,
  args: string[],
  searchPath: string,
  env: Record<string, string> = {},
) {
  const blueprints = env.SPINDLE_TEST_BLUEPRINTS_DIR;
  if (blueprints) writeFixtureCatalog(blueprints);
  return runCliWithCatalog(project, args, searchPath, env);
}

export function runCliWithFixtureCatalogRaw(
  project: string,
  args: string[],
  searchPath: string,
  env: Record<string, string> = {},
) {
  const blueprints = env.SPINDLE_TEST_BLUEPRINTS_DIR;
  if (blueprints) writeFixtureCatalog(blueprints);
  return runCliRaw(project, args, searchPath, withCatalogFixture(env));
}

export function runCliInteractive(
  project: string,
  args: string[],
  searchPath: string,
  responses: { trigger: string; input: string; beforeInput?: () => void }[],
  env: Record<string, string> = {},
) {
  ensureGitWorkspace(project);
  return runCliInteractiveRaw(project, args, searchPath, responses, env);
}

export function runCliInteractiveRaw(
  project: string,
  args: string[],
  searchPath: string,
  responses: { trigger: string; input: string; beforeInput?: () => void }[],
  env: Record<string, string> = {},
) {
  const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const command = `stty cols 100 rows 30; ${[process.execPath, ...nodeArguments(env), ...args]
    .map(shellQuote)
    .join(" ")}`;
  return new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn("script", ["-qfec", command, "/dev/null"], {
        cwd: project,
        env: {
          ...process.env,
          TSX_TSCONFIG_PATH: tsconfig,
          GIT_CEILING_DIRECTORIES: checkout,
          FORCE_COLOR: "0",
          ...env,
          PATH: searchPath,
          Path: searchPath,
        },
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
  const blueprints = env.SPINDLE_TEST_BLUEPRINTS_DIR;
  if (blueprints) writeFixtureCatalog(blueprints);
  return runCliInteractive(project, args, searchPath, responses, withCatalogFixture(env));
}

export function runCliInteractiveWithFixtureCatalogRaw(
  project: string,
  args: string[],
  searchPath: string,
  responses: { trigger: string; input: string; beforeInput?: () => void }[],
  env: Record<string, string> = {},
) {
  const blueprints = env.SPINDLE_TEST_BLUEPRINTS_DIR;
  if (blueprints) writeFixtureCatalog(blueprints);
  return runCliInteractiveRaw(project, args, searchPath, responses, withCatalogFixture(env));
}
