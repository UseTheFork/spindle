import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { dispatchFixture } from "@test/Helpers/SubagentDrivenDevelopment/DispatchFixture";
import { expect, test } from "vitest";

test(
  "updates ticket text and dependencies while preserving other Markdown sections",
  { timeout: 20_000 },
  async () => {
    const { featureFlag, invoke, run, workspace } = await dispatchFixture();
    const ticketPath = join(workspace, "tickets", "T-0001.md");
    await writeFile(ticketPath, `${await readFile(ticketPath, "utf8")}A retained comment.\n`);
    invoke(
      "ticket",
      "update",
      ...featureFlag,
      "--ticket",
      "T-0001",
      "--title",
      "Revised title",
      "--requirements",
      "Revised requirements.",
      "--acceptance-criteria",
      "The revised criteria pass.",
    );
    const markdown = await readFile(ticketPath, "utf8");
    expect(markdown).toContain("# Revised title");
    expect(markdown).toContain("## Requirements\n\nRevised requirements.");
    expect(markdown).toContain("## Acceptance Criteria\n\nThe revised criteria pass.");
    expect(markdown).toContain("A retained comment.");

    invoke(
      "ticket",
      "create",
      ...featureFlag,
      "--title",
      "Prerequisite",
      "--requirements",
      "Prerequisite requirements.",
      "--acceptance-criteria",
      "Prerequisite is complete.",
    );
    invoke("ticket", "update", ...featureFlag, "--ticket", "T-0001", "--depends-on", "T-0002");
    const beforeCycle = await readFile(join(workspace, "sdd.json"), "utf8");
    const cycle = run(
      "ticket",
      "update",
      ...featureFlag,
      "--ticket",
      "T-0002",
      "--depends-on",
      "T-0001",
    );
    expect(cycle.status).toBe(1);
    expect(cycle.stderr).toContain("ticket-dependency-cycle");
    expect(await readFile(join(workspace, "sdd.json"), "utf8")).toBe(beforeCycle);
  },
);

test(
  "guards task write conflicts, dependencies, and edits after dispatch",
  { timeout: 20_000 },
  async () => {
    const { featureFlag, invoke, run, startTicket, task, workspace } = await dispatchFixture();
    const ticketPath = join(workspace, "tickets", "T-0001.md");
    const first = task("first.ts");
    const second = task("second.ts");
    const update = (...args: string[]) =>
      invoke("task", "update", ...featureFlag, "--ticket", "T-0001", "--task", second, ...args);
    const remove = (id: string) =>
      run("task", "remove", ...featureFlag, "--ticket", "T-0001", "--task", id);

    const beforeConflict = await readFile(join(workspace, "sdd.json"), "utf8");
    const conflict = run(
      "task",
      "update",
      ...featureFlag,
      "--ticket",
      "T-0001",
      "--task",
      second,
      "--write-scope",
      "first.ts",
    );
    expect(conflict.status).toBe(1);
    expect(conflict.stderr).toContain("unordered-write-conflict");
    expect(await readFile(join(workspace, "sdd.json"), "utf8")).toBe(beforeConflict);

    update(
      "--instructions",
      "Updated task instructions.",
      "--write-scope",
      "first.ts",
      "--depends-on",
      first,
    );
    expect(await readFile(join(workspace, "sdd.json"), "utf8")).toContain(
      "Updated task instructions.",
    );
    const dependency = remove(first);
    expect(dependency.status).toBe(1);
    expect(dependency.stderr).toContain("another task depends on it");
    update("--write-scope", "second.ts", "--clear-dependencies");
    expect(
      invoke("task", "remove", ...featureFlag, "--ticket", "T-0001", "--task", second),
    ).toMatchObject({
      removed: true,
    });

    const active = task("active.ts");
    startTicket();
    invoke("dispatch", ...featureFlag, "--task", active);
    const beforeRejectedEdits = await readFile(join(workspace, "sdd.json"), "utf8");
    const beforeCriteriaEdit = await readFile(ticketPath, "utf8");
    const updateActive = run(
      "task",
      "update",
      ...featureFlag,
      "--ticket",
      "T-0001",
      "--task",
      active,
      "--instructions",
      "Change the active assignment.",
    );
    expect(updateActive.status).toBe(1);
    expect(updateActive.stderr).toContain("before it is dispatched");
    const removeActive = remove(active);
    expect(removeActive.status).toBe(1);
    expect(removeActive.stderr).toContain("before it is dispatched");
    const updateCriteria = run(
      "ticket",
      "update",
      ...featureFlag,
      "--ticket",
      "T-0001",
      "--requirements",
      "Changed after dispatch.",
    );
    expect(updateCriteria.status).toBe(1);
    expect(updateCriteria.stderr).toContain("after a task is dispatched");
    expect(await readFile(join(workspace, "sdd.json"), "utf8")).toBe(beforeRejectedEdits);
    expect(await readFile(ticketPath, "utf8")).toBe(beforeCriteriaEdit);

    invoke("ticket", "update", ...featureFlag, "--ticket", "T-0001", "--title", "Active title");
    expect(await readFile(ticketPath, "utf8")).toContain("# Active title");
  },
);
