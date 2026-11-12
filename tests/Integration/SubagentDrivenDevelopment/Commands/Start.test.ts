import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test } from "vitest";

import { execute, fixture, invokeAsync } from "../../../Helpers/SubagentDrivenDevelopment/helpers";

async function setup() {
  const { repo, git } = fixture();
  const created = await execute(repo, (services) =>
    services.featureCreationService.create({ title: "Worktree feature", author: "controller" }),
  );
  expect(created.status, created.stderr).toBe(0);
  const spec = JSON.parse(created.stdout).spec as string;
  const parent = join(dirname(repo), "worktrees");
  mkdirSync(parent);
  return { repo, git, spec, parent };
}

test("start commits only the feature records and creates an isolated worktree", async () => {
  const { repo, git, spec, parent } = await setup();
  const originalBranch = git("branch", "--show-current");
  const originalRevision = git("rev-parse", "HEAD");
  const result = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(result.status, result.stderr).toBe(0);
  const envelope = JSON.parse(result.stdout);
  expect(envelope).toMatchObject({ ok: true, data: expect.any(Object) });
  const output = envelope.data as {
    originalWorkspace: string;
    originalBranch: string;
    originalRevision: string;
    featureBranch: string;
    featureWorkspace: string;
    featureRevision: string;
    stateFile: string;
    spec: string;
    phase: string;
  };
  expect(output.originalBranch).toBe(originalBranch);
  expect(output.originalRevision).toBe(originalRevision);
  expect(output.originalWorkspace).toBe(repo);
  expect(output.featureBranch).toBe("features/0001-worktree-feature");
  expect(output.featureWorkspace).toBe(join(parent, "0001-worktree-feature"));
  expect(output.phase).toBe("created");
  expect(git("branch", "--show-current")).toBe(originalBranch);
  expect(git("rev-parse", "HEAD")).toBe(output.featureRevision);
  expect(git("status", "--porcelain")).toBe("");
  expect(git("diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n")).toEqual([
    ".scratch/0001-worktree-feature/sdd.json",
    ".scratch/0001-worktree-feature/spec.md",
  ]);
  expect(
    execFileSync("git", ["branch", "--show-current"], {
      cwd: output.featureWorkspace,
      encoding: "utf8",
    }).trim(),
  ).toBe(output.featureBranch);
  expect(readFileSync(output.spec, "utf8")).toBe(readFileSync(spec, "utf8"));
  expect(existsSync(join(output.featureWorkspace, ".scratch/0001-worktree-feature/tickets"))).toBe(
    true,
  );
  expect(existsSync(join(output.featureWorkspace, ".scratch/0001-worktree-feature/reports"))).toBe(
    true,
  );
  expect(JSON.parse(readFileSync(output.stateFile, "utf8"))).toMatchObject({
    originalBranch,
    originalRevision,
    featureRevision: output.featureRevision,
    featureWorkspace: output.featureWorkspace,
    phase: "created",
  });
  const status = await invokeAsync(output.featureWorkspace, ["status", "--spec", output.spec]);
  expect(status.status, status.stderr).toBe(0);
  expect(JSON.parse(status.stdout)).toMatchObject({ ok: true, data: expect.any(Object) });
});

test("start uses the existing revision without creating an empty commit", async () => {
  const { repo, git, spec, parent } = await setup();
  git("add", ".scratch/0001-worktree-feature");
  git("commit", "-qm", "prepare feature records");
  const before = git("rev-parse", "HEAD");
  const result = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(result.status, result.stderr).toBe(0);
  expect(git("rev-parse", "HEAD")).toBe(before);
  const envelope = JSON.parse(result.stdout);
  expect(envelope).toMatchObject({ ok: true, data: expect.any(Object) });
  expect(envelope.data.featureRevision).toBe(before);
});

