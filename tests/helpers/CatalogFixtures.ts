import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  BlueprintCatalogDefinition,
  CatalogSourceEntry,
} from "@/BlueprintManagement/Catalog/BlueprintCatalog";

export function writeCatalogFixture(blueprints: string, catalog: BlueprintCatalogDefinition) {
  writeFileSync(join(blueprints, "catalog.fixture.json"), JSON.stringify(catalog, null, 2));
}

export function withCatalogFixture(env: Record<string, string>) {
  return env.SPINDLE_TEST_BLUEPRINTS_DIR
    ? {
        ...env,
        SPINDLE_TEST_CATALOG: join(env.SPINDLE_TEST_BLUEPRINTS_DIR, "catalog.fixture.json"),
      }
    : env;
}

// Discover legacy test assets only; production always uses the compiled catalog.
export function writeFixtureCatalog(blueprints: string) {
  const catalogPath = join(blueprints, "catalog.fixture.json");
  if (existsSync(catalogPath)) return;

  const filesUnder = (root: string, predicate: (path: string) => boolean): string[] => {
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.isFile() && predicate(path)) files.push(path.slice(root.length + 1));
      }
    };
    if (existsSync(root)) visit(root);
    return files.sort();
  };
  const entries = (paths: string[]): Record<string, CatalogSourceEntry> =>
    Object.fromEntries(paths.map((path) => [path, { path, stacks: [] }]));
  const skillPaths = existsSync(join(blueprints, "skills"))
    ? readdirSync(join(blueprints, "skills"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(entry.name, ""))
        .filter((path) => existsSync(join(blueprints, "skills", path, "SKILL.md")))
        .map((path) => `${path.replaceAll("\\", "/").replace(/\/?$/, "/")}`)
    : [];
  const catalog: BlueprintCatalogDefinition = {
    agents: entries(filesUnder(join(blueprints, "agents"), (path) => path.endsWith(".agent.md"))),
    instructions: entries(
      filesUnder(join(blueprints, "instructions"), (path) => path.endsWith(".instructions.md")),
    ),
    skills: Object.fromEntries(
      skillPaths.map((path) => [path, { path: `${path.replace(/\/$/, "")}/`, stacks: [] }]),
    ),
  };
  writeCatalogFixture(blueprints, catalog);
}
