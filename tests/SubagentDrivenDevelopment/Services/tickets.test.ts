import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import matter from "gray-matter";
import { expect, test, vi } from "vitest";

import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";
import { InternalSkillDescriptionProvider } from "@/TemplateRendering/Computed/Providers/InternalSkillDescriptionProvider";

import { runCli } from "../../helpers/Cli.ts";
import { createTicket, ticketFixture } from "../helpers/ticket-helpers";

test("ticket create persists attributed metadata and unstarted progress without overwriting", async () => {
  const { service, feature } = await ticketFixture("Ticket Lifecycle");
  const options = {
    spec: feature.spec,
    title: "Preserve ticket requirements",
    reporter: "A maintainer",
    category: "enhancement",
    author: "controller",
  };
  const output = service.ticketService.ticketCreate(options);
  expect(output.ticket).toBe("T-0001");
  const ticketPath = join(feature.workspace, "tickets", "T-0001.md");
  expect(output.path).toBe(ticketPath);
  expect(statSync(ticketPath).mode & 0o777).toBe(0o666 & ~process.umask());
  const createdDocument = matter(readFileSync(ticketPath, "utf8"));
  expect(createdDocument.data).toEqual({ id: "T-0001" });
  expect("execution" in createdDocument.data).toBe(false);
  expect(createdDocument.content).toContain("# Preserve ticket requirements");
  expect(createdDocument.content).toContain("**Reporter:** A maintainer");
  expect(createdDocument.content).toContain("**Category:** enhancement");
  expect(createdDocument.content).toContain("**Author:** controller");
  expect(createdDocument.content).toMatch(
    /^# Preserve ticket requirements\n\n- \*\*Reporter:\*\* A maintainer\n- \*\*Category:\*\* enhancement\n- \*\*Author:\*\* controller\n\n## Requirements\n\n\[REQUIREMENTS\]\n\n## Acceptance Criteria\n\n\[ACCEPTANCE CRITERIA\]\n\n## Comments\n/,
  );
  expect(createdDocument.content).toMatch(
    /\*\*\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z - controller\*\*/,
  );
  expect(createdDocument.content).toMatch(/Ticket created\./);
  const ledgerPath = join(feature.workspace, "sdd.json");
  const firstTicket = readFileSync(ticketPath, "utf8");
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).tickets).toEqual([
    {
      id: "T-0001",
      title: options.title,
      reporter: options.reporter,
      category: "enhancement",
      status: "open",
      blockedBy: [],
      execution: "unstarted",
    },
  ]);
  expect(firstTicket).not.toContain("execution:");
  expect(service.ticketService.ticketCreate(options).ticket).toBe("T-0002");
  expect(existsSync(ticketPath)).toBe(true);
  expect(readFileSync(ticketPath, "utf8")).toBe(firstTicket);
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).tickets).toHaveLength(2);
});

test("ticket IDs restart independently for each feature", async () => {
  const { service, feature } = await ticketFixture("First Feature");
  const second = service.featureCreationService.create({
    title: "Second Feature",
    author: "maintainer",
  });
  for (const item of [feature, second]) {
    expect(
      service.ticketService.ticketCreate({
        spec: item.spec,
        title: "Independent ticket",
        reporter: "reporter",
        category: "bug",
        author: "author",
      }).ticket,
    ).toBe("T-0001");
    expect(existsSync(join(item.workspace, "tickets", "T-0001.md"))).toBe(true);
  }
});

test("ticket creation rejects invalid categories and missing attribution without creating files", async () => {
  const { repo, service, feature } = await ticketFixture("Invalid Ticket Inputs");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  expect(() =>
    service.ticketService.ticketCreate({
      spec: feature.spec,
      title: "Invalid ticket",
      reporter: "reporter",
      category: "task",
      author: "maintainer",
    }),
  ).toThrow(/category/i);
  const missingAuthor = runCli(
    repo,
    [
      "sdd",
      "ticket",
      "create",
      "--spec",
      feature.spec,
      "--title",
      "Invalid ticket",
      "--reporter",
      "reporter",
      "--category",
      "bug",
    ],
    process.env.PATH ?? "",
  );
  expect(missingAuthor.status).not.toBe(0);
  expect(missingAuthor.stdout).toBe("");
  expect(missingAuthor.stderr.trim()).not.toBe("");
  expect(existsSync(join(feature.workspace, "tickets", "T-0001.md"))).toBe(false);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);
});

test("computed provider failures leave ticket and ledger unpublished", async () => {
  const { service, feature } = await ticketFixture("Failed Ticket Rendering");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  const render = vi
    .spyOn(InternalSkillDescriptionProvider.prototype, "render")
    .mockImplementation(() => {
      throw new Error("provider failed");
    });

  expect(() =>
    service.ticketService.ticketCreate({
      spec: feature.spec,
      title: "Failed ticket",
      reporter: "reporter",
      category: "bug",
      author: "maintainer",
    }),
  ).toThrow(/Computed Variable 'internal_skill_description' failed: provider failed/);
  expect(existsSync(join(feature.workspace, "tickets", "T-0001.md"))).toBe(false);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);
  render.mockRestore();
});

