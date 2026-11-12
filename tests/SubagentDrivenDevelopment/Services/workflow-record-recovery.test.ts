import { execFileSync } from "node:child_process";
import type {
  SpawnSyncOptionsWithBufferEncoding,
  SpawnSyncOptionsWithStringEncoding,
  SpawnSyncReturns,
} from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { expect, test } from "vitest";

import type { Application } from "@/Foundation/Application";
import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { GitService } from "@/Git/Services/GitService";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { WorkflowRecordsCommitter } from "@/SubagentDrivenDevelopment/Services/WorkflowRecordsCommitter";

import { applicationFixture } from "../../helpers/ApplicationFixture";
import { repoRoot } from "../../helpers/TemporaryDirectories";
import { execute, fixture, invokeAsync } from "../helpers/helpers";

function stringEncoding(
  options: SpawnSyncOptionsWithStringEncoding | SpawnSyncOptionsWithBufferEncoding,
): options is SpawnSyncOptionsWithStringEncoding {
  return typeof options.encoding === "string" && options.encoding !== "buffer";
}

class InterruptingGitService extends GitService {
  public interrupt: "add" | "commit" | undefined;

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
        (this.interrupt === "commit" && args[0] === "commit"))
    ) {
      this.interrupt = undefined;
      throw new Error("simulated interruption");
    }
    return result;
  }
}

async function setup() {
  const { repo } = fixture();
  const created = await execute(repo, (services) =>
    services.featureCreationService.create({ title: "Record recovery", author: "controller" }),
  );
  expect(created.status, created.stderr).toBe(0);
  const parent = join(dirname(repo), "external");
  mkdirSync(parent);
  const started = await invokeAsync(repo, [
    "start",
    "--spec",
    JSON.parse(created.stdout).spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(started.status, started.stderr).toBe(0);
  const { featureWorkspace: root, spec } = JSON.parse(started.stdout) as {
    featureWorkspace: string;
    spec: string;
  };
  const app = applicationFixture(root, join(repoRoot, "src/Assets/Blueprints"));
  await new LoadProjectConfiguration().bootstrap(app);
  await app.boot();
  const feature = (await app.make(FeatureInspectionService)).resolveFeature(spec);
  const git = new InterruptingGitService(app);
  const committer = new WorkflowRecordsCommitter(app, git);
  writeFileSync(spec, `${readFileSync(spec, "utf8")}\nNew requirement.\n`);
  return { root, spec, feature, git, committer };
}

test.each(["add", "commit"] as const)(
  "resumes canonical record commit after interruption following %s",
  async (interrupted) => {
    const { root, spec, feature, git, committer } = await setup();
    const before = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    git.interrupt = interrupted;
    expect(() => committer.commit(feature, true)).toThrow("simulated interruption");
    const after = committer.commit(feature, true);
    expect(after).toBe(
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    );
    expect(
      execFileSync("git", ["rev-list", "--count", `${before}..HEAD`], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ).toBe("1");
    expect(readFileSync(spec, "utf8")).toContain("New requirement.");
    expect(committer.commit(feature, true)).toBeUndefined();
  },
);

test("refuses recovery when journalled records have changed and preserves staged content", async () => {
  const { root, spec, feature, git, committer } = await setup();
  git.interrupt = "add";
  expect(() => committer.commit(feature, true)).toThrow("simulated interruption");
  writeFileSync(spec, `${readFileSync(spec, "utf8")}\nUnexpected change.\n`);
  expect(() => committer.commit(feature, true)).toThrow("changed during recovery");
  expect(readFileSync(spec, "utf8")).toContain("Unexpected change.");
  expect(
    execFileSync("git", ["show", ":.scratch/0001-record-recovery/spec.md"], {
      cwd: root,
      encoding: "utf8",
    }),
  ).not.toContain("Unexpected change.");
});

test("does not commit workflow records during an existing merge", async () => {
  const { root, spec, feature, committer } = await setup();
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("checkout", "-qb", "unrelated-branch");
  writeFileSync(join(root, "unrelated.ts"), "other work\n");
  git("add", "unrelated.ts");
  git("commit", "-qm", "other work");
  git("checkout", "-q", "features/0001-record-recovery");
  const before = git("rev-parse", "HEAD");
  git("merge", "--no-ff", "--no-commit", "unrelated-branch");
  expect(() => committer.commit(feature, true)).toThrow("existing Git operation");
  expect(git("rev-parse", "HEAD")).toBe(before);
  expect(git("rev-parse", "--verify", "MERGE_HEAD")).toBe(git("rev-parse", "unrelated-branch"));
  expect(readFileSync(spec, "utf8")).toContain("New requirement.");
});

test("does not bypass an active Git hook while committing workflow records", async () => {
  const { root, feature, committer } = await setup();
  const hook = execFileSync("git", ["rev-parse", "--git-path", "hooks/pre-commit"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  writeFileSync(resolve(root, hook), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  expect(() => committer.commit(feature, true)).toThrow("Active Git hook");
  expect(
    execFileSync("git", ["diff", "--cached", "--name-only"], {
      cwd: root,
      encoding: "utf8",
    }),
  ).toBe("");
});

test("commits canonical report paths literally", async () => {
  const { root, feature, committer } = await setup();
  const report = join(dirname(feature.spec), "reports", "[review].md");
  writeFileSync(report, "Reviewed.\n");
  const commit = committer.commit(feature, true);
  expect(commit).toBeTruthy();
  expect(
    execFileSync("git", ["show", "HEAD:.scratch/0001-record-recovery/reports/[review].md"], {
      cwd: root,
      encoding: "utf8",
    }),
  ).toBe("Reviewed.\n");
});
