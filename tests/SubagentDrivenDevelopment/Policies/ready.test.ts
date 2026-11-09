import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { createTicket, ticketFixture, workspaceSnapshot } from "../helpers/ticket-helpers";

test("ready rejects duplicated ledger ticket progress records", async () => {
  const { service, feature } = await ticketFixture("Duplicate Ledger Ticket");
  createTicket(service, feature.spec, "One ticket");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.tickets.push({ ...ledger.tickets[0] });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  const malformed = readFileSync(ledgerPath, "utf8");
  expect(() => service.readinessService.ready({ spec: feature.spec })).toThrow(
    /ticket IDs must be unique/i,
  );
  expect(readFileSync(ledgerPath, "utf8")).toBe(malformed);
});

test("ready leaves workspace files, directories, and Git status unchanged", async () => {
  const { service, feature, git } = await ticketFixture("Read Only Ready");
  const before = workspaceSnapshot(feature.workspace);
  const statusBefore = git("status", "--porcelain=v1", "--untracked-files=all");
  expect(service.readinessService.ready({ spec: feature.spec })).toEqual({
    ready: [],
    unready: [],
  });
  expect(workspaceSnapshot(feature.workspace)).toEqual(before);
  expect(git("status", "--porcelain=v1", "--untracked-files=all")).toBe(statusBefore);
});

test("ready refuses a pending journal without changing workspace or Git status", async () => {
  const { service, feature, git } = await ticketFixture("Pending Ready");
  const journal = join(feature.workspace, ".sdd-write-recovery.json");
  writeFileSync(
    journal,
    JSON.stringify({
      version: 1,
      writes: [{ path: "tickets/T-0001.md", before: null, after: "Pending ticket content\n" }],
    }),
  );
  const before = workspaceSnapshot(feature.workspace);
  const statusBefore = git("status", "--porcelain=v1", "--untracked-files=all");
  expect(() => service.readinessService.ready({ spec: feature.spec })).toThrow(
    /pending.*(journal|recover)/i,
  );
  expect(workspaceSnapshot(feature.workspace)).toEqual(before);
  expect(git("status", "--porcelain=v1", "--untracked-files=all")).toBe(statusBefore);
});

test("ready exposes unmet dependencies and rejects missing references and cycles", async () => {
  const { service, feature } = await ticketFixture("Ticket Dependencies");
  for (const title of [
    "Prerequisite",
    "Dependent",
    "Downstream",
    "Human-ready",
    "Already claimed",
  ]) {
    createTicket(service, feature.spec, title);
  }
  const second = join(feature.workspace, "tickets", "T-0002.md");
  service.ticketService.ticketUpdate({
    spec: feature.spec,
    ticket: "T-0002",
    blockedBy: ["T-0001"],
    author: "maintainer",
  });
  service.ticketService.ticketUpdate({
    spec: feature.spec,
    ticket: "T-0003",
    blockedBy: ["T-0002"],
    author: "maintainer",
  });
  service.ticketService.ticketUpdate({
    spec: feature.spec,
    ticket: "T-0004",
    blocker: "Waiting for a product decision.",
    author: "maintainer",
  });
  service.ticketService.ticketUpdate({
    spec: feature.spec,
    ticket: "T-0005",
    status: "in-progress",
    author: "maintainer",
  });
  expect(service.readinessService.ready({ spec: feature.spec })).toEqual({
    ready: ["T-0001"],
    unready: [
      { ticket: "T-0002", blockedBy: ["T-0001"] },
      { ticket: "T-0003", blockedBy: ["T-0002"] },
    ],
  });
  service.ticketService.ticketUpdate({
    spec: feature.spec,
    ticket: "T-0001",
    status: "closed",
    author: "maintainer",
  });
  expect(service.readinessService.ready({ spec: feature.spec })).toEqual({
    ready: ["T-0002"],
    unready: [{ ticket: "T-0003", blockedBy: ["T-0002"] }],
  });
  service.ticketService.ticketUpdate({
    spec: feature.spec,
    ticket: "T-0002",
    status: "closed",
    author: "maintainer",
  });
  expect(service.readinessService.ready({ spec: feature.spec })).toEqual({
    ready: ["T-0003"],
    unready: [],
  });
  const before = readFileSync(second, "utf8");
  expect(() =>
    service.ticketService.ticketUpdate({
      spec: feature.spec,
      ticket: "T-0002",
      blockedBy: ["T-0099"],
      author: "maintainer",
    }),
  ).toThrow(/missing dependency T-0099/);
  expect(readFileSync(second, "utf8")).toBe(before);
  expect(() =>
    service.ticketService.ticketUpdate({
      spec: feature.spec,
      ticket: "T-0002",
      blockedBy: ["T-0003"],
      author: "maintainer",
    }),
  ).toThrow(/cycle/i);
  expect(readFileSync(second, "utf8")).toBe(before);
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.tickets[1].blockedBy = ["T-0099"];
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  expect(() => service.readinessService.ready({ spec: feature.spec })).toThrow(
    /missing dependency T-0099/,
  );
  ledger.tickets[1].blockedBy = ["T-0003"];
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  expect(() => service.readinessService.ready({ spec: feature.spec })).toThrow(/cycle/i);
});
