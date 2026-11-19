import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runCliRaw } from "@test/Helpers/Cli";
import { dispatchFixture } from "@test/Helpers/SubagentDrivenDevelopment/DispatchFixture";
import { expect, test } from "vitest";

test(
  "appends ticket comments without changing other sections or the ledger",
  { timeout: 20_000 },
  async () => {
    const { featureFlag, invoke, repo, run, startTicket, task, workspace } =
      await dispatchFixture();
    const ticketPath = join(workspace, "tickets", "T-0001.md");
    const ticket = await readFile(ticketPath, "utf8");
    await writeFile(
      ticketPath,
      ticket.replace(
        "## Comments\n",
        "## Comments\n\nExisting note.\n\n## Follow-up\n\nRetained section.\n",
      ),
    );
    const originalTitle = ticket.split(/\r?\n/)[0];
    const ledgerPath = join(workspace, "sdd.json");
    const ledger = await readFile(ledgerPath, "utf8");
    const add = (comment: string) =>
      invoke(
        "ticket",
        "comment",
        "add",
        ...featureFlag,
        "--ticket",
        "T-0001",
        "--comment",
        comment,
      );

    add("First ticket note.");
    add("Second ticket note.");

    const updated = await readFile(ticketPath, "utf8");
    expect(updated.split(/\r?\n/)[0]).toBe(originalTitle);
    expect(updated).toContain("## Requirements\n\nScope");
    expect(updated).toContain("## Acceptance Criteria\n\nDone");
    expect(updated).toContain("Existing note.");
    expect(updated).toContain("Retained section.");
    expect(updated.indexOf("First ticket note.")).toBeLessThan(
      updated.indexOf("Second ticket note."),
    );
    expect(updated.indexOf("Second ticket note.")).toBeLessThan(updated.indexOf("## Follow-up"));
    expect(await readFile(ledgerPath, "utf8")).toBe(ledger);
    add("A fenced example:\n\n```md\n## Example heading\n```");
    expect(await readFile(ticketPath, "utf8")).toContain("## Example heading");
    const fromStdin = runCliRaw(
      repo,
      [
        "--json",
        "sdd",
        "ticket",
        "comment",
        "add",
        ...featureFlag,
        "--ticket",
        "T-0001",
        "--comment",
        "-",
      ],
      process.env.PATH ?? "",
      {},
      "A note from stdin.",
    );
    expect(fromStdin.status, fromStdin.stderr).toBe(0);
    expect(await readFile(ticketPath, "utf8")).toContain("A note from stdin.");

    const id = task("src/feature.ts");
    startTicket();
    invoke("dispatch", ...featureFlag, "--task", id);
    add("A note added after dispatch.");
    expect(await readFile(ticketPath, "utf8")).toContain("A note added after dispatch.");

    const beforeInvalidComments = await readFile(ticketPath, "utf8");
    const blank = run(
      "ticket",
      "comment",
      "add",
      ...featureFlag,
      "--ticket",
      "T-0001",
      "--comment",
      "  ",
    );
    expect(blank.status).toBe(1);
    expect(blank.stderr).toContain("Ticket comment must not be empty.");

    const heading = run(
      "ticket",
      "comment",
      "add",
      ...featureFlag,
      "--ticket",
      "T-0001",
      "--comment",
      "## New section",
    );
    expect(heading.status).toBe(1);
    expect(heading.stderr).toContain("must not contain level 1 or 2 headings");

    const unclosedFence = run(
      "ticket",
      "comment",
      "add",
      ...featureFlag,
      "--ticket",
      "T-0001",
      "--comment",
      "```md\nUnclosed",
    );
    expect(unclosedFence.status).toBe(1);
    expect(unclosedFence.stderr).toContain("Ticket comments must close code fences.");
    expect(await readFile(ticketPath, "utf8")).toBe(beforeInvalidComments);
  },
);
