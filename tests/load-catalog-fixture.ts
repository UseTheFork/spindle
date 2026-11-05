import { readFile } from "node:fs/promises";

import { blueprintCatalog } from "../src/blueprints/catalog.ts";

const path = process.env.SPINDLE_TEST_CATALOG;
if (!path) throw new Error("Missing test catalog fixture path.");
Object.assign(blueprintCatalog, JSON.parse(await readFile(path, "utf8")));
