import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import matter from "gray-matter";
import { expect, test } from "vitest";

import { createTicket, ticketFixture } from "../helpers/ticket-helpers";

test("ticket comment recovers an interrupted ticket/ledger write without losing history", async () => {
  const { service, feature } = await ticketFixture("Ticket Recovery");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const ledger = JSON.parse(ledgerBefore);
  ledger.tickets.push({
    id: "T-0001",
    title: "Recovered ticket",
    reporter: "Explicit reporter",
    category: "enhancement",
    status: "open",
    blockedBy: [],
    execution: "unstarted",
  });
  const ledgerAfter = `${JSON.stringify(ledger, null, 2)}\n`;
  const ticketContent = [
    "---",
    "id: T-0001",
    "---",
    "",
    "## Requirements",
    "",
    "Keep this recovered requirement.",
    "",
    "## Acceptance Criteria",
    "",
    "Keep this criterion.",
    "",
    "## Comments",
    "",
    "**2026-11-07T16:00:00.000Z - maintainer**",
    "",
    "Existing attributed history.",
    "",
  ].join("\n");
  const ticketPath = join(feature.workspace, "tickets", "T-0001.md");
  const journal = {
    version: 1,
    writes: [
      { path: "tickets/T-0001.md", before: null, after: ticketContent },
      { path: "sdd.json", before: ledgerBefore, after: ledgerAfter },
    ],
  };
  writeFileSync(ticketPath, ticketContent);
  writeFileSync(
    join(feature.workspace, ".sdd-write-recovery.json"),
    `${JSON.stringify(journal, null, 2)}\n`,
  );
  service.ticketService.ticketComment({
    spec: feature.spec,
    ticket: "T-0001",
    details: "Recovery followed by a comment.",
    author: "maintainer",
  });
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerAfter);
  expect(existsSync(join(feature.workspace, ".sdd-write-recovery.json"))).toBe(false);
  const recovered = matter(readFileSync(ticketPath, "utf8"));
  expect(recovered.content).toMatch(/Keep this recovered requirement\./);
  expect(recovered.content).toMatch(/Keep this criterion\./);
  expect(recovered.content.match(/Existing attributed history\./g) ?? []).toHaveLength(1);
  expect(recovered.content.match(/Recovery followed by a comment\./g) ?? []).toHaveLength(1);
});

test("recovery leaves every target unchanged when a later ledger conflicts", async () => {
  const { service, feature } = await ticketFixture("Conflicting Recovery");
  createTicket(service, feature.spec, "Existing ticket");
  const ticketPath = join(feature.workspace, "tickets", "T-0001.md");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const journalPath = join(feature.workspace, ".sdd-write-recovery.json");
  const ticketBefore = readFileSync(ticketPath, "utf8");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const ledgerConflict = `${ledgerBefore} \n`;
  writeFileSync(ledgerPath, ledgerConflict);
  const journal = JSON.stringify({
    version: 1,
    writes: [
      {
        path: "tickets/T-0001.md",
        before: ticketBefore,
        after: `${ticketBefore}\nPending entry.\n`,
      },
      { path: "sdd.json", before: ledgerBefore, after: `${ledgerBefore}\n` },
    ],
  });
  writeFileSync(journalPath, journal);
  expect(() =>
    service.ticketService.ticketComment({
      spec: feature.spec,
      ticket: "T-0001",
      details: "Must not be written.",
      author: "maintainer",
    }),
  ).toThrow(/conflict/i);
  expect(readFileSync(ticketPath, "utf8")).toBe(ticketBefore);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerConflict);
  expect(readFileSync(journalPath, "utf8")).toBe(journal);
});
