import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  cliOutput,
  execute,
  invokeAsync,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import {
  gitAt,
  dispatch,
  acceptedTicket,
  integrate,
} from "@test/Helpers/SubagentDrivenDevelopment/TicketWorktreeFixtures";
import { expect, test } from "vitest";

test("integration preserves ignored collisions and permits unrelated ignored files on retry", async () => {
  const { root, spec, parent, workspace } = await acceptedTicket();
  const ticketHead = gitAt(workspace, "rev-parse", "HEAD");
  const common = gitAt(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const exclude = join(common, "info", "exclude");
  writeFileSync(exclude, `${readFileSync(exclude, "utf8")}\n/first.ts\n/local-cache.txt\n`);
  const collision = join(root, "first.ts");
  const unrelated = join(root, "local-cache.txt");
  writeFileSync(collision, "precious ignored content\n");
  writeFileSync(unrelated, "unrelated ignored content\n");
  expect(gitAt(root, "check-ignore", "first.ts")).toBe("first.ts");

  const refused = await integrate(root, spec);
  expect(refused.status).not.toBe(0);
  expect(refused.stderr).toMatch(/overwritten|overwrite/i);
  expect(readFileSync(collision, "utf8")).toBe("precious ignored content\n");
  expect(readFileSync(unrelated, "utf8")).toBe("unrelated ignored content\n");
  expect(gitAt(workspace, "rev-parse", "HEAD")).toBe(ticketHead);
  const journal = join(
    common,
    "spindle-ticket-integration",
    `0001-ticket-isolation-T-0001-${ticketHead}.json`,
  );
  const featureHead = (JSON.parse(readFileSync(journal, "utf8")) as { featureHead: string })
    .featureHead;
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(featureHead);
  expect(gitAt(root, "diff", "--cached", "--name-only")).toBe("");
  expect(
    existsSync(gitAt(root, "rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD")),
  ).toBe(false);
  const ledger = JSON.parse(readFileSync(join(dirname(spec), "sdd.json"), "utf8"));
  expect(ledger.tickets[0].integration).toBeUndefined();

  const saved = join(parent, "preserved-first.ts");
  renameSync(collision, saved);
  const retried = await integrate(root, spec);
  expect(retried.status, retried.stderr).toBe(0);
  expect(readFileSync(saved, "utf8")).toBe("precious ignored content\n");
  expect(readFileSync(collision, "utf8")).toBe("ticket\n");
  expect(readFileSync(unrelated, "utf8")).toBe("unrelated ignored content\n");
});

test("integration preserves an ignored file above an incoming path", async () => {
  const { root, spec, parent, workspace } = await acceptedTicket("incoming/file.ts");
  const common = gitAt(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const exclude = join(common, "info", "exclude");
  writeFileSync(exclude, `${readFileSync(exclude, "utf8")}\n/incoming\n`);
  const collision = join(root, "incoming");
  writeFileSync(collision, "precious ignored ancestor\n");
  const ticketHead = gitAt(workspace, "rev-parse", "HEAD");
  const refused = await integrate(root, spec);
  expect(refused.status).not.toBe(0);
  expect(refused.stderr).toMatch(/ignored files would be overwritten/i);
  expect(readFileSync(collision, "utf8")).toBe("precious ignored ancestor\n");
  expect(gitAt(workspace, "rev-parse", "HEAD")).toBe(ticketHead);
  const saved = join(parent, "preserved-ancestor");
  renameSync(collision, saved);
  mkdirSync(collision);
  writeFileSync(join(collision, "other.log"), "unrelated ignored sibling\n");
  const retried = await integrate(root, spec);
  expect(retried.status, retried.stderr).toBe(0);
  expect(readFileSync(saved, "utf8")).toBe("precious ignored ancestor\n");
  expect(readFileSync(join(root, "incoming/file.ts"), "utf8")).toBe("ticket\n");
  expect(readFileSync(join(root, "incoming/other.log"), "utf8")).toBe(
    "unrelated ignored sibling\n",
  );
});

test("integration preserves ignored files underneath an incoming file", async () => {
  const { root, spec, parent, workspace } = await acceptedTicket("incoming");
  const common = gitAt(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const exclude = join(common, "info", "exclude");
  writeFileSync(exclude, `${readFileSync(exclude, "utf8")}\n/incoming/\n`);
  const collision = join(root, "incoming");
  mkdirSync(collision);
  writeFileSync(join(collision, "keep.txt"), "precious ignored descendant\n");
  const ticketHead = gitAt(workspace, "rev-parse", "HEAD");
  const refused = await integrate(root, spec);
  expect(refused.status).not.toBe(0);
  expect(refused.stderr).toMatch(/ignored files would be overwritten/i);
  expect(readFileSync(join(collision, "keep.txt"), "utf8")).toBe("precious ignored descendant\n");
  expect(gitAt(workspace, "rev-parse", "HEAD")).toBe(ticketHead);
  const saved = join(parent, "preserved-directory");
  renameSync(collision, saved);
  const retried = await integrate(root, spec);
  expect(retried.status, retried.stderr).toBe(0);
  expect(readFileSync(join(saved, "keep.txt"), "utf8")).toBe("precious ignored descendant\n");
  expect(readFileSync(collision, "utf8")).toBe("ticket\n");
});

test("integration preserves an empty ignored directory at an incoming file", async () => {
  const { root, spec } = await acceptedTicket("incoming");
  const common = gitAt(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const exclude = join(common, "info", "exclude");
  writeFileSync(exclude, `${readFileSync(exclude, "utf8")}\n/incoming/\n`);
  const collision = join(root, "incoming");
  mkdirSync(collision);
  const refused = await integrate(root, spec);
  expect(refused.status).not.toBe(0);
  expect(refused.stderr).toMatch(/ignored files would be overwritten/i);
  expect(existsSync(collision)).toBe(true);
});

test("a failed post-merge validation blocks integration of another ticket", async () => {
  const { root, spec, parent } = await acceptedTicket();
  const firstMerge = await integrate(root, spec);
  expect(firstMerge.status, firstMerge.stderr).toBe(0);
  const require = await invokeAsync(root, [
    "checks",
    "require",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--scope",
    "post-merge",
    "--command",
    "post-merge test",
    "--actor",
    "controller",
  ]);
  expect(require.status, require.stderr).toBe(0);
  const requiredHeadSha = cliOutput(require).headSha as string;
  expect(requiredHeadSha).toBe(cliOutput(firstMerge).mergeCommit);
  const failed = await invokeAsync(root, [
    "checks",
    "record",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--scope",
    "post-merge",
    "--command",
    "post-merge test",
    "--result",
    "failed",
    "--details",
    "Post-merge validation found a defect.",
    "--actor",
    "controller",
  ]);
  expect(failed.status, failed.stderr).toBe(0);

  const second = await dispatch(root, spec, parent, "T-0002");
  writeFileSync(join(second.assignment.workspace, "second.ts"), "export const second = 2;\n");
  gitAt(second.assignment.workspace, "add", "second.ts");
  gitAt(second.assignment.workspace, "commit", "-qm", "implement second");
  const secondHead = gitAt(second.assignment.workspace, "rev-parse", "HEAD");
  writeFileSync(second.assignment.report, "# Implementation report\n\nImplemented.\n");
  const submitted = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0002",
      assignment: second.assignment.id,
      author: "controller",
    }),
  );
  expect(submitted.status, submitted.stderr).toBe(0);
  const headBefore = gitAt(root, "rev-parse", "HEAD");
  const unrelatedMerge = await invokeAsync(root, [
    "integrate",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0002",
    "--actor",
    "controller",
  ]);
  expect(unrelatedMerge.status).not.toBe(0);
  expect(unrelatedMerge.stderr).toMatch(/post-merge validation is pending or failed.*T-0001/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(headBefore);
  expect(gitAt(second.assignment.workspace, "rev-parse", "HEAD")).toBe(secondHead);
});

test("independent dispatch preserves the exact pending merge for post-merge checks", async () => {
  const { root, spec, parent } = await acceptedTicket();
  const integrated = await integrate(root, spec);
  expect(integrated.status, integrated.stderr).toBe(0);
  const mergeSha = cliOutput(integrated).mergeCommit as string;
  const dispatchOptions = {
    spec,
    ticket: "T-0002",
    author: "controller",
    workspace: parent,
  };
  writeFileSync(join(root, "private.txt"), "preserve user work\n");
  const dirty = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(dirty.status).not.toBe(0);
  expect(readFileSync(join(root, "private.txt"), "utf8")).toBe("preserve user work\n");
  gitAt(root, "add", "private.txt");
  const staged = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(staged.status).not.toBe(0);
  expect(staged.stderr).toMatch(/staged/i);
  gitAt(root, "reset", "-q", "HEAD", "--", "private.txt");
  rmSync(join(root, "private.txt"));
  const ledgerPath = join(dirname(spec), "sdd.json");
  const ledgerContents = readFileSync(ledgerPath, "utf8");
  writeFileSync(ledgerPath, `${ledgerContents}\n`);
  gitAt(root, "add", ledgerPath);
  const stagedRecords = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(stagedRecords.status).not.toBe(0);
  expect(stagedRecords.stderr).toMatch(/staged/i);
  gitAt(root, "reset", "-q", "HEAD", "--", ledgerPath);
  writeFileSync(ledgerPath, ledgerContents);
  const unrelatedReport = join(dirname(spec), "reports", "T-9999-unregistered.md");
  writeFileSync(unrelatedReport, "unregistered data\n");
  const unregistered = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(unregistered.status).not.toBe(0);
  expect(unregistered.stderr).toMatch(/non-canonical/i);
  expect(readFileSync(unrelatedReport, "utf8")).toBe("unregistered data\n");
  rmSync(unrelatedReport);
  const common = gitAt(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const journal = join(common, "spindle-record-commit", "0001-ticket-isolation.json");
  mkdirSync(dirname(journal), { recursive: true });
  writeFileSync(journal, "preserve interrupted journal\n");
  const journalled = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(journalled.status).not.toBe(0);
  expect(journalled.stderr).toMatch(/journal/i);
  expect(readFileSync(journal, "utf8")).toBe("preserve interrupted journal\n");
  rmSync(journal);
  expect(gitAt(root, "merge-base", "--is-ancestor", mergeSha, "HEAD")).toBe("");

  const dispatchHead = gitAt(root, "rev-parse", "HEAD");
  const independent = await execute(root, (services) =>
    services.assignmentService.implement(dispatchOptions),
  );
  expect(independent.status, independent.stderr).toBe(0);
  const assignment = JSON.parse(independent.stdout).assignment as { workspace: string };
  expect(gitAt(root, "merge-base", "--is-ancestor", dispatchHead, "HEAD")).toBe("");
  expect(gitAt(assignment.workspace, "rev-parse", "HEAD")).toBe(dispatchHead);
  const declared = await execute(root, (services) =>
    services.checksService.checksRequire({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: ["integration test"],
      author: "controller",
    }),
  );
  expect(declared.status, declared.stderr).toBe(0);
  const result = await execute(root, (services) =>
    services.checksService.checksRecord({
      spec,
      ticket: "T-0001",
      scope: "post-merge",
      command: "integration test",
      result: "passed",
      author: "controller",
    }),
  );
  expect(result.status, result.stderr).toBe(0);
  expect(gitAt(root, "merge-base", "--is-ancestor", mergeSha, "HEAD")).toBe("");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].status).toBe("closed");
  expect(ledger.tickets[0].integration.postMerge.checks.records[0].headSha).toBe(mergeSha);
  expect(ledger.tickets[1].worktree.baseSha).toBe(dispatchHead);
});

test("pending post-merge checks preserve evidence until blockers and dependencies are resolved", async () => {
  const { root, spec } = await acceptedTicket();
  const integrated = await integrate(root, spec);
  expect(integrated.status, integrated.stderr).toBe(0);
  const mergeSha = cliOutput(integrated).mergeCommit as string;
  const third = await execute(root, (services) =>
    services.ticketService.ticketCreate({
      spec,
      title: "Later prerequisite",
      reporter: "requester",
      category: "enhancement",
      author: "controller",
    }),
  );
  expect(third.status, third.stderr).toBe(0);
  for (const [ticket, blockedBy] of [
    ["T-0002", ["T-0001"]],
    ["T-0001", ["T-0003"]],
  ] as const) {
    const updated = await execute(root, (services) =>
      services.ticketService.ticketUpdate({
        spec,
        ticket,
        blockedBy: [...blockedBy],
        author: "controller",
      }),
    );
    expect(updated.status, updated.stderr).toBe(0);
  }
  const declaration = {
    spec,
    ticket: "T-0001",
    scope: "post-merge" as const,
    command: ["first check", "second check"],
    author: "controller",
  };
  const declared = await execute(root, (services) =>
    services.checksService.checksRequire(declaration),
  );
  expect(declared.status, declared.stderr).toBe(0);
  const record = (command: string) =>
    execute(root, (services) =>
      services.checksService.checksRecord({
        ...declaration,
        command,
        result: "passed",
      }),
    );
  const first = await record("first check");
  expect(first.status, first.stderr).toBe(0);
  const blocked = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      blocker: "Awaiting approval",
      author: "controller",
    }),
  );
  expect(blocked.status, blocked.stderr).toBe(0);
  const last = await record("second check");
  expect(last.status, last.stderr).toBe(0);
  expect(JSON.parse(last.stdout)).toMatchObject({
    closed: false,
    closureBlocked: [
      "Ticket blocker: Awaiting approval",
      "Unmet or unvalidated dependencies: T-0003",
    ],
    retry: expect.stringContaining("checks require"),
  });
  const ledgerPath = join(dirname(spec), "sdd.json");
  let ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].status).not.toBe("closed");
  expect(ledger.tickets[0].integration.postMerge.status).toBe("pending");
  expect(ledger.tickets[0].integration.postMerge.checks.records).toHaveLength(2);
  const readyBefore = await invokeAsync(root, [
    "ready",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
  ]);
  expect(readyBefore.status, readyBefore.stderr).toBe(0);
  expect(cliOutput(readyBefore).ready).not.toContain("T-0002");
  const cleared = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      clearBlocker: true,
      author: "controller",
    }),
  );
  expect(cleared.status, cleared.stderr).toBe(0);
  const stillBlocked = await execute(root, (services) =>
    services.checksService.checksRequire(declaration),
  );
  expect(stillBlocked.status, stillBlocked.stderr).toBe(0);
  expect(JSON.parse(stillBlocked.stdout)).toMatchObject({
    closed: false,
    closureBlocked: ["Unmet or unvalidated dependencies: T-0003"],
  });
  const dependencyResolved = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      clearBlockedBy: true,
      author: "controller",
    }),
  );
  expect(dependencyResolved.status, dependencyResolved.stderr).toBe(0);
  const retried = await execute(root, (services) =>
    services.checksService.checksRequire(declaration),
  );
  expect(retried.status, retried.stderr).toBe(0);
  expect(JSON.parse(retried.stdout)).toMatchObject({ closed: true, headSha: mergeSha });
  ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(ledger.tickets[0].status).toBe("closed");
  expect(ledger.tickets[0].integration.postMerge.status).toBe("passed");
  expect(ledger.tickets[0].integration.postMerge.checks.records).toHaveLength(2);
  expect(gitAt(root, "merge-base", "--is-ancestor", mergeSha, "HEAD")).toBe("");
  const readyAfter = await invokeAsync(root, [
    "ready",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
  ]);
  expect(readyAfter.status, readyAfter.stderr).toBe(0);
  expect(cliOutput(readyAfter).ready).toContain("T-0002");
});