test("competing starts resume the same branch, state, and worktree", async () => {
  const { repo, git, spec, parent } = await setup();
  const before = git("rev-parse", "HEAD");
  const args = ["start", "--spec", spec, "--workspace", parent, "--confirm-records"];
  const results = await Promise.all([invokeAsync(repo, args), invokeAsync(repo, args)]);
  expect(results.map((result) => result.status)).toEqual([0, 0]);
  const winnerEnvelope = JSON.parse(results[0]!.stdout);
  const nextEnvelope = JSON.parse(results[1]!.stdout);
  expect(winnerEnvelope).toMatchObject({ ok: true, data: expect.any(Object) });
  expect(nextEnvelope).toMatchObject({ ok: true, data: expect.any(Object) });
  const winner = winnerEnvelope.data as {
    featureRevision: string;
    featureWorkspace: string;
    stateFile: string;
  };
  expect(nextEnvelope.data).toMatchObject(winner);
  expect(git("rev-list", "--count", `${before}..HEAD`)).toBe("1");
  expect(git("rev-parse", "features/0001-worktree-feature")).toBe(winner.featureRevision);
  expect(JSON.parse(readFileSync(winner.stateFile, "utf8")).phase).toBe("created");
  expect(existsSync(join(winner.featureWorkspace, ".git"))).toBe(true);
});

test("start refuses unrelated changes before creating a commit, branch, or state", async () => {
  const { repo, git, spec, parent } = await setup();
  writeFileSync(join(repo, "tracked.txt"), "unrelated change\n");
  git("add", "tracked.txt");
  const before = git("rev-parse", "HEAD");
  const result = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/unrelated uncommitted changes/);
  expect(git("rev-parse", "HEAD")).toBe(before);
  expect(git("diff", "--cached", "--name-only")).toBe("tracked.txt");
  expect(existsSync(join(parent, "0001-worktree-feature"))).toBe(false);
  expect(existsSync(join(repo, ".git/spindle-feature-start/0001-worktree-feature.json"))).toBe(
    false,
  );
});

test("start preserves staged feature content that differs from the worktree", async () => {
  const { repo, git, spec, parent } = await setup();
  git("add", ".scratch/0001-worktree-feature/spec.md");
  const staged = git("show", ":.scratch/0001-worktree-feature/spec.md");
  writeFileSync(spec, `${readFileSync(spec, "utf8")}\nUnstaged requirement.\n`);
  const result = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/staged feature records differ/i);
  expect(git("show", ":.scratch/0001-worktree-feature/spec.md")).toBe(staged);
  expect(readFileSync(spec, "utf8")).toContain("Unstaged requirement.");
});

test("start requires record confirmation and rejects unexpected or ignored feature files", async () => {
  const { repo, git, spec, parent } = await setup();
  const before = git("rev-parse", "HEAD");
  const missingConfirmation = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    parent,
  ]);
  expect(missingConfirmation.status).not.toBe(0);
  expect(missingConfirmation.stderr).toMatch(/confirm-records/);
  const secret = join(dirname(spec), ".env");
  writeFileSync(secret, "credential-like data\n");
  const unexpected = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(unexpected.status).not.toBe(0);
  expect(unexpected.stderr).toMatch(/unexpected feature file/i);
  expect(git("rev-parse", "HEAD")).toBe(before);
  expect(readFileSync(secret, "utf8")).toBe("credential-like data\n");

  writeFileSync(join(repo, ".git/info/exclude"), ".scratch/0001-worktree-feature/.env\n");
  const ignored = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(ignored.status).not.toBe(0);
  expect(ignored.stderr).toMatch(/ignored feature files/i);
  expect(git("rev-parse", "HEAD")).toBe(before);
});

test("start refuses active Git hooks instead of bypassing them", async () => {
  const { repo, git, spec, parent } = await setup();
  const hook = join(repo, ".git/hooks/pre-commit");
  writeFileSync(hook, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const before = git("rev-parse", "HEAD");
  const result = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/active Git hook/i);
  expect(git("rev-parse", "HEAD")).toBe(before);
  expect(existsSync(join(parent, "0001-worktree-feature"))).toBe(false);
});

test("start preserves ledgers that refer to reports in the original checkout", async () => {
  const { repo, git, spec, parent } = await setup();
  const ledgerPath = join(dirname(spec), "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  const report = join(dirname(spec), "reports", "retrospective.md");
  writeFileSync(report, "Report.\n");
  ledger.delivery.finished = {
    at: "2026-01-01T00:00:00.000Z",
    author: "controller",
    report,
    reportSha256: "a".repeat(64),
  };
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const before = git("rev-parse", "HEAD");
  const result = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/ledger contains paths to the original/i);
  expect(readFileSync(report, "utf8")).toBe("Report.\n");
  expect(git("rev-parse", "HEAD")).toBe(before);
});

