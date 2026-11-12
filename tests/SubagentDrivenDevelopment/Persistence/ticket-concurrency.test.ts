import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import matter from "gray-matter";
import { expect, test } from "vitest";

import { repoRoot } from "../../helpers/TemporaryDirectories.ts";
import { cliOutput, invokeAsync } from "../helpers/helpers";
import { createTicket, ticketFixture, workspaceSnapshot } from "../helpers/ticket-helpers";

async function waitForFile(path: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(existsSync(path), `Timed out waiting for ${path}`).toBe(true);
}

test("ready does not combine tracker states from interleaved serialized updates", async () => {
  const { repo, service, feature } = await ticketFixture("Coherent Ready Queue");
  createTicket(service, feature.spec, "Ticket A");
  createTicket(service, feature.spec, "Ticket B");
  const updateStatus = (ticket: string, status: string) =>
    service.ticketService.ticketUpdate({
      spec: feature.spec,
      ticket,
      status,
      author: "maintainer",
    });
  updateStatus("T-0001", "open");
  const pausePath = join(repo, "ready-paused");
  const resumePath = join(repo, "ready-resume");
  const preloadPath = join(repoRoot, "tests/helpers/preloads/ready-pause.ts");
  const ready = invokeAsync(repo, ["ready", "--spec", feature.spec], {
    preload: preloadPath,
    env: {
      SPINDLE_TEST_READY_TARGET: join(feature.workspace, "tickets", "T-0002.md"),
      SPINDLE_TEST_READY_PAUSE: pausePath,
      SPINDLE_TEST_READY_RESUME: resumePath,
    },
  });
  try {
    await waitForFile(pausePath, 10_000);
    updateStatus("T-0001", "in-progress");
    updateStatus("T-0002", "open");
    const afterTriage = workspaceSnapshot(feature.workspace);
    writeFileSync(resumePath, "resume");
    const result = await ready;
    expect(result.status, result.stderr).toBe(0);
    expect(cliOutput(result)).toEqual({ ready: ["T-0002"], unready: [] });
    expect(workspaceSnapshot(feature.workspace)).toEqual(afterTriage);
  } finally {
    writeFileSync(resumePath, "resume");
    await ready;
  }
});

test("concurrent ticket creation serializes per-feature IDs and ledger updates", async () => {
  const { repo, feature } = await ticketFixture("Concurrent Tickets");
  const results = await Promise.all(
    ["One", "Two", "Three", "Four", "Five"].map((title) =>
      invokeAsync(repo, [
        "ticket",
        "create",
        "--spec",
        feature.spec,
        "--title",
        title,
        "--reporter",
        "maintainer",
        "--category",
        "enhancement",
        "--author",
        "controller",
      ]),
    ),
  );
  for (const result of results) {
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
  }
  const ids: string[] = results.map((result) => cliOutput(result).ticket).sort();
  expect(ids).toEqual(["T-0001", "T-0002", "T-0003", "T-0004", "T-0005"]);
  const ledger = JSON.parse(readFileSync(join(feature.workspace, "sdd.json"), "utf8"));
  const sortedTickets = ledger.tickets.sort((left: { id: string }, right: { id: string }) =>
    left.id.localeCompare(right.id),
  );
  expect(sortedTickets.map((ticket: { id: string }) => ticket.id)).toEqual(ids);
  expect(sortedTickets.map((ticket: { title: string }) => ticket.title).sort()).toEqual([
    "Five",
    "Four",
    "One",
    "Three",
    "Two",
  ]);
  expect(
    sortedTickets.every(
      (ticket: { status: string; execution: string }) =>
        ticket.status === "open" && ticket.execution === "unstarted",
    ),
  ).toBe(true);
  for (const id of ids) {
    expect(existsSync(join(feature.workspace, "tickets", `${id}.md`))).toBe(true);
  }
});

test("concurrent ticket updates preserve both attributed history entries", async () => {
  const { repo, service, feature } = await ticketFixture("Concurrent Updates");
  createTicket(service, feature.spec, "Concurrent target");
  const results = await Promise.all(
    ["First update", "Second update"].map((title) =>
      invokeAsync(repo, [
        "ticket",
        "update",
        "--spec",
        feature.spec,
        "--ticket",
        "T-0001",
        "--title",
        title,
        "--author",
        title,
      ]),
    ),
  );
  for (const result of results) expect(result.status, result.stderr).toBe(0);
  const ticket = matter(readFileSync(join(feature.workspace, "tickets", "T-0001.md"), "utf8"));
  expect(ticket.data).toEqual({ id: "T-0001" });
  const ledger = JSON.parse(readFileSync(join(feature.workspace, "sdd.json"), "utf8"));
  expect(["First update", "Second update"]).toContain(ledger.tickets[0].title);
  expect(ticket.content).toMatch(/ - First update\*\*/);
  expect(ticket.content).toMatch(/ - Second update\*\*/);
});