test("ticket creation requires valid project Config", async () => {
  const { repo, app, service, feature } = await ticketFixture("Invalid Project Config");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const ledgerBefore = readFileSync(ledgerPath, "utf8");
  writeFileSync(join(repo, ".github", "spindle.json"), "{ invalid");
  await LoadProjectConfiguration.refresh(app);

  expect(() =>
    service.ticketService.ticketCreate({
      spec: feature.spec,
      title: "Blocked ticket",
      reporter: "reporter",
      category: "bug",
      author: "maintainer",
    }),
  ).toThrow(/not valid JSON/i);
  expect(existsSync(join(feature.workspace, "tickets", "T-0001.md"))).toBe(false);
  expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBefore);
});

test("ticket commands reject legacy I-prefixed identifiers", async () => {
  const { service, feature } = await ticketFixture("Ticket IDs");
  expect(() =>
    service.ticketService.ticketUpdate({
      spec: feature.spec,
      ticket: "I-0001",
      status: "closed",
      author: "maintainer",
    }),
  ).toThrow("Invalid ticket ID: I-0001.");
});

test("ticket reads reject legacy tracking fields in Markdown front matter", async () => {
  const { service, feature } = await ticketFixture("Ticket Front Matter");
  createTicket(service, feature.spec, "Current ticket");
  const path = join(feature.workspace, "tickets", "T-0001.md");
  const document = matter(readFileSync(path, "utf8"));
  writeFileSync(
    path,
    matter.stringify(document.content, { ...document.data, title: "Legacy title" }),
  );
  expect(() =>
    service.ticketService.ticketUpdate({
      spec: feature.spec,
      ticket: "T-0001",
      status: "closed",
      author: "maintainer",
    }),
  ).toThrow("Ticket T-0001 tracking metadata must be stored in sdd.json.");
});

test("ticket creation rejects ignored destinations without changing ticket or ledger files", async () => {
  const { repo, service, feature } = await ticketFixture("Ignored Ticket");
  writeFileSync(join(repo, ".gitignore"), ".scratch/*/tickets/T-*.md\n");
  const ledgerPath = join(feature.workspace, "sdd.json");
  const before = readFileSync(ledgerPath, "utf8");
  expect(() => createTicket(service, feature.spec, "Must not be ignored")).toThrow(/ignored/i);
  expect(existsSync(join(feature.workspace, "tickets", "T-0001.md"))).toBe(false);
  expect(readFileSync(ledgerPath, "utf8")).toBe(before);
});

test("ticket creation rejects a symlinked tickets directory without touching outside content", async () => {
  const { repo, service, feature } = await ticketFixture("Unsafe Ticket Path");
  const outside = join(repo, "..", "outside-tickets");
  mkdirSync(outside);
  writeFileSync(join(outside, "keep.md"), "outside content\n");
  const ticketsDirectory = join(feature.workspace, "tickets");
  rmSync(ticketsDirectory, { recursive: true });
  symlinkSync(outside, ticketsDirectory);
  const ledgerPath = join(feature.workspace, "sdd.json");
  const before = readFileSync(ledgerPath, "utf8");
  expect(() => createTicket(service, feature.spec, "Must remain inside")).toThrow(
    /real directory/i,
  );
  expect(readFileSync(join(outside, "keep.md"), "utf8")).toBe("outside content\n");
  expect(readFileSync(ledgerPath, "utf8")).toBe(before);
});

test("ticket creation preserves a non-regular lock path and its target", async () => {
  const { repo, service, feature } = await ticketFixture("Unsafe Ticket Lock");
  const outside = join(repo, "outside-lock");
  writeFileSync(outside, "preserve this file\n");
  const lockPath = join(feature.workspace, ".sdd-tickets.lock");
  symlinkSync(outside, lockPath);
  expect(() => createTicket(service, feature.spec, "Must not claim an unsafe lock")).toThrow(
    /lock path/i,
  );
  expect(existsSync(lockPath)).toBe(true);
  expect(readFileSync(outside, "utf8")).toBe("preserve this file\n");
  expect(existsSync(join(feature.workspace, "tickets", "T-0001.md"))).toBe(false);
});

