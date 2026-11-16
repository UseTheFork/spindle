import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  appAt,
  git,
  originalIgnoredArtifacts,
  output,
  recordFinal,
} from "@test/Helpers/SubagentDrivenDevelopment/FeatureFinalizationFixture";
import {
  cliOutput,
  execute,
  fixture,
  invokeAsync,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";

import { acceptTaskPlan, createTaskPlan, useExternalTaskWorktreeReference } from "./TaskPlans";

export { appAt, git, originalIgnoredArtifacts, output, recordFinal };

/** Real CLI/service flow through committed feature-review and final-check state. */
export async function readyFeature(
  codeFile = "feature.ts",
  options: { declareFinalChecks?: boolean } = {},
) {
  const { repo: original } = fixture();
  const originalRevision = git(original, "rev-parse", "HEAD");
  const created = output(
    await execute(original, (services) =>
      services.featureCreationService.create({
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
    await execute(root, (services) =>
      services.ticketService.ticketCreate({
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
    await execute(root, (services) =>
      services.checksService.checksRequire({
        spec,
        ticket: "T-0001",
        command: "test ticket",
        author: "controller",
      }),
    ),
  );
  const implemented = output(
    await execute(root, (services) =>
      services.assignmentService.implement({
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
    await execute(root, (services) =>
      services.submissionService.submit({
        spec,
        ticket: "T-0001",
        assignment: implemented.assignment.id,
        author: "controller",
      }),
    ),
  );
  output(
    await execute(root, (services) =>
      services.checksService.checksRecord({
        spec,
        ticket: "T-0001",
        command: "test ticket",
        result: "passed",
        author: "controller",
      }),
    ),
  );
  const reviewed = output(
    await execute(root, (services) =>
      services.reviewService.review({
        spec,
        ticket: "T-0001",
        author: "controller",
      }),
    ),
  );
  for (const assignment of reviewed.assignments) {
    writeFileSync(assignment.report, "# Ticket review\nNo findings.\n");
    output(
      await execute(root, (services) =>
        services.submissionService.submit({
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
    await execute(root, (services) =>
      services.assignmentService.claim({ spec, scope: "delivery", author: "controller" }),
    ),
  );
  output(
    await execute(root, (services) =>
      services.checksService.checksRequire({
        spec,
        ticket: "",
        scope: "delivery",
        command: "test final",
        author: "controller",
      }),
    ),
  );
  output(
    await execute(root, (services) =>
      services.checksService.checksRecord({
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
    await execute(root, (services) =>
      services.reviewService.review({
        spec,
        scope: "delivery",
        author: "controller",
      }),
    ),
  );
  for (const assignment of deliveryReview.assignments) {
    writeFileSync(assignment.report, "# Delivery review\nNo findings.\n");
    output(
      await execute(root, (services) =>
        services.submissionService.submit({
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
