import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { expect, test, vi } from "vitest";

import { LoadProjectSettings } from "@/Foundation/Bootstrap/LoadProjectSettings";
import { GitService } from "@/Git/Services/GitService";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { DeliveryService } from "@/SubagentDrivenDevelopment/Services/DeliveryService";
import { FeatureFinalizationService } from "@/SubagentDrivenDevelopment/Services/FeatureFinalizationService";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

import { applicationFixture } from "../../../Helpers/ApplicationFixture";
import {
  cliOutput,
  execute,
  fixture,
  invokeAsync,
} from "../../../Helpers/SubagentDrivenDevelopment/helpers";
import { repoRoot } from "../../../Helpers/TemporaryDirectories";

vi.setConfig({ testTimeout: 60_000 });
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function appAt(root: string) {
  const app = applicationFixture(root, join(repoRoot, "assets/Blueprints"));
  await new LoadProjectSettings().bootstrap(app);
  await app.boot();
  return app;
}
function output(result: { status: number | null; stdout: string; stderr: string }) {
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

test("empty feature and premature final declarations cannot commit records or return completion", async () => {
  const { repo } = fixture();
  const created = output(
    await execute(repo, (s) =>
      s.featureCreationService.create({
        title: "Premature finalization",
        author: "controller",
      }),
    ),
  );
  const parent = join(dirname(repo), "external");
  mkdirSync(parent);
  const started = cliOutput(
    await invokeAsync(repo, [
      "start",
      "--spec",
      created.spec,
      "--workspace",
      parent,
      "--confirm-records",
    ]),
  );
  const before = git(started.featureWorkspace, "rev-parse", "HEAD");
  const finished = await invokeAsync(started.featureWorkspace, [
    "finish",
    "--spec",
    started.spec,
    "--author",
    "controller",
    "--confirm-records",
  ]);
  expect(finished.status).not.toBe(0);
  expect(finished.stderr).toContain("at least one ticket");
  const required = await invokeAsync(started.featureWorkspace, [
    "checks",
    "require",
    "--spec",
    started.spec,
    "--scope",
    "final",
    "--command",
    "test final",
    "--author",
    "controller",
  ]);
  expect(required.status).not.toBe(0);
  expect(required.stderr).toContain("recorded feature merge");
  expect(git(started.featureWorkspace, "rev-parse", "HEAD")).toBe(before);
  expect(existsSync(started.featureWorkspace)).toBe(true);
});

test("finalization refuses active hooks without executing or disabling them", async () => {
  const { repo } = fixture();
  const created = output(
    await execute(repo, (s) =>
      s.featureCreationService.create({
        title: "Hook finalization",
        author: "controller",
      }),
    ),
  );
  const parent = join(dirname(repo), "external");
  mkdirSync(parent);
  const started = cliOutput(
    await invokeAsync(repo, [
      "start",
      "--spec",
      created.spec,
      "--workspace",
      parent,
      "--confirm-records",
    ]),
  );
  const hook = join(repo, ".git", "hooks", "pre-commit");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n");
  chmodSync(hook, 0o755);
  const before = git(started.featureWorkspace, "rev-parse", "HEAD");
  const finished = await invokeAsync(started.featureWorkspace, [
    "finish",
    "--spec",
    started.spec,
    "--author",
    "controller",
    "--confirm-records",
  ]);
  expect(finished.status).not.toBe(0);
  expect(finished.stderr).toContain("Active Git hook");
  expect(git(started.featureWorkspace, "rev-parse", "HEAD")).toBe(before);
  expect(readFileSync(hook, "utf8")).toBe("#!/bin/sh\nexit 1\n");
});

/** Real CLI/service flow: creation, start, isolated dispatch, implementation,
 * checks, ticket review, merge, declared post-merge checks, aggregate review. */
async function readyFeature(codeFile = "feature.ts") {
  const { repo: original } = fixture();
  const originalRevision = git(original, "rev-parse", "HEAD");
  const created = output(
    await execute(original, (s) =>
      s.featureCreationService.create({
        title: "Feature finalization",
        author: "controller",
        requireRetrospective: true,
      }),
    ),
  );
  const parent = join(dirname(original), "external");
  mkdirSync(parent);
  const started = cliOutput(
    await invokeAsync(original, [
      "start",
      "--spec",
      created.spec,
      "--workspace",
      parent,
      "--confirm-records",
    ]),
  );
  const root = started.featureWorkspace as string;
  const spec = started.spec as string;
  const feature = "0001-feature-finalization";
  output(
    await execute(root, (s) =>
      s.ticketService.ticketCreate({
        spec,
        title: "First",
        reporter: "requester",
        category: "enhancement",
        author: "controller",
      }),
    ),
  );
  output(
    await execute(root, (s) =>
      s.checksService.checksRequire({
        spec,
        ticket: "T-0001",
        command: "test ticket",
        author: "controller",
      }),
    ),
  );
  const implemented = output(
    await execute(root, (s) =>
      s.assignmentService.implement({
        spec,
        ticket: "T-0001",
        author: "controller",
        workspace: parent,
        confirmRecords: true,
      }),
    ),
  );
  const ticketRoot = implemented.assignment.workspace as string;
  mkdirSync(dirname(join(ticketRoot, codeFile)), { recursive: true });
  writeFileSync(join(ticketRoot, codeFile), "export const feature = 1;\n");
  git(ticketRoot, "add", codeFile);
  git(ticketRoot, "commit", "-qm", "ticket implementation");
  writeFileSync(implemented.assignment.report, "# Implemented\n");
  const submitted = output(
    await execute(root, (s) =>
      s.submissionService.submit({
        spec,
        ticket: "T-0001",
        role: "implementation",
        author: "controller",
      }),
    ),
  );
  output(
    await execute(root, (s) =>
      s.checksService.checksRecord({
        spec,
        ticket: "T-0001",
        command: "test ticket",
        snapshot: submitted.snapshot,
        result: "passed",
        author: "controller",
      }),
    ),
  );
  const reviewed = output(
    await execute(root, (s) =>
      s.reviewService.review({
        spec,
        ticket: "T-0001",
        inventory: JSON.stringify([codeFile]),
        author: "controller",
      }),
    ),
  );
  for (const assignment of reviewed.assignments) {
    writeFileSync(assignment.report, "# Ticket review\nNo findings.\n");
    output(
      await execute(root, (s) =>
        s.submissionService.submit({
          spec,
          ticket: "T-0001",
          role: "review",
          assignment: assignment.id,
          result: "passed",
          report: assignment.report,
          noFindings: true,
          author: "controller",
        }),
      ),
    );
  }
  cliOutput(
    await invokeAsync(root, [
      "integrate",
      "--spec",
      spec,
      "--ticket",
      "T-0001",
      "--author",
      "controller",
      "--confirm-records",
    ]),
  );
  const postMerge = cliOutput(
    await invokeAsync(root, [
      "checks",
      "require",
      "--spec",
      spec,
      "--ticket",
      "T-0001",
      "--scope",
      "post-merge",
      "--command",
      "test merged ticket",
      "--author",
      "controller",
    ]),
  );
  cliOutput(
    await invokeAsync(root, [
      "checks",
      "record",
      "--spec",
      spec,
      "--ticket",
      "T-0001",
      "--scope",
      "post-merge",
      "--snapshot",
      postMerge.snapshot,
      "--command",
      "test merged ticket",
      "--result",
      "passed",
      "--author",
      "controller",
    ]),
  );
  const declared = output(
    await execute(root, (s) =>
      s.checksService.checksRequire({
        spec,
        ticket: "",
        scope: "delivery",
        command: "test final",
        author: "controller",
      }),
    ),
  );
  output(
    await execute(root, (s) =>
      s.checksService.checksRecord({
        spec,
        ticket: "",
        scope: "delivery",
        command: "test final",
        snapshot: declared.snapshot,
        result: "passed",
        author: "controller",
      }),
    ),
  );
  const deliveryReview = output(
    await execute(root, (s) =>
      s.reviewService.review({
        spec,
        scope: "delivery",
        inventory: JSON.stringify([codeFile]),
        author: "controller",
      }),
    ),
  );
  for (const assignment of deliveryReview.assignments) {
    writeFileSync(assignment.report, "# Delivery review\nNo findings.\n");
    output(
      await execute(root, (s) =>
        s.submissionService.submit({
          spec,
          scope: "delivery",
          ticket: "",
          role: "review",
          assignment: assignment.id,
          report: assignment.report,
          result: "passed",
          noFindings: true,
          author: "controller",
        }),
      ),
    );
  }
  const report = join(dirname(spec), "reports", "retrospective.md");
  writeFileSync(report, "# Retrospective\nReviewed implementation and tests.\n");
  const originalSpec = join(original, ".scratch", feature, "spec.md");
  const journal = join(original, ".git", "spindle-feature-finalization", `${feature}.json`);
  const finish = () =>
    invokeAsync(root, [
      "finish",
      "--spec",
      spec,
      "--report",
      report,
      "--author",
      "controller",
      "--confirm-records",
    ]);
  return {
    root,
    original,
    originalSpec,
    spec,
    feature,
    ticketRoot,
    report,
    journal,
    finish,
    originalRevision,
    featureRevision: started.featureRevision as string,
  };
}

async function recordFinal(
  f: Awaited<ReturnType<typeof readyFeature>>,
  merged: any,
  result = "passed",
) {
  cliOutput(
    await invokeAsync(f.original, [
      "checks",
      "require",
      "--spec",
      f.originalSpec,
      "--scope",
      "final",
      "--command",
      "test final",
      "--command",
      "lint final",
      "--author",
      "controller",
    ]),
  );
  const recorded = await invokeAsync(f.original, [
    "checks",
    "record",
    "--spec",
    f.originalSpec,
    "--scope",
    "final",
    "--merge",
    merged.mergeCommit,
    "--snapshot",
    merged.snapshot,
    "--command",
    "test final",
    "--result",
    result,
    "--author",
    "controller",
    ...(result === "passed" ? [] : ["--details", "external test failed"]),
  ]);
  if (result === "passed")
    cliOutput(
      await invokeAsync(f.original, [
        "checks",
        "record",
        "--spec",
        f.originalSpec,
        "--scope",
        "final",
        "--merge",
        merged.mergeCommit,
        "--snapshot",
        merged.snapshot,
        "--command",
        "lint final",
        "--result",
        "passed",
        "--author",
        "controller",
      ]),
    );
  return recorded;
}

function originalIgnoredArtifacts(f: Awaited<ReturnType<typeof readyFeature>>) {
  const exclude = join(f.original, ".git", "info", "exclude");
  writeFileSync(exclude, `${readFileSync(exclude, "utf8")}\nnode_modules/\nbuild/\n`);
  const files = [
    {
      path: join(f.original, "node_modules", "fixture-package", "index.js"),
      content: "user dependency data\n",
    },
    { path: join(f.original, "build", "result.txt"), content: "user build artifact\n" },
  ];
  for (const file of files) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content);
  }
  return files;
}

