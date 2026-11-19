import { open, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Application } from "@spindle/Foundation/Application";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { SubagentDrivenDevelopmentServiceProvider } from "@spindle/SubagentDrivenDevelopment/SubagentDrivenDevelopmentServiceProvider";
import { makeTempDir } from "@test/Helpers/TemporaryDirectories";
import { expect, test } from "vitest";

const name = "0001-example";
const serviceFor = async (root: string) => {
  const app = new Application({ basePath: root });
  app.instance("path.workspace", root);
  app.register(SubagentDrivenDevelopmentServiceProvider);
  await app.boot();
  return app.make(FeatureWorkspaceService);
};

test("creates and loads a workspace without putting Markdown in the ledger", async () => {
  const root = await makeTempDir();
  const service = await serviceFor(root);
  const workspace = join(root, ".spindle", "features", name);
  const input = { name, specification: "# Spec\n", design: "# Design\n" };

  await expect(service.create(input)).resolves.toMatchObject(input);
  await expect(service.create({ ...input, specification: "Replacement" })).rejects.toMatchObject({
    code: "EEXIST",
  });
  await expect(service.create({ ...input, name: "../escape" })).rejects.toThrow("Invalid numbered");
  expect((await readdir(workspace)).sort()).toEqual([
    "design.md",
    "sdd.json",
    "spec.md",
    "tickets",
  ]);
  expect(JSON.parse(await readFile(join(workspace, "sdd.json"), "utf8"))).toEqual({
    version: 1,
    ledgerRepositoryRoot: await realpath(root),
    tickets: [],
    findings: [],
    reviewRounds: [],
  });
  await expect(service.load(name)).resolves.toMatchObject(input);
});

test("hydrates ticket requirements from Markdown and rejects invalid graph changes", async () => {
  const root = await makeTempDir();
  const service = await serviceFor(root);
  const workspace = join(root, ".spindle", "features", name);
  const ledgerPath = join(workspace, "sdd.json");
  const ticketPath = join(workspace, "tickets", "T-0001.md");
  await service.create({ name, specification: "# Spec\n" });
  const addTicket = () =>
    service.updateLedger(name, (ledger) => ({
      ...ledger,
      tickets: [
        {
          id: "T-0001",
          title: "Example",
          tasks: [],
          dependencies: [],
          workRoundCommits: [],
          merged: false,
        },
      ],
    }));

  await expect(addTicket()).rejects.toMatchObject({ code: "ENOENT", path: ticketPath });
  expect((await service.load(name)).tickets).toEqual([]);
  await writeFile(
    ticketPath,
    "# Example\n\n## Requirements\n\nImplement it.\n\n```md\n## Comments\n```\n\n" +
      "## Acceptance Criteria\n\nIt works.\n\n## Comments\n\nNot a criterion.\n",
  );
  const feature = await addTicket();
  expect(feature.design).toBeUndefined();
  expect(feature.tickets[0]).toMatchObject({
    requirements: "Implement it.\n\n```md\n## Comments\n```",
    acceptanceCriteria: "It works.",
  });
  const published = await readFile(ledgerPath, "utf8");
  expect(published).not.toContain("It works.");
  await expect(
    service.updateLedger(name, (ledger) => {
      ledger.tickets[0].dependencies.push("T-9999");
      return ledger;
    }),
  ).rejects.toThrow("unknown-ticket-dependency");
  expect(await readFile(ledgerPath, "utf8")).toBe(published);
  await writeFile(ticketPath, "## Requirements\n\nRevised.\n\n## Acceptance Criteria\n\nIt works.");
  expect((await service.load(name)).tickets[0].requirements).toBe("Revised.");
});

test("locks the read-modify-write operation and atomically publishes the new ledger", async () => {
  const root = await makeTempDir();
  const writer = await serviceFor(root);
  const other = await serviceFor(root);
  const workspace = join(root, ".spindle", "features", name);
  await writer.create({ name, specification: "# Spec\n" });

  const before = await open(join(workspace, "sdd.json"), "r");
  try {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const update = writer.updateLedger(name, async (ledger) => {
      entered.resolve();
      await release.promise;
      return { ...ledger, originalBranch: "main" };
    });
    try {
      await Promise.race([entered.promise, update]);
      await expect(other.updateLedger(name, (ledger) => ledger)).rejects.toThrow("is locked");
      expect((await other.load(name)).originalBranch).toBeUndefined();
    } finally {
      release.resolve();
      await update;
    }

    expect(await before.readFile("utf8")).not.toContain("originalBranch");
    expect((await other.load(name)).originalBranch).toBe("main");
    await expect(other.updateLedger(name, (ledger) => ledger)).resolves.toMatchObject({
      originalBranch: "main",
    });
    expect((await readdir(workspace)).filter((entry) => entry.startsWith(".ledger-"))).toEqual([]);
  } finally {
    await before.close();
  }
});
