import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { App } from "@/app.js";
import { SddCommand } from "@/commands/sdd/sdd-command.js";

import { fixture } from "./helpers.ts";

export function issueFixture(title: string) {
  const { repo, git } = fixture();
  const service = new SddCommand(
    new App({ workspaceRoot: repo, blueprintSourceRoot: resolve("src/blueprints") }),
  );
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