test("original ignored node_modules and build artifacts survive the real complete flow", async () => {
  const f = await readyFeature();
  const files = originalIgnoredArtifacts(f);
  const merged = cliOutput(await f.finish());
  expect(merged.finalValidation).toBe("pending");
  cliOutput(await recordFinal(f, merged));
  const complete = cliOutput(
    await invokeAsync(f.original, ["finish", "--spec", f.originalSpec, "--author", "controller"]),
  );
  expect(complete.finished).toBe(true);
  expect(existsSync(f.root)).toBe(false);
  expect(existsSync(f.ticketRoot)).toBe(false);
  for (const file of files) expect(readFileSync(file.path, "utf8")).toBe(file.content);
});

test.each(["file", "directory", "parent-file", "empty-directory"])(
  "an original ignored %s colliding with incoming feature code blocks merge and is preserved",
  async (kind) => {
    const f = await readyFeature(kind === "parent-file" ? "feature.ts/child.ts" : "feature.ts");
    const files = originalIgnoredArtifacts(f);
    const exclude = join(f.original, ".git", "info", "exclude");
    writeFileSync(exclude, `${readFileSync(exclude, "utf8")}\nfeature.ts\n`);
    const collision = join(f.original, "feature.ts");
    const directory = kind === "directory" || kind === "empty-directory";
    if (directory) mkdirSync(collision);
    const dataPath = directory ? join(collision, "artifact.txt") : collision;
    const userData = "unrelated original ignored source file\n";
    if (kind !== "empty-directory") writeFileSync(dataPath, userData);
    expect(git(f.original, "status", "--porcelain")).toBe("");
    const failed = await f.finish();
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toMatch(/overwritten by merge/);
    if (kind !== "empty-directory") expect(readFileSync(dataPath, "utf8")).toBe(userData);
    else expect(lstatSync(collision).isDirectory()).toBe(true);
    expect(git(f.original, "rev-parse", "HEAD")).toBe(f.featureRevision);
    expect(existsSync(f.root)).toBe(true);
    expect(existsSync(f.ticketRoot)).toBe(true);
    const stopped = JSON.parse(readFileSync(f.journal, "utf8"));
    expect(stopped.phase).toBe("merging");
    const recordsCommit = git(f.root, "rev-parse", "HEAD");
    // Simulate the user's safe resolution, preserving rather than deleting data.
    const preserved = join(f.original, "node_modules", "preserved-feature.ts");
    renameSync(collision, preserved);
    const merged = cliOutput(await f.finish());
    expect(git(f.root, "rev-parse", "HEAD")).toBe(recordsCommit);
    cliOutput(await recordFinal(f, merged));
    expect(
      cliOutput(
        await invokeAsync(f.original, [
          "finish",
          "--spec",
          f.originalSpec,
          "--author",
          "controller",
        ]),
      ).finished,
    ).toBe(true);
    if (kind !== "empty-directory")
      expect(readFileSync(directory ? join(preserved, "artifact.txt") : preserved, "utf8")).toBe(
        userData,
      );
    else expect(lstatSync(preserved).isDirectory()).toBe(true);
    for (const file of files) expect(readFileSync(file.path, "utf8")).toBe(file.content);
  },
);

