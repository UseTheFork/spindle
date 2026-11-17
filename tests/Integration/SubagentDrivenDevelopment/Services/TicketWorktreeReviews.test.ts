import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  cliOutput,
  execute,
  invokeAsync,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import {
  gitAt,
  setup,
  dispatch,
  acceptedTicket,
  integrate,
} from "@test/Helpers/SubagentDrivenDevelopment/TicketWorktreeFixtures";
import { expect, test } from "vitest";

import { acceptTaskPlan } from "../Fixtures/TaskPlans";

test("review assignments become stale when the committed ticket HEAD changes", async () => {
  const { root, spec, parent } = await setup();
  const first = await dispatch(root, spec, parent, "T-0001");
  const workspace = first.assignment.workspace;
  await acceptTaskPlan(root, spec, "T-0001");
  writeFileSync(join(workspace, "first.ts"), "export const first = 1;\n");
  gitAt(workspace, "add", "first.ts");
  gitAt(workspace, "commit", "-qm", "implement first");
  writeFileSync(first.assignment.report, "# Implementation report\n\nImplemented.\n");
  const submitted = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const initialHead = JSON.parse(submitted.stdout).headSha as string;
  const check = await recordReviewCheck(root, spec, "test ticket", "passed");
  expect(check.status, check.stderr).toBe(0);
  const review = () =>
    execute(root, (services) =>
      services.reviewService.review({
        spec,
        ticket: "T-0001",
        author: "controller",
      }),
    );
  const status = await execute(root, (services) =>
    services.featureInspectionService.status({ spec }),
  );
  expect(status.status, status.stderr).toBe(0);
  const currentHeadSha = JSON.parse(status.stdout).commits.find(
    (item: { ticket: string }) => item.ticket === "T-0001",
  )!.headSha as string;
  expect(currentHeadSha).toBe(initialHead);
  const committedCheck = await recordReviewCheck(root, spec, "test ticket", "passed");
  expect(committedCheck.status, committedCheck.stderr).toBe(0);
  const dispatched = await review();
  expect(dispatched.status, dispatched.stderr).toBe(0);
  const assignment = JSON.parse(dispatched.stdout).assignments[0] as {
    id: string;
    headSha: string;
    workspace: string;
    report: string;
  };
  expect(assignment.workspace).toBe(workspace);
  expect(assignment.headSha).toBe(gitAt(workspace, "rev-parse", "HEAD"));
  expect(assignment.headSha).toBe(initialHead);
  expect(assignment.report).toContain(join(dirname(spec), "reports"));
  writeFileSync(assignment.report, "# Review\n\nNo findings.\n");
  gitAt(workspace, "commit", "--allow-empty", "-qm", "advance ticket HEAD");
  const reviewSubmission = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(reviewSubmission.status).not.toBe(0);
  expect(reviewSubmission.stderr).toMatch(/stale/i);
});

