import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { blueprintCatalog } from "@/BlueprintManagement/Catalog/BlueprintCatalog";
import { Application } from "@/Foundation/Application";

const root = process.env.SPINDLE_TEST_BLUEPRINTS_DIR;
if (root) {
  const fixtureRoot = resolve(root);
  const appPath = Application.prototype.appPath;
  Application.prototype.appPath = function (path = "") {
    if (path === "Assets/Blueprints") return fixtureRoot;
    return appPath.call(this, path);
  };
}

const path = process.env.SPINDLE_TEST_CATALOG;
if (path) Object.assign(blueprintCatalog, JSON.parse(await readFile(path, "utf8")));
