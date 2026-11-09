import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { runCli } from "../../helpers/Cli.ts";
import { invokeAsync, serviceFixture } from "../helpers/helpers";

test("sdd create requires named non-empty title and author options", async () => {
  const { repo } = await serviceFixture();
  const invalidArguments = [
    ["sdd", "create"],
    ["sdd", "create", "--title", "Feature"],
    ["sdd", "create", "--author", "maintainer"],
    ["sdd", "create", "--title", " ", "--author", "maintainer"],
    ["sdd", "create", "--title", "Feature", "--author", " "],
    ["sdd", "create", "--title", "Feature", "--author", "first", "--author", "second"],
    ["sdd", "create", "--title", "Feature", "--author", "maintainer", "unexpected"],
    ["sdd", "status"],
  ];

  for (const args of invalidArguments) {
    const result = runCli(repo, args, process.env.PATH ?? "");
    expect(result.status, args.join(" ")).not.toBe(0);
    expect(result.stdout, args.join(" ")).toBe("");
    expect(result.stderr.trim(), args.join(" ")).not.toBe("");
    expect(existsSync(join(repo, ".scratch")), args.join(" ")).toBe(false);
  }
});

test("SDD creation does not require valid project Config", async () => {
  const { repo } = await serviceFixture();
  mkdirSync(join(repo, ".github"), { recursive: true });
  writeFileSync(join(repo, ".github", "spindle.json"), "{ invalid");
  const result = runCli(
    repo,
    ["sdd", "create", "--title", "Config Independent", "--author", "maintainer"],
    process.env.PATH ?? "",
  );

  expect(result.status, result.stderr).toBe(0);
  expect(
    readFileSync(join(repo, ".scratch", "0001-config-independent", "spec.md"), "utf8"),
  ).toContain("# Config Independent");
});

test("concurrent sdd create commands allocate distinct consecutive feature IDs", async () => {
  const { repo } = await serviceFixture();
  const results = await Promise.all(
    ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"].map((title) =>
      invokeAsync(repo, ["create", "--title", `${title} Concurrent`, "--author", "maintainer"]),
    ),
  );
  for (const result of results) {
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
  }
  const features: string[] = results.map((result) => JSON.parse(result.stdout).feature);
  expect(features.map((feature) => feature.slice(0, 4)).sort()).toEqual([
    "0001",
    "0002",
    "0003",
    "0004",
    "0005",
    "0006",
  ]);
  expect(features.map((feature) => feature.slice(5)).sort()).toEqual([
    "fifth-concurrent",
    "first-concurrent",
    "fourth-concurrent",
    "second-concurrent",
    "sixth-concurrent",
    "third-concurrent",
  ]);
  expect(existsSync(join(repo, ".scratch", ".sdd-create.lock"))).toBe(false);
});

test("sdd review require accepts a catalog reviewer through --type", async () => {
  const { repo } = await serviceFixture();
  const created = await invokeAsync(repo, [
    "create",
    "--title",
    "Review Feature",
    "--author",
    "controller",
  ]);
  expect(created.status, created.stderr).toBe(0);
  const spec = join(repo, ".scratch", "0001-review-feature", "spec.md");

  const required = await invokeAsync(repo, [
    "review",
    "require",
    "--spec",
    spec,
    "--scope",
    "delivery",
    "--type",
    "sdd-code-reviewer",
    "--details",
    "Review the feature for security risks.",
    "--author",
    "controller",
  ]);

  expect(required.status, required.stderr).toBe(0);
  expect(JSON.parse(required.stdout).requirement.agent).toBe("sdd-code-reviewer");
});

test("sdd help advertises guarded workflow commands instead of the legacy workspace resolver", async () => {
  const { repo } = await serviceFixture();
  const searchPath = process.env.PATH ?? "";
  const help = runCli(repo, ["sdd", "--help"], searchPath);
  expect(help.status, help.stderr).toBe(0);
  for (const command of ["create", "claim", "implement", "submit", "resume", "next", "status"]) {
    expect(help.stdout).toMatch(new RegExp(`\\b${command}\\b`));
  }
  expect(help.stdout).not.toMatch(/^\s+workspace\s+\[options\]/m);
  expect(help.stderr).toBe("");

  const createHelp = runCli(repo, ["sdd", "create", "--help"], searchPath);
  expect(createHelp.status, createHelp.stderr).toBe(0);
  expect(createHelp.stdout).toMatch(/--title <title>/);
  expect(createHelp.stdout).toMatch(/--author <author>/);
  expect(createHelp.stdout).toMatch(/--require-retrospective/);
  expect(createHelp.stdout).toMatch(/--with-design/);
  const submitHelp = runCli(repo, ["sdd", "submit", "--help"], searchPath);
  expect(submitHelp.status, submitHelp.stderr).toBe(0);
  expect(submitHelp.stdout).toMatch(/--role <role>/);
  expect(submitHelp.stdout).toMatch(/--report <path>/);
  expect(submitHelp.stdout).toMatch(/--unavailable/);
  expect(submitHelp.stdout).toMatch(/--details <details>/);
  expect(submitHelp.stderr).toBe("");
  const statusHelp = runCli(repo, ["sdd", "status", "--help"], searchPath);
  expect(statusHelp.status, statusHelp.stderr).toBe(0);
  expect(statusHelp.stdout).toMatch(/--spec <path>/);
  const legacy = runCli(repo, ["sdd", "workspace"], searchPath);
  expect(legacy.status).not.toBe(0);
  expect(legacy.stdout).toBe("");
  expect(legacy.stderr).toMatch(/unknown command 'workspace'/);
});

