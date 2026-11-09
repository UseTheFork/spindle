import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { serviceFixture } from "../helpers/helpers";

test("sdd create writes a numbered feature workspace with its default ledger policy", async () => {
  const { repo, service } = await serviceFixture();
  const result = service.featureCreationService.create({
    title: "Command Driven SDD",
    author: "maintainer",
  });
  const featureDirectory = join(repo, ".scratch", "0001-command-driven-sdd");
  const expected = {
    feature: "0001-command-driven-sdd",
    workspace: featureDirectory,
    spec: join(featureDirectory, "spec.md"),
    ledger: join(featureDirectory, "sdd.json"),
  };
  expect(result).toEqual(expected);
  expect(readFileSync(expected.spec, "utf8")).toBe(
    "# [FEATURE TITLE]\n\n## Problem Statement\n\n[PROBLEM STATEMENT]\n\n## Solution\n\n[SOLUTION]\n\n## User Stories\n\n[USER STORIES]\n\n## Implementation Decisions\n\n[IMPLEMENTATION DECISIONS]\n\n## Testing Decisions\n\n[TESTING DECISIONS]\n\n## Out of Scope\n\n[OUT OF SCOPE]\n\n## Further Notes\n\n[FURTHER NOTES]\n",
  );
  expect(existsSync(join(featureDirectory, "tickets"))).toBe(true);
  expect(existsSync(join(featureDirectory, "reports"))).toBe(true);
  expect(readdirSync(featureDirectory).sort()).toEqual([
    "reports",
    "sdd.json",
    "spec.md",
    "tickets",
  ]);

  const ledger = JSON.parse(readFileSync(expected.ledger, "utf8"));
  expect(ledger.schemaVersion).toBe(3);
  expect(ledger.featureId).toBe("0001");
  expect(ledger.title).toBe("Command Driven SDD");
  expect(ledger.createdBy).toBe("maintainer");
  expect(ledger.retrospectiveRequired).toBe(false);
  expect(ledger.reviewPolicy).toEqual({
    version: 1,
    ticket: ["sdd-reviewer"],
    delivery: ["sdd-reviewer"],
  });
  expect(ledger.delivery.status).toBe("active");
  expect(ledger.delivery.baseSha).toMatch(/^[0-9a-f]{40}$/);
});

test("sdd create optionally copies the design template without substituting placeholders", async () => {
  const { repo, service } = await serviceFixture();
  const result = service.featureCreationService.create({
    title: "Command Driven SDD",
    author: "maintainer",
    withDesign: true,
  });
  const design = join(repo, ".scratch", "0001-command-driven-sdd", "design.md");

  expect(readFileSync(result.spec, "utf8")).toContain("# [FEATURE TITLE]");
  expect(readFileSync(design, "utf8")).toBe(
    "# [FEATURE TITLE]\n\n## Intent\n\n[INTENT]\n\n## Success Criteria\n\n[SUCCESS CRITERIA]\n\n## Scope and Constraints\n\n[SCOPE AND CONSTRAINTS]\n\n## Approaches Considered\n\n[APPROACHES AND TRADE-OFFS]\n\n## Selected Direction\n\n[SELECTED DIRECTION]\n\n## Assumptions and Open Decisions\n\n[ASSUMPTIONS AND OPEN DECISIONS]\n",
  );
  expect(readdirSync(join(repo, ".scratch", result.feature)).sort()).toEqual([
    "design.md",
    "reports",
    "sdd.json",
    "spec.md",
    "tickets",
  ]);
});

test("sdd create allocates above matching IDs and ignores dated and unrelated directories", async () => {
  const { repo, service } = await serviceFixture();
  const scratch = join(repo, ".scratch");
  mkdirSync(join(scratch, "0007-older-feature"), { recursive: true });
  mkdirSync(join(scratch, "0012-another-feature"), { recursive: true });
  mkdirSync(join(scratch, "2026-11-06-historical-feature"), { recursive: true });
  mkdirSync(join(scratch, "notes"), { recursive: true });
  writeFileSync(join(scratch, "0007-older-feature", "preserve.md"), "existing content\n");

  const output = service.featureCreationService.create({
    title: "Newest Feature",
    author: "maintainer",
  });
  expect(output.feature).toBe("0013-newest-feature");
  expect(readFileSync(join(scratch, "0007-older-feature", "preserve.md"), "utf8")).toBe(
    "existing content\n",
  );
  expect(existsSync(join(scratch, "2026-11-06-historical-feature", "sdd.json"))).toBe(false);
});

