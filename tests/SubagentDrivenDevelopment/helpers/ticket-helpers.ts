import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { LoadProjectConfiguration } from "@/Foundation/Bootstrap/LoadProjectConfiguration";

import { applicationFixture } from "../../helpers/ApplicationFixture.ts";
import { repoRoot } from "../../helpers/TemporaryDirectories.ts";
import { fixture } from "./helpers";
import { workflowServices, type WorkflowServices } from "./WorkflowServices";

export async function ticketFixture(title: string) {
  const { repo, git } = fixture();
  const app = applicationFixture(repo, resolve(repoRoot, "src/Assets/Blueprints"));
  await new LoadProjectConfiguration().bootstrap(app);
  await app.boot();
  const service = await workflowServices(app);
  const feature = service.featureCreationService.create({ title, author: "maintainer" });
  return { repo, git, app, service, feature };
}

export function createTicket(service: WorkflowServices, spec: string, title: string) {
  return service.ticketService.ticketCreate({
    spec,
    title,
    reporter: "reporter",
    category: "enhancement",
    author: "creator",
  });
}

export function workspaceSnapshot(directory: string): unknown {
  const stat = statSync(directory, { bigint: true });
  return {
    modified: stat.mtimeNs,
    entries: readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => {
        const path = join(directory, entry.name);
        return [
          entry.name,
          entry.isDirectory()
            ? workspaceSnapshot(path)
            : {
                content: readFileSync(path, "utf8"),
                modified: statSync(path, { bigint: true }).mtimeNs,
              },
        ];
      }),
  };
}
