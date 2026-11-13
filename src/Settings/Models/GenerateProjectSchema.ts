import { writeFileSync } from "node:fs";

import { z } from "zod";

import { projectSettingsSchema } from "@/Settings/Models/ProjectSettings";

writeFileSync(
  new URL("../../spindle.schema.json", import.meta.url),
  `${JSON.stringify(z.toJSONSchema(projectSettingsSchema, { io: "input" }), null, 2)}\n`,
);