test("sdd create compares large matching IDs without numeric precision loss", async () => {
  const { repo, service } = await serviceFixture();
  mkdirSync(join(repo, ".scratch", "9007199254740993-previous-feature"), { recursive: true });
  expect(
    service.featureCreationService.create({ title: "Next Large Feature", author: "maintainer" })
      .feature,
  ).toBe("9007199254740994-next-large-feature");
});

test("sdd create reports abandoned staging content without overwriting or publishing it", async () => {
  const { repo, service } = await serviceFixture();
  const abandoned = join(repo, ".scratch", ".sdd-create-interrupted");
  mkdirSync(abandoned, { recursive: true });
  writeFileSync(join(abandoned, "spec.md"), "partial content\n");
  const create = () =>
    service.featureCreationService.create({ title: "Recoverable Feature", author: "maintainer" });
  expect(create).toThrow(
    /(?=.*(?:incomplete.*creation|creation.*incomplete))(?=.*sdd-create-interrupted)/i,
  );
  expect(readFileSync(join(abandoned, "spec.md"), "utf8")).toBe("partial content\n");
  expect(existsSync(join(repo, ".scratch", "0001-recoverable-feature"))).toBe(false);
});

test("sdd create preserves a stale lock and gives an explicit recovery instruction", async () => {
  const { repo, service } = await serviceFixture();
  const scratch = join(repo, ".scratch");
  mkdirSync(scratch);
  const lockPath = join(scratch, ".sdd-create.lock");
  const lock = JSON.stringify({ pid: 2_147_483_647, createdAt: Date.now() - 60_000 });
  writeFileSync(lockPath, lock);
  const create = () =>
    service.featureCreationService.create({ title: "Locked Feature", author: "maintainer" });
  expect(create).toThrow(/(?=.*(?:stale.*lock|lock.*stale))(?=.*(?:confirm|verify))/i);
  expect(readFileSync(lockPath, "utf8")).toBe(lock);
  expect(existsSync(join(scratch, "0001-locked-feature"))).toBe(false);
});

test("sdd create rejects symlinked and ignored destinations without overwriting outside content", async () => {
  const { repo, service } = await serviceFixture();
  const outside = join(repo, "..", "outside-scratch");
  mkdirSync(outside);
  writeFileSync(join(outside, "keep.txt"), "outside content\n");
  symlinkSync(outside, join(repo, ".scratch"));

  const create = () =>
    service.featureCreationService.create({ title: "Unsafe Feature", author: "maintainer" });
  expect(create).toThrow();
  expect(readFileSync(join(outside, "keep.txt"), "utf8")).toBe("outside content\n");
  rmSync(join(repo, ".scratch"));
  writeFileSync(join(repo, ".gitignore"), ".scratch/\n");
  expect(create).toThrow();
  expect(existsSync(join(repo, ".scratch"))).toBe(false);
  writeFileSync(join(repo, ".gitignore"), ".scratch/*/sdd.json\n");
  expect(create).toThrow();
  expect(existsSync(join(repo, ".scratch", "0001-unsafe-feature"))).toBe(false);
  writeFileSync(join(repo, ".gitignore"), ".scratch/*/design.md\n");
  expect(() =>
    service.featureCreationService.create({
      title: "Unsafe Feature",
      author: "maintainer",
      withDesign: true,
    }),
  ).toThrow(/Feature destination is ignored: .scratch\/0001-unsafe-feature\/design\.md/);
  expect(existsSync(join(repo, ".scratch", "0001-unsafe-feature"))).toBe(false);
});