test("sdd create and status expose JSON results and report path errors through the CLI", async () => {
  const { repo, service } = await serviceFixture();
  const searchPath = process.env.PATH ?? "";
  const created = runCli(
    repo,
    [
      "sdd",
      "create",
      "--title",
      "CLI Feature",
      "--author",
      "maintainer",
      "--require-retrospective",
      "--with-design",
    ],
    searchPath,
  );
  expect(created.status, created.stderr).toBe(0);
  expect(created.stderr).toBe("");
  const expected = {
    feature: "0001-cli-feature",
    workspace: join(repo, ".scratch", "0001-cli-feature"),
    spec: join(repo, ".scratch", "0001-cli-feature", "spec.md"),
    ledger: join(repo, ".scratch", "0001-cli-feature", "sdd.json"),
  };
  expect(JSON.parse(created.stdout)).toEqual(expected);
  expect(readFileSync(expected.spec, "utf8")).toContain("# CLI Feature");
  expect(existsSync(join(repo, ".scratch", "0001-cli-feature", "design.md"))).toBe(true);
  const status = runCli(repo, ["sdd", "status", "--spec", expected.spec], searchPath);
  expect(status.status, status.stderr).toBe(0);
  expect(status.stderr).toBe("");
  expect(JSON.parse(status.stdout)).toEqual(
    service.featureInspectionService.status({ spec: expected.spec }),
  );
  expect(JSON.parse(status.stdout).state.retrospectiveRequired).toBe(true);
  const invalid = runCli(
    repo,
    ["sdd", "status", "--spec", `${repo}/.scratch/../.scratch/0001-cli-feature/spec.md`],
    searchPath,
  );
  expect(invalid.status).not.toBe(0);
  expect(invalid.stdout).toBe("");
  expect(invalid.stderr).toMatch(/spindle:/);
});

test("sdd ticket create writes T IDs, ticket storage, and the shared fill-in template", async () => {
  const { repo } = await serviceFixture();
  const feature = await invokeAsync(repo, [
    "create",
    "--title",
    "Ticket Feature",
    "--author",
    "controller",
  ]);
  expect(feature.status, feature.stderr).toBe(0);
  const spec = join(repo, ".scratch", "0001-ticket-feature", "spec.md");
  const created = await invokeAsync(repo, [
    "ticket",
    "create",
    "--spec",
    spec,
    "--title",
    "Add export",
    "--reporter",
    "maintainer",
    "--category",
    "enhancement",
    "--author",
    "controller",
  ]);

  expect(created.status, created.stderr).toBe(0);
  expect(JSON.parse(created.stdout)).toEqual({
    ticket: "T-0001",
    path: join(repo, ".scratch", "0001-ticket-feature", "tickets", "T-0001.md"),
  });
  const ticket = readFileSync(
    join(repo, ".scratch", "0001-ticket-feature", "tickets", "T-0001.md"),
    "utf8",
  );
  expect(ticket).toMatch(/^id: T-0001$/m);
  expect(ticket).toContain("# Add export");
  expect(ticket).toContain("**Reporter:** maintainer");
  expect(ticket).toContain("**Category:** enhancement");
  expect(ticket).toContain("**Author:** controller");
  expect(ticket).toContain("## Requirements\n\n[REQUIREMENTS]");
  expect(ticket).toContain("## Acceptance Criteria\n\n[ACCEPTANCE CRITERIA]");
  expect(ticket).toContain("## Comments");
  const ledger = JSON.parse(
    readFileSync(join(repo, ".scratch", "0001-ticket-feature", "sdd.json"), "utf8"),
  );
  expect(ledger).not.toHaveProperty("issues");
  expect(ledger.tickets).toEqual([
    {
      id: "T-0001",
      title: "Add export",
      reporter: "maintainer",
      category: "enhancement",
      status: "open",
      blockedBy: [],
      execution: "unstarted",
    },
  ]);
  const legacyCommand = await invokeAsync(repo, ["issue", "create"]);
  expect(legacyCommand.status).not.toBe(0);
  expect(legacyCommand.stderr).toMatch(/unknown command 'issue'/);
});
