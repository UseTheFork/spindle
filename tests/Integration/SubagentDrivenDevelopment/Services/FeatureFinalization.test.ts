import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { LoadProjectSettings } from "@spindle/Foundation/Bootstrap/LoadProjectSettings";
import { LedgerRepository } from "@spindle/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { FeatureFinalizationService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureFinalizationService";
import { FeatureInspectionService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { applicationFixture } from "@test/Helpers/ApplicationFixture";
import {
  cliOutput,
  execute,
  fixture,
  invokeAsync,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { nextSummary } from "@test/Helpers/SubagentDrivenDevelopment/StatusSummary";
import { repoRoot } from "@test/Helpers/TemporaryDirectories";
import { expect, test, vi } from "vitest";

import {
  acceptTaskPlan,
  createTaskPlan,
  useExternalTaskWorktreeReference,
} from "../Fixtures/TaskPlans";

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
      "--feature",
      created.spec.replace(/\/spec\.md$/, ""),
      "--workspace",
      parent,
      "--confirm-records",
    ]),
  );
  const before = git(started.featureWorkspace, "rev-parse", "HEAD");
  const finished = await invokeAsync(started.featureWorkspace, [
    "finish",
    "--feature",
    started.spec.replace(/\/spec\.md$/, ""),
    "--actor",
    "controller",
  ]);
  expect(finished.status).not.toBe(0);
  expect(finished.stderr).toContain("at least one ticket");
  const required = await invokeAsync(started.featureWorkspace, [
    "checks",
    "require",
    "--feature",
    started.spec.replace(/\/spec\.md$/, ""),
    "--scope",
    "final",
    "--command",
    "test final",
    "--actor",
    "controller",
  ]);
  expect(required.status).not.toBe(0);
  expect(required.stderr).toMatch(/delivery.*owner/i);
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
      "--feature",
      created.spec.replace(/\/spec\.md$/, ""),
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
    "--feature",
    started.spec.replace(/\/spec\.md$/, ""),
    "--actor",
    "controller",
  ]);
  expect(finished.status).not.toBe(0);
  expect(finished.stderr).toContain("Active Git hook");
  expect(git(started.featureWorkspace, "rev-parse", "HEAD")).toBe(before);
  expect(readFileSync(hook, "utf8")).toBe("#!/bin/sh\nexit 1\n");
});