test("a configured failing signer blocks finalization and preserves staged records and worktrees", async () => {
  const f = await readyFeature();
  const signer = join(dirname(f.original), "fixture-failing-signer.sh");
  writeFileSync(signer, "#!/bin/sh\nexit 1\n");
  chmodSync(signer, 0o755);
  git(f.original, "config", "gpg.format", "openpgp");
  git(f.original, "config", "gpg.program", signer);
  git(f.original, "config", "user.signingkey", "fixture-signing-key");
  git(f.original, "config", "commit.gpgSign", "true");
  const featureHead = git(f.root, "rev-parse", "HEAD");
  const ledgerBefore = readFileSync(join(dirname(f.spec), "sdd.json"), "utf8");
  const failed = await f.finish();
  expect(failed.status).not.toBe(0);
  expect(failed.stderr).toMatch(/gpg failed to sign|failed to write commit object/i);
  expect(git(f.original, "config", "--get", "commit.gpgSign")).toBe("true");
  expect(git(f.root, "rev-parse", "HEAD")).toBe(featureHead);
  expect(git(f.original, "rev-parse", "HEAD")).toBe(f.featureRevision);
  expect(readFileSync(join(dirname(f.spec), "sdd.json"), "utf8")).toBe(ledgerBefore);
  const staged = git(f.root, "diff", "--cached", "--name-only").split("\n").filter(Boolean);
  expect(staged.length).toBeGreaterThan(0);
  expect(staged.every((path) => path.startsWith(`.scratch/${f.feature}/`))).toBe(true);
  expect(JSON.parse(readFileSync(f.journal, "utf8")).phase).toBe("records");
  expect(existsSync(f.root)).toBe(true);
  expect(existsSync(f.ticketRoot)).toBe(true);
});

