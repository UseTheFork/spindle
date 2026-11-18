import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { applicationFixture } from "@test/Helpers/ApplicationFixture";
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

test("next reports persisted blockers without offering unimplemented commands or writing records", async () => {
  const project = await makeTempDir();
  await mkdir(join(project, ".spindle"));
  await writeFile(join(project, ".spindle", "config.json"), '{"stacks":["typescript"]}');
  const app = applicationFixture(project, "");
  await app.boot();
  const service = await app.make(FeatureWorkspaceService);
  const { name, workspace } = await service.createNumbered("blocked", { specification: "# Spec" });
  await writeFile(
    join(workspace, "tickets", "T-0001.md"),
    "## Requirements\nScope.\n## Acceptance Criteria\nDone.",
  );
  await service.updateLedger(name, (ledger) => ({
    ...ledger,
    tickets: [
      {
        id: "T-0001",
        title: "Implement",
        dependencies: [],
        tasks: [],
        workRoundCommits: [],
        merged: false,
      },
    ],
  }));
  const ledgerPath = join(workspace, "sdd.json");
  const before = await readFile(ledgerPath, "utf8");
  const run = (args: string[]) => runCli(project, args, process.env.PATH ?? "");

  const human = run(["sdd", "next", "--feature", name]);
  expect(human.status, human.stderr).toBe(0);
  expect(human.stdout).toContain("T-0001: no tasks");
  const json = run(["sdd", "next", "--feature", name, "--verbose", "--json"]);
  expect(json.status, json.stderr).toBe(0);
  expect(JSON.parse(json.stdout)).toMatchObject({
    ok: true,
    data: {
      actions: [],
      tickets: [{ ticketId: "T-0001", ready: false, blockers: [{ code: "no-tasks" }] }],
      graph: [{ id: "T-0001", dependencies: [], merged: false, tasks: [] }],
    },
  });
  expect(await readFile(ledgerPath, "utf8")).toBe(before);
});