test("start preserves unmerged feature entries without staging a conflict", async () => {
  const { repo, git, spec, parent } = await setup();
  git("add", ".scratch/0001-worktree-feature");
  git("commit", "-qm", "prepare feature records");
  const originalBranch = git("branch", "--show-current");
  git("checkout", "-qb", "conflict-side");
  writeFileSync(spec, "side version\n");
  git("add", ".scratch/0001-worktree-feature/spec.md");
  git("commit", "-qm", "side");
  git("checkout", "-q", originalBranch);
  writeFileSync(spec, "original version\n");
  git("add", ".scratch/0001-worktree-feature/spec.md");
  git("commit", "-qm", "original");
  expect(() => git("merge", "conflict-side")).toThrow();
  const before = git("ls-files", "--unmerged");
  expect(before).not.toBe("");
  const result = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/unmerged/i);
  expect(git("ls-files", "--unmerged")).toBe(before);
  expect(existsSync(join(parent, "0001-worktree-feature"))).toBe(false);
});

test("start preserves existing paths and branches and rejects internal or missing directories", async () => {
  const { repo, git, spec, parent } = await setup();
  const path = join(parent, "0001-worktree-feature");
  mkdirSync(path);
  writeFileSync(join(path, "keep"), "keep\n");
  const before = git("rev-parse", "HEAD");
  const collision = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(collision.status).not.toBe(0);
  expect(collision.stderr).toMatch(/destination already exists/);
  expect(readFileSync(join(path, "keep"), "utf8")).toBe("keep\n");
  expect(git("rev-parse", "HEAD")).toBe(before);
  const internal = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    repo,
    "--confirm-records",
  ]);
  expect(internal.status).not.toBe(0);
  expect(internal.stderr).toMatch(/outside/);
  const missing = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    join(parent, "missing"),
    "--confirm-records",
  ]);
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toMatch(/existing real directory/);

  const otherParent = join(dirname(repo), "other-worktrees");
  mkdirSync(otherParent);
  git("branch", "features/0001-worktree-feature");
  const branch = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    otherParent,
    "--confirm-records",
  ]);
  expect(branch.status).not.toBe(0);
  expect(branch.stderr).toMatch(/branch already exists/);
  expect(git("rev-parse", "HEAD")).toBe(before);
  expect(git("rev-parse", "features/0001-worktree-feature")).toBe(before);
});

test("start accepts a parent directory inside another checkout", async () => {
  const { repo, git, spec, parent } = await setup();
  execFileSync("git", ["init", "-q", parent]);
  const result = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(result.status, result.stderr).toBe(0);
  expect(git("status", "--porcelain")).toBe("");
  expect(existsSync(join(parent, "0001-worktree-feature", ".git"))).toBe(true);
});

test("interrupted startup resumes the journalled allocated directory", async () => {
  const { repo, git, spec, parent } = await setup();
  const bin = join(dirname(repo), "bin");
  mkdirSync(bin);
  const gitPath = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  writeFileSync(
    join(bin, "git"),
    `#!/bin/sh\nif [ "$1" = "worktree" ] && [ "$2" = "add" ]; then exit 77; fi\nexec "${gitPath}" "$@"\n`,
    { mode: 0o755 },
  );
  const result = await invokeAsync(
    repo,
    ["start", "--spec", spec, "--workspace", parent, "--confirm-records"],
    {
      env: { PATH: `${bin}:${process.env.PATH ?? ""}` },
    },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/inspect and preserve/);
  const stateFile = join(repo, ".git/spindle-feature-start/0001-worktree-feature.json");
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  expect(state.phase).toBe("allocated");
  expect(state.featureRevision).toBe(git("rev-parse", "HEAD"));
  expect(existsSync(state.featureWorkspace)).toBe(true);
  const retry = await invokeAsync(repo, [
    "start",
    "--spec",
    spec,
    "--workspace",
    parent,
    "--confirm-records",
  ]);
  expect(retry.status, retry.stderr).toBe(0);
  const resumed = JSON.parse(readFileSync(stateFile, "utf8"));
  expect(resumed).toMatchObject({
    id: state.id,
    phase: "created",
    featureRevision: state.featureRevision,
    targetIdentity: state.targetIdentity,
  });
  expect(git("rev-parse", "features/0001-worktree-feature")).toBe(state.featureRevision);
  expect(existsSync(state.featureWorkspace)).toBe(true);
  expect(JSON.parse(retry.stdout)).toMatchObject({ ok: true, data: expect.any(Object) });
});
