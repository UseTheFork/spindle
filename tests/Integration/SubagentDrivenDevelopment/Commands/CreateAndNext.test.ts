import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { RenderText } from "@spindle/TemplateRendering/Rendering/RenderText";
import { runCli, runCliRaw } from "@test/Helpers/Cli";
import { makeTempDir, repoRoot } from "@test/Helpers/TemporaryDirectories";
import { expect, test } from "vitest";

test("creates numbered feature workspaces and reports an empty graph", async () => {
  const project = await makeTempDir();
  const path = process.env.PATH ?? "";
  const features = join(project, ".spindle", "features");
  await mkdir(join(project, ".spindle"));
  await writeFile(join(project, ".spindle", "config.json"), '{"stacks":["typescript"]}');

  const first = runCli(project, ["--json", "sdd", "create", "--slug", "first"], path);
  expect(first.status, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout)).toEqual({
    ok: true,
    data: { name: "0001-first", workspace: join(features, "0001-first") },
  });

  const nextDirectory = join(features, "0002-second");
  const second = runCliRaw(project, ["sdd", "create", "--slug", "second"], path, {});
  expect(second.status, second.stderr).toBe(0);
  expect(second.stdout).toContain(nextDirectory);
  for (const document of ["spec.md", "design.md"]) {
    const template = await readFile(join(repoRoot, "assets", "Templates", "sdd", document), "utf8");
    expect(await readFile(join(nextDirectory, document), "utf8")).toBe(
      RenderText.render(template, { stacks: [], variables: {} }),
    );
  }
  expect(await readdir(features)).toHaveLength(2);
  expect(JSON.parse(await readFile(join(nextDirectory, "sdd.json"), "utf8"))).toMatchObject({
    ledgerRepositoryRoot: await realpath(project),
  });

  const next = runCliRaw(project, ["--json", "sdd", "next", "--feature", nextDirectory], path);
  expect(next.status, next.stderr).toBe(0);
  expect(JSON.parse(next.stdout)).toMatchObject({
    ok: true,
    data: {
      feature: "0002-second",
      actions: [],
      tickets: [],
      notices: [
        "No tickets in this feature.",
        "Fill in spec.md with the approved specification before creating tickets or starting work.",
      ],
    },
  });

  const nested = join(project, "nested");
  await mkdir(nested);
  const nestedNext = runCliRaw(nested, ["--json", "sdd", "next", "--feature", "0002-second"], path);
  expect(nestedNext.status, nestedNext.stderr).toBe(0);

  const other = await makeTempDir();
  await mkdir(join(other, ".spindle"));
  await writeFile(join(other, ".spindle", "config.json"), '{"stacks":["typescript"]}');
  const wrongCheckout = runCli(other, ["--json", "sdd", "next", "--feature", nextDirectory], path);
  expect(wrongCheckout.status).toBe(1);
  expect(wrongCheckout.stderr).toContain(`Run this command from '${await realpath(project)}'.`);

  const copiedFeatures = join(other, ".spindle", "features");
  await mkdir(copiedFeatures);
  await cp(nextDirectory, join(copiedFeatures, "0002-second"), { recursive: true });
  const copiedLedger = runCli(other, ["--json", "sdd", "next", "--feature", "0002-second"], path);
  expect(copiedLedger.status).toBe(1);
  expect(copiedLedger.stderr).toContain(`Run this command from '${await realpath(project)}'.`);

  const missing = runCli(other, ["--json", "sdd", "next", "--feature", "0003-missing"], path);
  expect(missing.status).toBe(1);
  expect(missing.stderr).toContain("was not found in this checkout");
});

test("templates and a saved design do not enable implementation before the spec is filled in", async () => {
  const project = await makeTempDir();
  execFileSync("git", ["init", "-q"], { cwd: project });
  await mkdir(join(project, ".spindle"));
  await writeFile(join(project, ".spindle", "config.json"), '{"stacks":["typescript"]}');
  const path = process.env.PATH ?? "";
  const run = (args: string[]) => runCliRaw(project, ["sdd", ...args], path);
  const feature = "0001-design-first";
  const workspace = join(project, ".spindle", "features", feature);
  const ledger = join(workspace, "sdd.json");
  const design = "# Design\n\nDesign first.\n";
  const created = run(["create", "--slug", "design-first"]);
  expect(created.status, created.stderr).toBe(0);
  const template = await readFile(join(workspace, "spec.md"), "utf8");
  const initial = run(["next", "--feature", feature, "--json"]);
  expect(initial.status, initial.stderr).toBe(0);
  expect(JSON.parse(initial.stdout).data.actions).toEqual([]);
  await writeFile(join(workspace, "design.md"), design);
  expect(await readFile(join(workspace, "design.md"), "utf8")).toBe(design);
  const before = await readFile(ledger, "utf8");

  const next = run(["next", "--feature", feature, "--json"]);
  expect(next.status, next.stderr).toBe(0);
  expect(JSON.parse(next.stdout)).toMatchObject({
    data: {
      feature,
      actions: [],
      notices: expect.arrayContaining([expect.stringContaining("spec.md")]),
    },
  });
  const start = run(["start", "--feature", feature]);
  expect(start.status).not.toBe(0);
  expect(start.stderr).toContain("requires a non-empty spec.md");
  const ticket = [
    "ticket",
    "create",
    "--feature",
    feature,
    "--title",
    "Implement",
    "--requirements",
    "Scope.",
    "--acceptance-criteria",
    "Done.",
  ];
  const blocked = run(ticket);
  expect(blocked.status).not.toBe(0);
  expect(blocked.stderr).toContain("requires a non-empty spec.md");
  expect(await readFile(ledger, "utf8")).toBe(before);
  expect(await readdir(join(workspace, "tickets"))).toEqual([]);
  expect(await readFile(join(workspace, "spec.md"), "utf8")).toBe(template);

  await writeFile(join(workspace, "spec.md"), "# Approved spec\n");
  const recorded = run(ticket);
  expect(recorded.status, recorded.stderr).toBe(0);
  expect(await readdir(join(workspace, "tickets"))).toEqual(["T-0001.md"]);
  expect(await readFile(join(workspace, "design.md"), "utf8")).toBe(design);
});

