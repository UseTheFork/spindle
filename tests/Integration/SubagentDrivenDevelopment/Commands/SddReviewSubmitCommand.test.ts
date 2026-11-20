import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { reviewFixture } from "@test/Helpers/SubagentDrivenDevelopment/ReviewFixture";
import { expect, test } from "vitest";

test(
  "requires a fresh round for changed code and waits for every reviewer in that round",
  { timeout: 20_000 },
  async () => {
    const { complete, featureFlag, git, initialTask, invoke, run, workspace, worktree } =
      await reviewFixture();
    await complete(initialTask, "first.ts");
    const start = () => invoke("review", ...featureFlag, "--ticket", "T-0001");
    const submit = (id: string, recommendation: string) => [
      "review",
      "submit",
      ...featureFlag,
      "--review",
      id,
      "--recommendation",
      recommendation,
    ];
    const createTask = [
      "task",
      "create",
      ...featureFlag,
      "--ticket",
      "T-0001",
      "--instructions",
      "Edit a file",
      "--write-scope",
      "third.ts",
    ];
    const first = start();
    const second = start();
    expect([first.review, second.review]).toEqual(["R-0001", "R-0002"]);
    expect(run(...createTask).stderr).toContain("is under review");
    const source = join(worktree, "first.ts");
    await writeFile(source, "Changed before submission\n");
    expect(run(...submit(first.review, "pass")).stderr).toContain(
      "no longer matches the current ticket revision",
    );
    await writeFile(source, "first.ts\n");
    expect(invoke(...submit(first.review, "pass")).acceptance).toBe("InAcceptance");
    expect(invoke(...submit(second.review, "pass")).acceptance).toBe("Accepted");
    expect(invoke("next", ...featureFlag).tickets[0].acceptance).toBe("Accepted");
    expect(run(...submit(first.review, "pass")).stderr).toContain("already has a result");
    expect(run(...createTask).stderr).toContain("Cannot add an ordinary task to accepted ticket");

    // Simulate a later work-round commit from linked fix work, which the CLI cannot create yet.
    await writeFile(source, "Changed in a later round\n");
    git("-C", worktree, "commit", "-am", "Follow-up changes");
    const path = join(workspace, "sdd.json");
    const ledger = JSON.parse(await readFile(path, "utf8"));
    ledger.tickets[0].workRoundCommits.push(git("-C", worktree, "rev-parse", "HEAD"));
    await writeFile(path, JSON.stringify(ledger));
    expect(invoke("next", ...featureFlag).tickets[0].acceptance).toBe("InAcceptance");
    const updated = start();
    expect(updated.review).toBe("R-0003");
    expect(updated.codeRevision).not.toBe(first.codeRevision);
    expect(invoke(...submit(updated.review, "pass")).acceptance).toBe("Accepted");
  },
);

test("records proposed findings and leaves the ticket blocked", { timeout: 20_000 }, async () => {
  const { complete, featureFlag, initialTask, invoke, run, workspace } = await reviewFixture();
  await complete(initialTask, "first.ts");
  const first = invoke("review", ...featureFlag, "--ticket", "T-0001");
  const path = join(workspace, "sdd.json");
  const legacyReview = "R-2e6e0954-e158-4ad0-88cc-7441a0c97247";
  const original = JSON.parse(await readFile(path, "utf8"));
  original.reviewRounds[0].reviews[0].id = legacyReview;
  await writeFile(path, JSON.stringify(original));

  const { review } = invoke("review", ...featureFlag, "--ticket", "T-0001");
  expect(review).toBe(first.review);
  const submit = (id: string) => [
    "review",
    "submit",
    ...featureFlag,
    "--review",
    id,
    "--recommendation",
    "changes-required",
  ];
  const args = submit(review);
  expect(run(...args).stderr).toContain("requires at least one finding");
  const result = invoke(
    ...args,
    "--finding",
    "Missing assertion",
    "major",
    "first.ts",
    "Done",
    "No assertion ran",
    "Add an assertion",
    "--finding",
    "Missing input",
    "minor",
    "first.ts",
    "Done",
    "No input supplied",
    "Supply the input",
  );
  expect(result.findings).toEqual(["F-0001", "F-0002"]);
  const legacyResult = invoke(
    ...submit(legacyReview),
    "--finding",
    "Missing edge case",
    "minor",
    "first.ts",
    "Done",
    "No empty input tested",
    "Test empty input",
  );
  expect(legacyResult).toMatchObject({ acceptance: "Blocked", findings: ["F-0003"] });
  const ledger = JSON.parse(await readFile(path, "utf8"));
  expect(ledger.findings).toMatchObject([
    { id: "F-0001", title: "Missing assertion", reviewId: review, decision: { status: "open" } },
    { id: "F-0002", title: "Missing input", reviewId: review, decision: { status: "open" } },
    { id: "F-0003", title: "Missing edge case", reviewId: legacyReview },
  ]);
  expect(invoke("next", ...featureFlag).tickets[0].acceptance).toBe("Blocked");
});