/** Real CLI/service flow through committed feature-review and final-check state. */
async function readyFeature(
  codeFile = "feature.ts",
  options: { declareFinalChecks?: boolean } = {},
) {
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
      "--feature",
      created.spec.replace(/\/spec\.md$/, ""),
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
  await createTaskPlan(root, spec, "T-0001");
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
      }),
    ),
  );
  const ticketRoot = implemented.assignment.workspace as string;
  await acceptTaskPlan(root, spec, "T-0001");
  useExternalTaskWorktreeReference(spec, "T-0001", original);
  mkdirSync(dirname(join(ticketRoot, codeFile)), { recursive: true });
  writeFileSync(join(ticketRoot, codeFile), "export const feature = 1;\n");
  git(ticketRoot, "add", codeFile);
  git(ticketRoot, "commit", "-qm", "ticket implementation");
  writeFileSync(implemented.assignment.report, "# Implemented\n");
  output(
    await execute(root, (s) =>
      s.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: implemented.assignment.id,
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
          assignment: assignment.id,
          result: "passed",
          author: "controller",
        }),
      ),
    );
  }
  cliOutput(
    await invokeAsync(root, [
      "integrate",
      "--feature",
      spec.replace(/\/spec\.md$/, ""),
      "--ticket",
      "T-0001",
      "--actor",
      "controller",
    ]),
  );
  cliOutput(
    await invokeAsync(root, [
      "checks",
      "require",
      "--feature",
      spec.replace(/\/spec\.md$/, ""),
      "--ticket",
      "T-0001",
      "--scope",
      "post-merge",
      "--command",
      "test merged ticket",
      "--actor",
      "controller",
    ]),
  );
  cliOutput(
    await invokeAsync(root, [
      "checks",
      "record",
      "--feature",
      spec.replace(/\/spec\.md$/, ""),
      "--ticket",
      "T-0001",
      "--scope",
      "post-merge",
      "--command",
      "test merged ticket",
      "--result",
      "passed",
      "--actor",
      "controller",
    ]),
  );
  output(
    await execute(root, (s) =>
      s.assignmentService.claim({ spec, scope: "delivery", author: "controller" }),
    ),
  );
  output(
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
          assignment: assignment.id,
          result: "passed",
          author: "controller",
        }),
      ),
    );
  }
  if (options.declareFinalChecks !== false) {
    cliOutput(
      await invokeAsync(root, [
        "checks",
        "require",
        "--feature",
        spec.replace(/\/spec\.md$/, ""),
        "--scope",
        "final",
        "--command",
        "test final",
        "--command",
        "lint final",
        "--actor",
        "controller",
      ]),
    );
  }
  const report = join(dirname(spec), "reports", "retrospective.md");
  writeFileSync(report, "# Retrospective\nReviewed implementation and tests.\n");
  const originalSpec = join(original, ".spindle/features", feature, "spec.md");
  const journal = join(original, ".git", "spindle-feature-finalization", `${feature}.json`);
  const finish = () =>
    invokeAsync(root, [
      "finish",
      "--feature",
      spec.replace(/\/spec\.md$/, ""),
      "--report",
      report,
      "--actor",
      "controller",
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

test("final checks are declared before finish and frozen when finalization begins", async () => {
  const f = await readyFeature("feature.ts", { declareFinalChecks: false });
  const featureDirectory = f.spec.replace(/\/spec\.md$/, "");
  const missing = await f.finish();
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toMatch(/declare the complete final-check list/i);

  const before = git(f.root, "rev-parse", "HEAD");
  const firstDeclaration = await invokeAsync(f.root, [
    "checks",
    "require",
    "--feature",
    featureDirectory,
    "--scope",
    "final",
    "--command",
    "test final",
    "--actor",
    "controller",
  ]);
  cliOutput(firstDeclaration);
  const firstDeclarationHead = git(f.root, "rev-parse", "HEAD");
  expect(firstDeclarationHead).not.toBe(before);

  const declared = await invokeAsync(f.root, [
    "checks",
    "require",
    "--feature",
    featureDirectory,
    "--scope",
    "final",
    "--command",
    "test final",
    "--command",
    "lint final",
    "--actor",
    "controller",
  ]);
  cliOutput(declared);
  expect(git(f.root, "rev-parse", "HEAD")).not.toBe(firstDeclarationHead);
  const ledger = JSON.parse(readFileSync(join(dirname(f.spec), "sdd.json"), "utf8"));
  expect(ledger.delivery.finalChecks.map((item: { command: string }) => item.command)).toEqual([
    "test final",
    "lint final",
  ]);

  cliOutput(await f.finish());
  const journal = JSON.parse(readFileSync(f.journal, "utf8"));
  expect(journal.finalDeclared).toBe(true);
  expect(journal.required.map((item: { command: string }) => item.command)).toEqual([
    "test final",
    "lint final",
  ]);

  const changedList = await invokeAsync(f.original, [
    "checks",
    "require",
    "--feature",
    f.originalSpec.replace(/\/spec\.md$/, ""),
    "--scope",
    "final",
    "--command",
    "test final",
    "--command",
    "late check",
    "--actor",
    "controller",
  ]);
  expect(changedList.status).not.toBe(0);
  expect(changedList.stderr).toMatch(/final declared check list is frozen/i);
});

async function recordFinal(f: Awaited<ReturnType<typeof readyFeature>>, result = "passed") {
  cliOutput(
    await invokeAsync(f.original, [
      "checks",
      "require",
      "--feature",
      f.originalSpec.replace(/\/spec\.md$/, ""),
      "--scope",
      "final",
      "--command",
      "test final",
      "--command",
      "lint final",
      "--actor",
      "controller",
    ]),
  );
  const recorded = await invokeAsync(f.original, [
    "checks",
    "record",
    "--feature",
    f.originalSpec.replace(/\/spec\.md$/, ""),
    "--scope",
    "final",
    "--command",
    "test final",
    "--result",
    result,
    "--actor",
    "controller",
    ...(result === "passed" ? [] : ["--details", "external test failed"]),
  ]);
  if (result === "passed")
    cliOutput(
      await invokeAsync(f.original, [
        "checks",
        "record",
        "--feature",
        f.originalSpec.replace(/\/spec\.md$/, ""),
        "--scope",
        "final",
        "--command",
        "lint final",
        "--result",
        "passed",
        "--actor",
        "controller",
      ]),
    );
  return recorded;
}

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
    await invokeAsync(f.original, [
      "finish",
      "--feature",
      f.originalSpec.replace(/\/spec\.md$/, ""),
      "--actor",
      "controller",
    ]),
  );
  expect(premature.finalValidation).toBe("pending");
  expect(existsSync(f.root)).toBe(true);
  expect(existsSync(f.ticketRoot)).toBe(true);
  cliOutput(await recordFinal(f, "failed"));
  const blocked = cliOutput(
    await invokeAsync(f.original, [
      "finish",
      "--feature",
      f.originalSpec.replace(/\/spec\.md$/, ""),
      "--actor",
      "controller",
    ]),
  );
  expect(blocked.finalValidation).toBe("pending");
  cliOutput(await recordFinal(f));
  const complete = cliOutput(
    await invokeAsync(f.original, [
      "finish",
      "--feature",
      f.originalSpec.replace(/\/spec\.md$/, ""),
      "--actor",
      "controller",
    ]),
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
    `.spindle/features/${f.feature}/sdd.json`,
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
    cliOutput(
      await invokeAsync(f.original, [
        "status",
        "--feature",
        f.originalSpec.replace(/\/spec\.md$/, ""),
      ]),
    ).finished,
  ).toBe(true);
});