test("ticket and task creation drive readiness and reject invalid graph changes", async () => {
  const project = await makeTempDir();
  await mkdir(join(project, ".spindle"));
  await writeFile(join(project, ".spindle", "config.json"), '{"stacks":["typescript"]}');
  const run = (args: string[]) => runCli(project, ["sdd", ...args], process.env.PATH ?? "");
  const created = run(["create", "--slug", "blocked"]);
  expect(created.status, created.stderr).toBe(0);
  const name = "0001-blocked";
  const workspace = join(project, ".spindle", "features", name);
  await writeFile(join(workspace, "spec.md"), "# Spec");
  const ledgerPath = join(workspace, "sdd.json");
  const ticketArgs = [
    "ticket",
    "create",
    "--feature",
    workspace,
    "--title",
    "Implement",
    "--requirements",
    "Scope.",
    "--acceptance-criteria",
    "Done.",
    "--json",
  ];
  const emptyLedger = await readFile(ledgerPath, "utf8");
  const invalidTicket = run([...ticketArgs, "--depends-on", "T-9999"]);
  expect(invalidTicket.status).toBe(1);
  expect(invalidTicket.stderr).toContain("unknown-ticket-dependency");
  expect(await readdir(join(workspace, "tickets"))).toEqual([]);
  expect(await readFile(ledgerPath, "utf8")).toBe(emptyLedger);

  const ticket = run(ticketArgs);
  expect(ticket.status, ticket.stderr).toBe(0);
  const ticketPath = join(workspace, "tickets", "T-0001.md");
  expect(JSON.parse(ticket.stdout)).toEqual({
    ok: true,
    data: { ticket: "T-0001", path: ticketPath },
  });
  expect(await readFile(ticketPath, "utf8")).toContain(
    "## Requirements\n\nScope.\n\n## Acceptance Criteria\n\nDone.",
  );

  const human = run(["next", "--feature", name]);
  expect(human.status, human.stderr).toBe(0);
  expect(human.stdout).toContain("T-0001: no tasks");

  const taskArgs = [
    "task",
    "create",
    "--feature",
    name,
    "--ticket",
    "T-0001",
    "--instructions",
    "Edit the schema.",
    "--write-scope",
    "src/Schema.ts",
    "--json",
  ];
  const task = run([...taskArgs, "--write-scope", "src/Schema.test.ts"]);
  expect(task.status, task.stderr).toBe(0);
  expect(JSON.parse(task.stdout)).toEqual({
    ok: true,
    data: { ticket: "T-0001", task: "T-0001.1" },
  });
  const before = await readFile(ledgerPath, "utf8");
  const conflict = run(taskArgs);
  expect(conflict.status).toBe(1);
  expect(conflict.stderr).toContain("unordered-write-conflict");
  expect(await readFile(ledgerPath, "utf8")).toBe(before);
  const ordered = run([...taskArgs, "--depends-on", "T-0001.1"]);
  expect(ordered.status, ordered.stderr).toBe(0);
  expect(JSON.parse(ordered.stdout)).toMatchObject({ data: { task: "T-0001.2" } });

  const published = await readFile(ledgerPath, "utf8");
  const json = run(["next", "--feature", name, "--verbose", "--json"]);
  expect(json.status, json.stderr).toBe(0);
  expect(JSON.parse(json.stdout)).toMatchObject({
    ok: true,
    data: {
      actions: [],
      tickets: [
        {
          ticketId: "T-0001",
          ready: true,
          blockers: [],
          tasks: [
            { taskId: "T-0001.1", ready: false, blockers: [{ code: "no-worktree" }] },
            {
              taskId: "T-0001.2",
              ready: false,
              blockers: [
                { code: "no-worktree" },
                { code: "dependency-not-done", dependencyId: "T-0001.1" },
              ],
            },
          ],
        },
      ],
      graph: [
        {
          id: "T-0001",
          tasks: [
            { id: "T-0001.1", writeScope: ["src/Schema.ts", "src/Schema.test.ts"] },
            { id: "T-0001.2", dependencies: ["T-0001.1"] },
          ],
        },
      ],
    },
  });
  expect(await readFile(ledgerPath, "utf8")).toBe(published);
});