test("review survives feature advancement and merges the exact reviewed ticket commit", async () => {
  const { root, spec, parent } = await setup();
  const first = await dispatch(root, spec, parent, "T-0001");
  const workspace = first.assignment.workspace;
  await acceptTaskPlan(root, spec, "T-0001");
  writeFileSync(join(workspace, "first.ts"), "export const first = 1;\n");
  gitAt(workspace, "add", "first.ts");
  gitAt(workspace, "commit", "-qm", "implement first");
  writeFileSync(first.assignment.report, "# Implementation report\n\nImplemented.\n");
  const submitted = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const check = await recordReviewCheck(root, spec, "test ticket", "passed");
  expect(check.status, check.stderr).toBe(0);
  const reviewed = await execute(root, (services) =>
    services.reviewService.review({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);
  const review = JSON.parse(reviewed.stdout).assignments[0] as { id: string; report: string };
  writeFileSync(review.report, "# Review\n\nNo findings.\n");
  writeFileSync(join(root, "other-ticket.ts"), "export const otherTicket = 1;\n");
  gitAt(root, "add", ".spindle/features", "other-ticket.ts");
  gitAt(root, "commit", "-qm", "advance feature branch");
  const approval = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: review.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(approval.status, approval.stderr).toBe(0);
  const before = gitAt(root, "rev-parse", "HEAD");
  const integrated = await invokeAsync(root, [
    "integrate",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ]);
  expect(integrated.status, integrated.stderr).toBe(0);
  const output = cliOutput(integrated) as {
    mergeCommit: string;
    ticketCommit: string;
    postMerge: string;
  };
  expect(output.ticketCommit).toBe(gitAt(workspace, "rev-parse", "HEAD"));
  expect(output.postMerge).toBe("pending");
  const mergeParents = gitAt(root, "rev-list", "--parents", "-n", "1", output.mergeCommit).split(
    " ",
  );
  expect(mergeParents).toEqual([output.mergeCommit, before, output.ticketCommit]);
  expect(readFileSync(join(root, "first.ts"), "utf8")).toBe("export const first = 1;\n");
  expect(existsSync(workspace)).toBe(true);
  const repeated = await invokeAsync(root, [
    "integrate",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ]);
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(cliOutput(repeated).idempotent).toBe(true);
  const dependency = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0002",
      blockedBy: ["T-0001"],
      author: "controller",
    }),
  );
  expect(dependency.status, dependency.stderr).toBe(0);
  const dependentDispatch = await execute(root, (services) =>
    services.assignmentService.implement({
      spec,
      ticket: "T-0002",
      author: "controller",
      workspace: parent,
    }),
  );
  expect(dependentDispatch.status).not.toBe(0);
  expect(dependentDispatch.stderr).toMatch(/open dependencies: T-0001/i);

  const declared = await execute(root, (services) =>
    services.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: ["test integrated feature"],
      author: "controller",
    }),
  );
  expect(declared.status, declared.stderr).toBe(0);
  const recorded = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "test integrated feature",
      result: "passed",
      author: "controller",
    }),
  );
  expect(recorded.status, recorded.stderr).toBe(0);
  expect(JSON.parse(recorded.stdout).headSha).toBe(output.mergeCommit);
  const ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0].status).toBe("closed");
  expect(ledger.tickets[0].integration.postMerge.status).toBe("passed");
  const next = await dispatch(root, spec, parent, "T-0002");
  expect(readFileSync(join(next.assignment.workspace, "first.ts"), "utf8")).toBe(
    "export const first = 1;\n",
  );
});

test("integration refuses a stale reviewed commit and preserves both branches", async () => {
  const { root, spec, workspace } = await acceptedTicket();
  const featureHead = gitAt(root, "rev-parse", "HEAD");
  gitAt(workspace, "commit", "--allow-empty", "-qm", "advance after approval");
  const result = await integrate(root, spec);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/stale/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(featureHead);
  expect(existsSync(workspace)).toBe(true);
});

test("unapproved work cannot be merged without current review", async () => {
  const { root, spec, parent } = await setup();
  const { assignment } = await dispatch(root, spec, parent, "T-0001");
  writeFileSync(join(assignment.workspace, "first.ts"), "unreviewed\n");
  gitAt(assignment.workspace, "add", "first.ts");
  gitAt(assignment.workspace, "commit", "-qm", "unreviewed");
  const before = gitAt(root, "rev-parse", "HEAD");
  const result = await integrate(root, spec);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/current review|review or checks are not current/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(before);
});

test("ticket review rejects committed changes to requirements that differ from canonical records", async () => {
  const { root, spec, parent } = await setup();
  const first = await dispatch(root, spec, parent, "T-0001");
  const workspace = first.assignment.workspace;
  await acceptTaskPlan(root, spec, "T-0001");
  writeFileSync(join(workspace, "first.ts"), "export const first = 1;\n");
  writeFileSync(
    join(workspace, ".spindle/features/0001-ticket-isolation/spec.md"),
    "changed locally\n",
  );
  gitAt(workspace, "add", "first.ts", ".spindle/features");
  gitAt(workspace, "commit", "-qm", "code and wrong records");
  writeFileSync(first.assignment.report, "# Implementation report\n\nImplemented.\n");
  const submitted = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: first.assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const check = await recordReviewCheck(root, spec, "test ticket", "passed");
  expect(check.status).not.toBe(0);
  expect(check.stderr).toMatch(/current committed requirements/i);
});
