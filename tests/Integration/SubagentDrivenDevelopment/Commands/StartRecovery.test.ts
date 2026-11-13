import { execFileSync } from "node:child_process";
import type {
  SpawnSyncOptionsWithBufferEncoding,
  SpawnSyncOptionsWithStringEncoding,
  SpawnSyncReturns,
} from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test } from "vitest";

import type { Application } from "@/Foundation/Application";
import { LoadProjectSettings } from "@/Foundation/Bootstrap/LoadProjectSettings";
import { GitService } from "@/Git/Services/GitService";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { FeatureWorktreeService } from "@/SubagentDrivenDevelopment/Services/FeatureWorktreeService";

import { applicationFixture } from "../../../Helpers/ApplicationFixture";
import { execute, fixture } from "../../../Helpers/SubagentDrivenDevelopment/helpers";
import { repoRoot } from "../../../Helpers/TemporaryDirectories";

function stringEncoding(
  options: SpawnSyncOptionsWithStringEncoding | SpawnSyncOptionsWithBufferEncoding,
): options is SpawnSyncOptionsWithStringEncoding {
  return typeof options.encoding === "string" && options.encoding !== "buffer";
}

class InterruptingGitService extends GitService {
  public interrupt: "add" | "commit" | "worktree" | undefined;

  public constructor(app: Application) {
    super(app);
  }

  public override run(
    args: string[],
    options: SpawnSyncOptionsWithStringEncoding,
  ): SpawnSyncReturns<string>;
  public override run(
    args: string[],
    options: SpawnSyncOptionsWithBufferEncoding,
  ): SpawnSyncReturns<Buffer>;
  public override run(
    args: string[],
    options: SpawnSyncOptionsWithStringEncoding | SpawnSyncOptionsWithBufferEncoding,
  ): SpawnSyncReturns<string | Buffer> {
    const result = stringEncoding(options) ? super.run(args, options) : super.run(args, options);
    if (
      result.status === 0 &&
      ((this.interrupt === "add" && args[0] === "add") ||
        (this.interrupt === "commit" && args[0] === "commit") ||
        (this.interrupt === "worktree" && args[0] === "worktree" && args[1] === "add"))
    ) {
      this.interrupt = undefined;
      throw new Error("simulated interruption");
    }
    return result;
  }
}

async function setup() {
  const { repo, git: command } = fixture();
  const created = await execute(repo, (services) =>
    services.featureCreationService.create({ title: "Resume start", author: "controller" }),
  );
  expect(created.status, created.stderr).toBe(0);
  const spec = JSON.parse(created.stdout).spec as string;
  const parent = join(dirname(repo), "external");
  mkdirSync(parent);
  const app = applicationFixture(repo, join(repoRoot, "assets/Blueprints"));
  await new LoadProjectSettings().bootstrap(app);
  await app.boot();
  const git = new InterruptingGitService(app);
  const service = new FeatureWorktreeService(
    app,
    git,
    await app.make(FeatureInspectionService),
    await app.make(WorkspaceTransaction),
  );
  return {
    repo,
    spec,
    command,
    git,
    service,
    options: { spec, workspace: parent, confirmRecords: true },
  };
}

test.each(["add", "commit", "worktree"] as const)(
  "recovers feature startup after interruption following %s",
  async (interrupted) => {
    const { command, git, service, options } = await setup();
    const before = command("rev-parse", "HEAD");
    git.interrupt = interrupted;
    expect(() => service.start(options)).toThrow("simulated interruption");
    const result = service.start(options);
    expect(result.phase).toBe("created");
    expect(command("rev-list", "--count", `${before}..HEAD`)).toBe("1");
    expect(command("rev-parse", result.featureBranch)).toBe(result.featureRevision);
    expect(
      execFileSync("git", ["branch", "--show-current"], {
        cwd: result.featureWorkspace,
        encoding: "utf8",
      }).trim(),
    ).toBe(result.featureBranch);
    expect(service.start(options).stateFile).toBe(result.stateFile);
    expect(command("status", "--porcelain")).toBe("");
  },
);

test("startup recovery preserves records changed after staging", async () => {
  const { repo, spec, git, service, options } = await setup();
  git.interrupt = "add";
  expect(() => service.start(options)).toThrow("simulated interruption");
  writeFileSync(spec, `${readFileSync(spec, "utf8")}\nUnsaved changes.\n`);
  expect(() => service.start(options)).toThrow("Staged feature records differ");
  expect(readFileSync(spec, "utf8")).toContain("Unsaved changes.");
  expect(
    execFileSync("git", ["show", ":.scratch/0001-resume-start/spec.md"], {
      cwd: repo,
      encoding: "utf8",
    }),
  ).not.toContain("Unsaved changes.");
});

test("startup recovery preserves new work in an interrupted feature worktree", async () => {
  const { spec, git, service, options } = await setup();
  git.interrupt = "worktree";
  expect(() => service.start(options)).toThrow("simulated interruption");
  const statePath = join(
    dirname(dirname(dirname(spec))),
    ".git",
    "spindle-feature-start",
    "0001-resume-start.json",
  );
  const state = JSON.parse(readFileSync(statePath, "utf8")) as { featureWorkspace: string };
  const work = join(state.featureWorkspace, "new-work.ts");
  writeFileSync(work, "preserve this work\n");
  expect(() => service.start(options)).toThrow("checkout is not clean");
  expect(readFileSync(work, "utf8")).toBe("preserve this work\n");
});