test("real complete flow preserves exact preparation guard, relocates reports, records final checks and cleans all worktrees", async () => {
  const f = await readyFeature();
  const beforeLedger = readFileSync(join(dirname(f.spec), "sdd.json"), "utf8");
  const pending = cliOutput(await f.finish());
  expect(pending).toMatchObject({ finalValidation: "pending", cleanup: "retained" });
  expect(pending).not.toHaveProperty("finished");
  expect(f.featureRevision).not.toBe(f.originalRevision);
  const journal = JSON.parse(readFileSync(f.journal, "utf8"));
  expect(journal.startup.records).toBeDefined();
  expect(journal.startup.targetIdentity).toEqual({
    device: lstatSync(f.root).dev,
    inode: lstatSync(f.root).ino,
  });
  expect(journal.ledgerBefore).toBe(beforeLedger);
  expect(
    git(f.original, "rev-list", "--parents", "-n", "1", pending.mergeCommit).split(" "),
  ).toEqual([pending.mergeCommit, f.featureRevision, journal.featureCommit]);
  const premature = cliOutput(
    await invokeAsync(f.original, ["finish", "--spec", f.originalSpec, "--author", "controller"]),
  );
  expect(premature.finalValidation).toBe("pending");
  expect(existsSync(f.root)).toBe(true);
  expect(existsSync(f.ticketRoot)).toBe(true);
  cliOutput(await recordFinal(f, pending, "failed"));
  const blocked = cliOutput(
    await invokeAsync(f.original, ["finish", "--spec", f.originalSpec, "--author", "controller"]),
  );
  expect(blocked.finalValidation).toBe("pending");
  cliOutput(await recordFinal(f, pending));
  const complete = cliOutput(
    await invokeAsync(f.original, ["finish", "--spec", f.originalSpec, "--author", "controller"]),
  );
  expect(complete).toMatchObject({
    finished: true,
    cleanup: "complete",
    mergeCommit: pending.mergeCommit,
  });
  expect(complete.metadataCommit).not.toBe(pending.mergeCommit);
  expect(complete.checkedCommit).toBe(pending.mergeCommit);
  expect(complete.metadataCommitChecked).toBe(false);
  expect(git(f.original, "diff", "--name-only", pending.mergeCommit, complete.metadataCommit)).toBe(
    `.scratch/${f.feature}/sdd.json`,
  );
  expect(existsSync(f.root)).toBe(false);
  expect(existsSync(f.ticketRoot)).toBe(false);
  expect(
    git(f.original, "branch", "--list", `features/${f.feature}`, `tickets/${f.feature}/*`),
  ).toBe("");
  const app = await appAt(f.original);
  const paths = (await app.make(FeatureInspectionService)).resolveFeature(f.originalSpec);
  const ledger = (await app.make(LedgerRepository)).readLedger(paths);
  expect(ledger.tickets[0]!.worktree).toBeUndefined();
  expect(ledger.delivery.status).toBe("complete");
  expect(ledger.delivery.finished?.report).toContain(f.original);
  expect(ledger.tickets[0]!.assignment!.report).toContain(f.original);
  expect(existsSync(ledger.tickets[0]!.assignment!.report)).toBe(true);
  const persisted = JSON.parse(readFileSync(f.journal, "utf8"));
  expect(persisted.phase).toBe("complete");
  expect(persisted.records.map((record: any) => record.result)).toEqual([
    "failed",
    "passed",
    "passed",
  ]);
  expect(persisted.records.every((record: any) => record.headSha === pending.mergeCommit)).toBe(
    true,
  );
  expect(persisted.approvedLedger.tickets[0].worktree.workspace).toBe(f.ticketRoot);
  expect(
    cliOutput(await invokeAsync(f.original, ["status", "--spec", f.originalSpec])).finished,
  ).toBe(true);
});

