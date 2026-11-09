import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { serviceFixture } from "../helpers/helpers";
import { ticketFixture } from "../helpers/ticket-helpers";

test("sdd status reads the explicitly selected feature policy and progress without mutation", async () => {
  const { repo, git, service } = await serviceFixture();
  service.featureCreationService.create({ title: "First Feature", author: "maintainer" });
  const second = service.featureCreationService.create({
    title: "Second Feature",
    author: "maintainer",
    requireRetrospective: true,
  });
  const secondLedger = readFileSync(second.ledger, "utf8");
  const beforeStatus = git("status", "--porcelain=v1");
  const state = JSON.parse(secondLedger);

  expect(service.featureInspectionService.status({ spec: second.spec })).toEqual({
    feature: second.feature,
    workspace: join(repo, ".scratch", second.feature),
    spec: second.spec,
    ledger: second.ledger,
    state,
    snapshots: [],
    findings: [],
    requirementsDecisions: [],
    actions: [],
    pendingAssignments: [],
    blockers: [],
    delivery: {
      scope: "delivery",
      execution: "unstarted",
      status: "active",
      baseSha: state.delivery.baseSha,
      action: "close-tickets",
      retrospectiveRequired: true,
      finished: false,
      findings: [],
      correctionAttempts: [],
      reviewRequirements: [],
      reviewAssignments: [],
      requiredChecks: [],
      checkRecords: [],
      blockers: ["Tickets are not closed: feature has no tickets."],
    },
  });
  expect(state.retrospectiveRequired).toBe(true);
  expect(state.reviewPolicy).toEqual({
    version: 1,
    ticket: ["sdd-reviewer"],
    delivery: ["sdd-reviewer"],
  });
  expect(state.delivery).toMatchObject({
    status: "active",
    baseSha: expect.stringMatching(/^[0-9a-f]{40}$/),
    execution: "unstarted",
    history: [],
  });
  expect(readFileSync(second.ledger, "utf8")).toBe(secondLedger);
  expect(git("status", "--porcelain=v1")).toBe(beforeStatus);
});

test("sdd status rejects normalized traversal paths and legacy feature layouts", async () => {
  const { repo, service, feature } = await ticketFixture("Current Feature");
  const linkedFeature = join(repo, ".scratch", "0002-linked-feature");
  symlinkSync(feature.workspace, linkedFeature);
  const legacy = join(repo, ".scratch", "2026-11-06-legacy-feature");
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, "spec.md"), "# Legacy\n");
  writeFileSync(join(legacy, "sdd.json"), "{}\n");

  for (const spec of [
    `${repo}/.scratch/../.scratch/${feature.feature}/spec.md`,
    join(linkedFeature, "spec.md"),
    join(legacy, "spec.md"),
  ]) {
    expect(() => service.featureInspectionService.status({ spec }), spec).toThrow();
  }
});

test("sdd status reads a stored policy version without substituting current defaults", async () => {
  const { service, feature } = await ticketFixture("Pinned Policy");
  const ledger = JSON.parse(readFileSync(feature.ledger, "utf8"));
  ledger.reviewPolicy = {
    version: 7,
    ticket: ["pinned-ticket-reviewer"],
    delivery: ["pinned-delivery-reviewer"],
  };
  writeFileSync(feature.ledger, `${JSON.stringify(ledger, null, 2)}\n`);
  const before = readFileSync(feature.ledger, "utf8");
  expect(
    service.featureInspectionService.status({ spec: feature.spec }).state.reviewPolicy,
  ).toEqual(ledger.reviewPolicy);
  expect(readFileSync(feature.ledger, "utf8")).toBe(before);
});

test("sdd status rejects unsupported ledger schema versions without rewriting the ledger", async () => {
  const { service, feature } = await ticketFixture("Versioned Feature");
  const ledger = JSON.parse(readFileSync(feature.ledger, "utf8"));
  ledger.schemaVersion = 2;
  writeFileSync(feature.ledger, `${JSON.stringify(ledger, null, 2)}\n`);
  const before = readFileSync(feature.ledger, "utf8");
  expect(() => service.featureInspectionService.status({ spec: feature.spec })).toThrow(
    /Unsupported feature ledger schema version: 2/,
  );
  expect(readFileSync(feature.ledger, "utf8")).toBe(before);
});

test("sdd status validates ticket and delivery history records without rewriting the ledger", async () => {
  const { service, feature } = await ticketFixture("Nested Records");
  const original = JSON.parse(readFileSync(feature.ledger, "utf8"));
  const malformedLedgers = [
    { ...original, tickets: [null] },
    { ...original, tickets: [{ id: "T-0001" }] },
    { ...original, tickets: [{ id: 1, execution: "claimed" }] },
    {
      ...original,
      tickets: [
        {
          id: "T-0001",
          title: "Work",
          reporter: "author",
          category: "bug",
          status: "open",
          blockedBy: [],
          execution: 1,
        },
      ],
    },
    { ...original, delivery: { ...original.delivery, history: [null] } },
    {
      ...original,
      delivery: {
        ...original.delivery,
        history: [{ at: "not-a-timestamp", author: "maintainer", action: "claimed" }],
      },
    },
    {
      ...original,
      delivery: {
        ...original.delivery,
        history: [{ at: "2026-11-07T12:00:00Z", action: "claimed" }],
      },
    },
  ];

  for (const malformed of malformedLedgers) {
    const contents = `${JSON.stringify(malformed, null, 2)}\n`;
    writeFileSync(feature.ledger, contents);
    expect(() => service.featureInspectionService.status({ spec: feature.spec })).toThrow(
      /Feature (?:ticket records|delivery history records)/,
    );
    expect(readFileSync(feature.ledger, "utf8")).toBe(contents);
  }

  const legacy = {
    ...original,
    schemaVersion: 2,
    issues: [],
  };
  delete legacy.tickets;
  const legacyContents = `${JSON.stringify(legacy, null, 2)}\n`;
  writeFileSync(feature.ledger, legacyContents);
  expect(() => service.featureInspectionService.status({ spec: feature.spec })).toThrow(
    /Unsupported feature ledger schema version: 2/,
  );
  expect(readFileSync(feature.ledger, "utf8")).toBe(legacyContents);
});
