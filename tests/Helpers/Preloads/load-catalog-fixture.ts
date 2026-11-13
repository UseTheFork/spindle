import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { blueprintCatalog } from "@/BlueprintManagement/Catalog/BlueprintCatalog";
import { Application } from "@/Foundation/Application";

const root = process.env.SPINDLE_TEST_BLUEPRINTS_DIR;
const templates = process.env.SPINDLE_TEST_TEMPLATES_DIR;
if (root || templates) {
  const assetsPath = Application.prototype.assetsPath;
  Application.prototype.assetsPath = function (path = "") {
    if (root && path === "Blueprints") return resolve(root);
    if (templates && path === "Templates") return resolve(templates);
    return assetsPath.call(this, path);
  };
}

const path = process.env.SPINDLE_TEST_CATALOG;
if (path) Object.assign(blueprintCatalog, JSON.parse(await readFile(path, "utf8")));
