import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { blueprintCatalog } from "@/BlueprintManagement/Catalog/BlueprintCatalog";
import { ResolveBlueprintSourceRoot } from "@/Foundation/Bootstrap/ResolveBlueprintSourceRoot";

const root = process.env.SPINDLE_TEST_BLUEPRINTS_DIR;
if (root) {
  const fixtureRoot = resolve(root);
  ResolveBlueprintSourceRoot.resolveBlueprintSourceRoot = () => fixtureRoot;
}

const path = process.env.SPINDLE_TEST_CATALOG;
if (path) Object.assign(blueprintCatalog, JSON.parse(await readFile(path, "utf8")));