test.each([
  "dirty-original",
  "moved-original",
  "detached-original",
  "wrong-branch",
  "dirty-code",
  "missing-retrospective",
  "changed-review",
])("full finish rejects %s without committing records or destroying work", async (guard) => {
  const f = await readyFeature();
  const before = git(f.root, "rev-parse", "HEAD");
  if (guard === "dirty-original" || guard === "moved-original") {
    writeFileSync(join(f.original, "user.txt"), "preserve\n");
    if (guard === "moved-original") {
      git(f.original, "add", "user.txt");
      git(f.original, "commit", "-qm", "user movement");
    }
  } else if (guard === "detached-original") git(f.original, "checkout", "--detach", "-q");
  else if (guard === "wrong-branch") git(f.original, "checkout", "-qb", "user-branch");
  else if (guard === "dirty-code") writeFileSync(join(f.root, "user.ts"), "preserve\n");
  else if (guard === "changed-review") {
    const ledger = JSON.parse(readFileSync(join(dirname(f.spec), "sdd.json"), "utf8"));
    writeFileSync(ledger.delivery.reviewAssignments[0].report, "# changed report\n");
  }
  const result =
    guard === "missing-retrospective"
      ? await invokeAsync(f.root, [
          "finish",
          "--spec",
          f.spec,
          "--author",
          "controller",
          "--confirm-records",
        ])
      : await f.finish();
  expect(result.status).not.toBe(0);
  expect(git(f.root, "rev-parse", "HEAD")).toBe(before);
  expect(existsSync(f.root)).toBe(true);
  expect(existsSync(f.ticketRoot)).toBe(true);
});

