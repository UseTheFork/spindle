import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { applicationFixture } from "../../application-fixture";
import { fixture } from "./helpers";
import { workflowServices, type WorkflowServices } from "./WorkflowServices";

export async function issueFixture(title: string) {
  const { repo, git } = fixture();
  const app = applicationFixture(repo, resolve("src/blueprints"));
  await app.boot();
  const service = await workflowServices(app);
  const feature = service.featureCreationService.create({ title, author: "maintainer" });
  return { repo, git, service, feature };
}

export function createIssue(service: WorkflowServices, spec: string, title: string) {
  return service.issueService.issueCreate({
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
