import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runCli, runCliRaw } from "@test/Helpers/Cli";
import { makeTempDir } from "@test/Helpers/TemporaryDirectories";
import { expect, test } from "vitest";

test("creates numbered feature workspaces and reports an empty graph", async () => {
  const project = await makeTempDir();
  const path = process.env.PATH ?? "";
  const features = join(project, ".spindle", "features");
  await mkdir(join(project, ".spindle"));
  await writeFile(join(project, ".spindle", "config.json"), '{"stacks":["typescript"]}');

  const first = runCli(
    project,
    ["--json", "sdd", "create", "--slug", "first", "--spec", "First spec"],
    path,
  );
  expect(first.status, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout)).toEqual({
    ok: true,
    data: { name: "0001-first", workspace: join(features, "0001-first") },
  });

  const specification = "# Second spec\n\nMultiple lines.\n";
  const nextDirectory = join(features, "0002-second");
  const second = runCliRaw(
    project,
    ["sdd", "create", "--slug", "second", "--spec", "-", "--design", "Optional design"],
    path,
    {},
    specification,
  );
  expect(second.status, second.stderr).toBe(0);
  expect(second.stdout).toContain(nextDirectory);
  expect(await readFile(join(nextDirectory, "spec.md"), "utf8")).toBe(specification);
  expect(await readFile(join(nextDirectory, "design.md"), "utf8")).toBe("Optional design");
  expect(await readdir(features)).toHaveLength(2);

  const next = runCliRaw(project, ["--json", "sdd", "next", "--feature", nextDirectory], path);
  expect(next.status, next.stderr).toBe(0);
  expect(JSON.parse(next.stdout)).toMatchObject({
    ok: true,
    data: {
      feature: "0002-second",
      actions: [],
      tickets: [],
      notices: ["No tickets in this feature.", "No workflow actions available in this CLI yet."],
    },
  });
});

test("ticket and task creation drive readiness and reject invalid graph changes", async () => {
  const project = await makeTempDir();
  await mkdir(join(project, ".spindle"));
  await writeFile(join(project, ".spindle", "config.json"), '{"stacks":["typescript"]}');
  const run = (args: string[]) => runCli(project, ["sdd", ...args], process.env.PATH ?? "");
  const created = run(["create", "--slug", "blocked", "--spec", "# Spec"]);
  expect(created.status, created.stderr).toBe(0);
  const name = "0001-blocked";
  const workspace = join(project, ".spindle", "features", name);
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