test.each([
  "dirty-ticket",
  "ignored-ticket",
  "moved-ticket",
  "symlink-ticket",
  "locked-ticket",
  "wrong-final-merge",
])("cleanup preflights all targets and rejects %s while preserving worktrees", async (guard) => {
  const f = await readyFeature();
  const merged = cliOutput(await f.finish());
  cliOutput(await recordFinal(f, merged));
  if (guard === "symlink-ticket") {
    renameSync(f.ticketRoot, `${f.ticketRoot}.preserved`);
    symlinkSync(`${f.ticketRoot}.preserved`, f.ticketRoot);
  } else if (guard === "locked-ticket") git(f.original, "worktree", "lock", f.ticketRoot);
  else if (guard === "wrong-final-merge") {
    writeFileSync(join(f.original, "user.txt"), "user\n");
    git(f.original, "add", "user.txt");
    git(f.original, "commit", "-qm", "move final branch");
  } else {
    writeFileSync(join(f.ticketRoot, "user.txt"), "preserve\n");
    if (guard === "ignored-ticket")
      writeFileSync(join(f.original, ".git", "info", "exclude"), "user.txt\n");
    if (guard === "moved-ticket") {
      git(f.ticketRoot, "add", "user.txt");
      git(f.ticketRoot, "commit", "-qm", "move ticket branch");
    }
  }
  const result = await invokeAsync(f.original, [
    "finish",
    "--spec",
    f.originalSpec,
    "--author",
    "controller",
  ]);
  expect(result.status).not.toBe(0);
  expect(existsSync(f.root)).toBe(true);
  expect(existsSync(f.ticketRoot)).toBe(true);
  expect(JSON.parse(readFileSync(f.journal, "utf8")).phase).toBe("validation");
});

test.each(["record-commit", "merge-index", "merge-commit", "metadata-commit", "remove", "delete"])(
  "real gates and exact journal recover after interruption following %s",
  async (where) => {
    const f = await readyFeature();
    const artifacts = originalIgnoredArtifacts(f);
    let root = f.root;
    let merged: any;
    if (where === "metadata-commit" || where === "remove" || where === "delete") {
      merged = cliOutput(await f.finish());
      cliOutput(await recordFinal(f, merged));
      root = f.original;
    }
    const app = await appAt(root);
    const gitService = await app.make(GitService);
    const originalRun = gitService.run.bind(gitService);
    let interrupted = false;
    const spy = vi.spyOn(gitService, "run").mockImplementation((args, options) => {
      const result = originalRun(args, options as never) as never;
      const matches =
        where === "record-commit"
          ? args.includes("commit") && options?.cwd === f.root
          : where === "merge-index"
            ? args.includes("merge") && args.includes("--no-ff")
            : where === "merge-commit"
              ? args.includes("commit") && options?.cwd === f.original
              : where === "metadata-commit"
                ? args.includes("commit") && options?.cwd === f.original
                : where === "remove"
                  ? args.includes("worktree") && args.includes("remove")
                  : args.includes("update-ref");
      if (matches && !interrupted) {
        interrupted = true;
        throw new Error("fixture interruption after Git mutation");
      }
      return result;
    });
    const delivery = await app.make(DeliveryService);
    expect(() =>
      delivery.finish({
        spec: root === f.root ? f.spec : f.originalSpec,
        author: "controller",
        report: f.report,
        confirmRecords: true,
      }),
    ).toThrow("fixture interruption");
    for (const file of artifacts) expect(readFileSync(file.path, "utf8")).toBe(file.content);
    spy.mockRestore();
    const recovered =
      root === f.root
        ? cliOutput(await f.finish())
        : cliOutput(
            await invokeAsync(f.original, [
              "finish",
              "--spec",
              f.originalSpec,
              "--author",
              "controller",
            ]),
          );
    if (root === f.root) expect(recovered.finalValidation).toBe("pending");
    else expect(recovered.finished).toBe(true);
    for (const file of artifacts) expect(readFileSync(file.path, "utf8")).toBe(file.content);
  },
);

test("wrong snapshot/merge, undeclared command and unavailable result cannot authorize cleanup", async () => {
  const f = await readyFeature();
  const merged = cliOutput(await f.finish());
  const app = await appAt(f.original);
  const finalization = await app.make(FeatureFinalizationService);
  finalization.declare({ spec: f.originalSpec, command: ["test final"], author: "controller" });
  const valid = {
    feature: f.feature,
    merge: merged.mergeCommit,
    snapshot: merged.snapshot,
    command: "test final",
    result: "passed",
    author: "controller",
  };
  expect(() => finalization.record({ ...valid, merge: f.featureRevision })).toThrow();
  expect(() => finalization.record({ ...valid, snapshot: "a".repeat(64) })).toThrow();
  expect(() => finalization.record({ ...valid, command: "undeclared" })).toThrow();
  finalization.record({ ...valid, result: "unavailable", details: "environment unavailable" });
  expect(
    cliOutput(
      await invokeAsync(f.original, ["finish", "--spec", f.originalSpec, "--author", "controller"]),
    ).finalValidation,
  ).toBe("pending");
  expect(existsSync(f.root)).toBe(true);
});