test("ticket update stores structured fields in the ledger and preserves local metadata and body", async () => {
  const { service, feature } = await ticketFixture("Ticket Update");
  createTicket(service, feature.spec, "Foundation");
  createTicket(service, feature.spec, "Follow-up");
  const target = join(feature.workspace, "tickets", "T-0002.md");
  chmodSync(target, 0o640);
  const source = readFileSync(target, "utf8").replace(
    "## Requirements\n\n[REQUIREMENTS]\n\n## Acceptance Criteria\n\n[ACCEPTANCE CRITERIA]\n\n## Comments\n",
    "## Requirements\n\nKeep this requirement.\n\n## Acceptance Criteria\n\nKeep this criterion.\n\n## Comments\n\nHistorical comment.\n",
  );
  const withLocalMetadata = matter(source);
  writeFileSync(
    target,
    matter.stringify(withLocalMetadata.content, {
      ...withLocalMetadata.data,
      local_reference: "preserve this value",
    }),
  );
  const ledgerPath = join(feature.workspace, "sdd.json");
  service.ticketService.ticketUpdate({
    spec: feature.spec,
    ticket: "T-0002",
    title: "Updated Follow-up",
    reporter: "different reporter",
    blockedBy: ["T-0001"],
    author: "maintainer",
  });
  const updated = matter(readFileSync(target, "utf8"));
  expect(updated.data).toEqual({ id: "T-0002", local_reference: "preserve this value" });
  const updatedLedger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  expect(updatedLedger.tickets[1]).toMatchObject({
    title: "Updated Follow-up",
    reporter: "different reporter",
    status: "open",
    blockedBy: ["T-0001"],
  });
  expect(updated.data.local_reference).toBe("preserve this value");
  expect(statSync(target).mode & 0o777).toBe(0o640);
  expect(updated.content).toMatch(/Keep this requirement\./);
  expect(updated.content).toMatch(/Keep this criterion\./);
  expect(updated.content).toMatch(/Historical comment\./);
  expect(updated.content).toMatch(/\*\*\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z - maintainer\*\*/);
  expect(updatedLedger.tickets[1].category).toBe("enhancement");
  service.ticketService.ticketUpdate({
    spec: feature.spec,
    ticket: "T-0002",
    clearBlockedBy: true,
    author: "maintainer",
  });
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[1].blockedBy).toEqual([]);
});

test("ticket tracker transitions enforce blockers before closure", async () => {
  const { service, feature } = await ticketFixture("Ticket Tracker");
  createTicket(service, feature.spec, "Track work");
  service.ticketService.ticketUpdate({
    spec: feature.spec,
    ticket: "T-0001",
    status: "in-progress",
    author: "worker",
  });
  service.ticketService.ticketUpdate({
    spec: feature.spec,
    ticket: "T-0001",
    status: "open",
    blocker: "Waiting for a decision.",
    author: "worker",
  });
  const ledgerPath = join(feature.workspace, "sdd.json");
  const beforeClose = readFileSync(ledgerPath, "utf8");
  expect(() =>
    service.ticketService.ticketUpdate({
      spec: feature.spec,
      ticket: "T-0001",
      status: "closed",
      author: "worker",
    }),
  ).toThrow(/cannot close a blocked ticket/i);
  expect(readFileSync(ledgerPath, "utf8")).toBe(beforeClose);
  service.ticketService.ticketUpdate({
    spec: feature.spec,
    ticket: "T-0001",
    status: "closed",
    clearBlocker: true,
    author: "worker",
  });
  expect(JSON.parse(readFileSync(ledgerPath, "utf8")).tickets[0]).toMatchObject({
    status: "closed",
  });
});

test("ticket comment appends explicit UTC attribution without inferring reporter", async () => {
  const { repo, service, feature } = await ticketFixture("Ticket Comments");
  service.ticketService.ticketCreate({
    spec: feature.spec,
    title: "Record discussion",
    reporter: "Reporter Name",
    category: "bug",
    author: "creator",
  });
  const path = join(feature.workspace, "tickets", "T-0001.md");
  const original =
    readFileSync(path, "utf8").replace(
      "## Comments\n",
      "## Comments\n\nHistorical comment from before this command.\n",
    ) + "\n## Follow-up\n\nPreserve this later section.\n";
  writeFileSync(path, original);
  service.ticketService.ticketComment({
    spec: feature.spec,
    ticket: "T-0001",
    details: "The investigation is complete.\nNo content should be inferred.",
    author: "investigator",
  });
  const document = matter(readFileSync(path, "utf8"));
  expect(document.content).toMatch(/Historical comment from before this command\./);
  expect(document.content).toMatch(
    /The investigation is complete\.\nNo content should be inferred\./,
  );
  expect(document.content).toMatch(/\*\*\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z - investigator\*\*/);
  const [content, followUp] = document.content.split("## Follow-up\n");
  const comments = content?.split("## Comments\n")[1];
  expect(comments).not.toContain("Reporter Name");
  expect(document.content.match(/investigator\*\*/g) ?? []).toHaveLength(1);
  expect(comments).toMatch(/The investigation is complete\./);
  expect(followUp).toBe("\nPreserve this later section.\n");
  const missingAuthor = runCli(
    repo,
    [
      "sdd",
      "ticket",
      "comment",
      "--spec",
      feature.spec,
      "--ticket",
      "T-0001",
      "--details",
      "Unattributed comment",
    ],
    process.env.PATH ?? "",
  );
  expect(missingAuthor.status).not.toBe(0);
  expect(missingAuthor.stderr.trim()).not.toBe("");
  expect(readFileSync(path, "utf8")).not.toMatch(/Unattributed comment/);
});
