import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { serviceFixture } from "./helpers.ts";
import { issueFixture } from "./issue-helpers.ts";

test("sdd status reads the explicitly selected feature policy and progress without mutation", () => {
  const { repo, git, service } = serviceFixture();
  service.create({ title: "First Feature", author: "maintainer" });
  const second = service.create({
    title: "Second Feature",
    author: "maintainer",
    requireRetrospective: true,
  });
  const secondLedger = readFileSync(second.ledger, "utf8");
  const beforeStatus = git("status", "--porcelain=v1");
  const state = JSON.parse(secondLedger);

  expect(service.status({ spec: second.spec })).toEqual({
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
      action: "review",
      retrospectiveRequired: true,
      finished: false,
      findings: [],
      correctionAttempts: [],
      reviewRequirements: [],
      reviewAssignments: [],
      requiredChecks: [],
      checkRecords: [],
      blockers: ["Aggregate evidence requires at least one issue."],
    },
  });
  expect(state.retrospectiveRequired).toBe(true);
  expect(state.reviewPolicy).toEqual({
    version: 1,
    issue: ["sdd-reviewer"],
    delivery: ["sdd-reviewer"],
  });
  expect(state.delivery).toEqual({ execution: "unstarted", history: [] });
  expect(readFileSync(second.ledger, "utf8")).toBe(secondLedger);
  expect(git("status", "--porcelain=v1")).toBe(beforeStatus);
});

test("sdd status rejects normalized traversal paths and legacy feature layouts", () => {
  const { repo, service, feature } = issueFixture("Current Feature");
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
    expect(() => service.status({ spec }), spec).toThrow();
  }
});

test("sdd status reads a stored policy version without substituting current defaults", () => {
  const { service, feature } = issueFixture("Pinned Policy");
  const ledger = JSON.parse(readFileSync(feature.ledger, "utf8"));
  ledger.reviewPolicy = {
    version: 7,
    issue: ["pinned-issue-reviewer"],
    delivery: ["pinned-delivery-reviewer"],
  };
  writeFileSync(feature.ledger, `${JSON.stringify(ledger, null, 2)}\n`);
  const before = readFileSync(feature.ledger, "utf8");
  expect(service.status({ spec: feature.spec }).state.reviewPolicy).toEqual(ledger.reviewPolicy);
  expect(readFileSync(feature.ledger, "utf8")).toBe(before);
});

test("sdd status rejects unsupported ledger schema versions without rewriting the ledger", () => {
  const { service, feature } = issueFixture("Versioned Feature");
  const ledger = JSON.parse(readFileSync(feature.ledger, "utf8"));
  ledger.schemaVersion = 2;
  writeFileSync(feature.ledger, `${JSON.stringify(ledger, null, 2)}\n`);
  const before = readFileSync(feature.ledger, "utf8");
  expect(() => service.status({ spec: feature.spec })).toThrow(
    /Unsupported feature ledger schema version: 2/,
  );
  expect(readFileSync(feature.ledger, "utf8")).toBe(before);
});

test("sdd status validates v1 issue and delivery history records without rewriting the ledger", () => {
  const { service, feature } = issueFixture("Nested Records");
  const original = JSON.parse(readFileSync(feature.ledger, "utf8"));
  const malformedLedgers = [
    { ...original, issues: [null] },
    { ...original, issues: [{ id: "I-0001" }] },
    { ...original, issues: [{ id: 1, execution: "claimed" }] },
    { ...original, issues: [{ id: "I-0001", execution: 1 }] },
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
    expect(() => service.status({ spec: feature.spec })).toThrow(
      /Feature (?:issue records|delivery history records)/,
    );
    expect(readFileSync(feature.ledger, "utf8")).toBe(contents);
  }

  const valid = {
    ...original,
    issues: [{ id: "I-0001", execution: "claimed" }],
    delivery: {
      execution: "unstarted",
      history: [{ at: "2026-11-07T12:00:00Z", author: "maintainer", action: "created" }],
    },
  };
  const validContents = `${JSON.stringify(valid, null, 2)}\n`;
  writeFileSync(feature.ledger, validContents);
  const result = service.status({ spec: feature.spec });
  expect(result.state.issues[0].execution).toBe("claimed");
  expect(result.state.delivery.history[0].action).toBe("created");
  expect(readFileSync(feature.ledger, "utf8")).toBe(validContents);
});