test("conflicts are resolved in the ticket worktree and require fresh checks and review", async () => {
  const { root, spec, workspace } = await acceptedTicket("tracked.txt", "ticket change\n");
  const reviewedHead = gitAt(workspace, "rev-parse", "HEAD");
  writeFileSync(join(root, "tracked.txt"), "feature change\n");
  gitAt(root, "add", "tracked.txt");
  gitAt(root, "commit", "-qm", "independent feature change");
  const featureHead = gitAt(root, "rev-parse", "HEAD");
  const result = await integrate(root, spec);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/conflicts.*ticket worktree/i);
  expect(result.stderr).toMatch(/sdd sync/i);
  const preservedHead = gitAt(root, "rev-parse", "HEAD");
  expect(preservedHead).toBe(featureHead);
  expect(
    existsSync(gitAt(root, "rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD")),
  ).toBe(false);
  expect(gitAt(root, "ls-files", "--unmerged")).toBe("");
  expect(readFileSync(join(workspace, "tracked.txt"), "utf8")).toBe("ticket change\n");
  const repeated = await integrate(root, spec);
  expect(repeated.status).not.toBe(0);
  expect(repeated.stderr).toMatch(/conflicts/i);
  expect(gitAt(root, "rev-parse", "HEAD")).toBe(preservedHead);
  expect(() => gitAt(workspace, "rebase", "features/0001-ticket-isolation")).toThrow();
  expect(gitAt(workspace, "ls-files", "--unmerged")).not.toBe("");
  const syncArgs = [
    "sync",
    "--feature",
    spec.replace(/\/spec\.md$/, ""),
    "--ticket",
    "T-0001",
    "--actor",
    "controller",
  ];
  const interrupted = await invokeAsync(root, syncArgs);
  expect(interrupted.status).not.toBe(0);
  expect(gitAt(workspace, "ls-files", "--unmerged")).not.toBe("");
  writeFileSync(join(workspace, "tracked.txt"), "resolved feature and ticket change\n");
  gitAt(workspace, "add", "tracked.txt");
  gitAt(workspace, "-c", "core.editor=true", "rebase", "--continue");
  const stillStale = await integrate(root, spec);
  expect(stillStale.status).not.toBe(0);
  const prerequisite = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      blockedBy: ["T-0002"],
      author: "controller",
    }),
  );
  expect(prerequisite.status, prerequisite.stderr).toBe(0);
  const dependencyBlocked = await invokeAsync(root, syncArgs);
  expect(dependencyBlocked.status).not.toBe(0);
  expect(dependencyBlocked.stderr).toMatch(/T-0002.*not closed/i);
  const cleared = await execute(root, (services) =>
    services.ticketService.ticketUpdate({
      spec,
      ticket: "T-0001",
      clearBlockedBy: true,
      author: "controller",
    }),
  );
  expect(cleared.status, cleared.stderr).toBe(0);
  const adopted = await invokeAsync(root, syncArgs);
  expect(adopted.status, adopted.stderr).toBe(0);
  const adoptedBaseline = cliOutput(adopted).baseSha as string;
  expect(adoptedBaseline).not.toBe(reviewedHead);
  const rechecked = await recordReviewCheck(root, spec, "test ticket", "passed");
  expect(rechecked.status, rechecked.stderr).toBe(0);
  const reviewed = await execute(root, (services) =>
    services.reviewService.review({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(reviewed.status, reviewed.stderr).toBe(0);
  const reviewer = JSON.parse(reviewed.stdout).assignments[0] as {
    id: string;
    report: string;
    headSha: string;
    reworkBaseSha: string;
  };
  expect(reviewer.reworkBaseSha).toBe(reviewedHead);
  expect(reviewer.headSha).toBe(gitAt(workspace, "rev-parse", "HEAD"));
  writeFileSync(reviewer.report, "# Review\n\nResolution reviewed.\n");
  const approved = await execute(root, (services) =>
    services.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: reviewer.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(approved.status, approved.stderr).toBe(0);
  const resolved = await integrate(root, spec);
  expect(resolved.status, resolved.stderr).toBe(0);
  expect(readFileSync(join(root, "tracked.txt"), "utf8")).toBe(
    "resolved feature and ticket change\n",
  );
});

test("an automatic merge cannot silently change reviewed file content", async () => {
  const baseline = Array.from({ length: 20 }, (_, index) => `line ${index}\n`).join("");
  const ticketContent = baseline.replace("line 1\n", "ticket line\n");
  const { root, spec, workspace } = await acceptedTicket("tracked.txt", ticketContent, baseline);
  writeFileSync(join(root, "tracked.txt"), baseline.replace("line 18\n", "feature line\n"));
  gitAt(root, "add", "tracked.txt");
  gitAt(root, "commit", "-qm", "independent change to reviewed file");
  const before = gitAt(root, "rev-parse", "HEAD");
  const result = await integrate(root, spec);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/differs from the reviewed ticket commit/i);
  const preservedHead = gitAt(root, "rev-parse", "HEAD");
  expect(preservedHead).toBe(before);
  expect(
    existsSync(gitAt(root, "rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD")),
  ).toBe(false);
  expect(readFileSync(join(workspace, "tracked.txt"), "utf8")).toBe(ticketContent);
});
