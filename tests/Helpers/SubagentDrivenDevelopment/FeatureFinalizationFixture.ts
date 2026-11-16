import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { LoadProjectSettings } from "@spindle/Foundation/Bootstrap/LoadProjectSettings";
import { applicationFixture } from "@test/Helpers/ApplicationFixture";
import {
  cliOutput,
  execute,
  fixture,
  invokeAsync,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { repoRoot } from "@test/Helpers/TemporaryDirectories";
import { expect } from "vitest";

export function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export async function appAt(root: string) {
  const app = applicationFixture(root, join(repoRoot, "assets/Blueprints"));
  await new LoadProjectSettings().bootstrap(app);
  await app.boot();
  return app;
}

export function output(result: { status: number | null; stdout: string; stderr: string }) {
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

/** Real CLI/service flow through committed feature-review and final-check state. */
export async function readyFeature(
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

export async function recordFinal(f: Awaited<ReturnType<typeof readyFeature>>, result = "passed") {
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

export function originalIgnoredArtifacts(f: Awaited<ReturnType<typeof readyFeature>>) {
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