test("final checks revalidate only after a clean fix commit and bind completion to the new commit", async () => {
  const f = await readyFeature();
  const merged = cliOutput(await f.finish());
  cliOutput(await recordFinal(f, "failed"));
  cliOutput(await recordFinal(f));
  const supersededFailure = await invokeAsync(f.original, [
    "checks",
    "revalidate",
    "--feature",
    f.originalSpec.replace(/\/spec\.md$/, ""),
    "--scope",
    "final",
    "--actor",
    "controller",
  ]);
  expect(supersededFailure.status).not.toBe(0);
  expect(supersededFailure.stderr).toMatch(/requires a failed check/i);
  cliOutput(await recordFinal(f, "failed"));

  const unchanged = await invokeAsync(f.original, [
    "checks",
    "revalidate",
    "--feature",
    f.originalSpec.replace(/\/spec\.md$/, ""),
    "--scope",
    "final",
    "--actor",
    "controller",
  ]);
  expect(unchanged.status).not.toBe(0);
  expect(unchanged.stderr).toMatch(/commit and fix/i);

  writeFileSync(join(f.original, "final-fix.txt"), "final validation fix\n");
  const dirty = await invokeAsync(f.original, [
    "checks",
    "revalidate",
    "--feature",
    f.originalSpec.replace(/\/spec\.md$/, ""),
    "--scope",
    "final",
    "--actor",
    "controller",
  ]);
  expect(dirty.status).not.toBe(0);
  expect(dirty.stderr).toMatch(/dirty checkout/i);

  git(f.original, "add", "final-fix.txt");
  git(f.original, "commit", "-m", "fix final validation");
  const fixedHead = git(f.original, "rev-parse", "HEAD");
  const next = await invokeAsync(f.original, [
    "next",
    "--feature",
    f.originalSpec.replace(/\/spec\.md$/, ""),
  ]);
  expect(next.status, next.stderr).toBe(0);
  expect(cliOutput(next)).toMatchObject({
    revalidationAvailable: true,
    revalidationCandidateSha: fixedHead,
  });
  expect(nextSummary(cliOutput(next)).join("\n")).toMatch(/checks revalidate/);

  const revalidated = cliOutput(
    await invokeAsync(f.original, [
      "checks",
      "revalidate",
      "--feature",
      f.originalSpec.replace(/\/spec\.md$/, ""),
      "--scope",
      "final",
      "--actor",
      "controller",
    ]),
  );
  expect(revalidated).toMatchObject({
    finalValidation: "pending",
    mergeCommit: merged.mergeCommit,
    headSha: fixedHead,
    records: [],
  });

  cliOutput(await recordFinal(f));
  const complete = cliOutput(
    await invokeAsync(f.original, [
      "finish",
      "--feature",
      f.originalSpec.replace(/\/spec\.md$/, ""),
      "--actor",
      "controller",
    ]),
  );
  expect(complete).toMatchObject({
    finished: true,
    mergeCommit: merged.mergeCommit,
    checkedCommit: fixedHead,
  });
  expect(git(f.original, "rev-list", "--parents", "-n", "1", complete.metadataCommit)).toBe(
    `${complete.metadataCommit} ${fixedHead}`,
  );
});

test("obsolete merge selectors, undeclared commands and unavailable results cannot authorize cleanup", async () => {
  const f = await readyFeature();
  cliOutput(await f.finish());
  const app = await appAt(f.original);
  const finalization = await app.make(FeatureFinalizationService);
  finalization.declare({
    spec: f.originalSpec,
    command: ["test final", "lint final"],
    author: "controller",
  });
  const valid = {
    feature: f.feature,
    command: "test final",
    result: "passed",
    author: "controller",
  };
  const obsoleteMerge = await invokeAsync(f.original, [
    "checks",
    "record",
    "--feature",
    f.originalSpec.replace(/\/spec\.md$/, ""),
    "--scope",
    "final",
    "--merge",
    f.featureRevision,
    "--command",
    "test final",
    "--result",
    "passed",
    "--actor",
    "controller",
  ]);
  expect(obsoleteMerge.status).not.toBe(0);
  expect(obsoleteMerge.stderr).toMatch(/unknown option '--merge'/);
  const journalBefore = readFileSync(f.journal, "utf8");
  const ownerError = /is owned by controller.*--actor replacement.*cannot be handed off/;
  expect(() => finalization.record({ ...valid, author: "replacement" })).toThrow(ownerError);
  expect(() => finalization.revalidate({ feature: f.feature, author: "replacement" })).toThrow(
    ownerError,
  );
  expect(() =>
    finalization.declare({
      spec: f.originalSpec,
      command: ["test final", "lint final"],
      author: "replacement",
    }),
  ).toThrow(ownerError);
  expect(readFileSync(f.journal, "utf8")).toBe(journalBefore);
  finalization.record(valid);
  expect(() => finalization.record({ ...valid, command: "undeclared" })).toThrow(
    "Final check command is not declared: undeclared.",
  );
  finalization.record({ ...valid, result: "unavailable", details: "environment unavailable" });
  expect(
    cliOutput(
      await invokeAsync(f.original, [
        "finish",
        "--feature",
        f.originalSpec.replace(/\/spec\.md$/, ""),
        "--actor",
        "controller",
      ]),
    ).finalValidation,
  ).toBe("pending");
  expect(existsSync(f.root)).toBe(true);
});
