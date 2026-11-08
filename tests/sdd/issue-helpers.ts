import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { SddCommand } from "@/commands/sdd/sdd-command";

import { applicationFixture } from "../application-fixture";
import { fixture } from "./helpers.ts";

export async function issueFixture(title: string) {
  const { repo, git } = fixture();
  const app = applicationFixture(repo, resolve("src/blueprints"));
  await app.boot();
  const service = await app.make(SddCommand);
  const feature = service.create({ title, author: "maintainer" });
  return { repo, git, service, feature };
}

export function createIssue(service: SddCommand, spec: string, title: string) {
  return service.issueCreate({
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
