import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import matter from "gray-matter";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type { IssueCreateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import type { IssueDocument } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { PathSafety } from "@/SubagentDrivenDevelopment/Persistence/PathSafety";
import {
  validateAuthor,
  validateIssueId,
  validateCategory,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { Records } from "@/Support/Records";

const isRecord = Records.isRecord;

export class IssueRepository extends Service {
  public constructor(
    app: Application,
    private readonly pathSafety: PathSafety,
    private readonly ledgerRepository: LedgerRepository,
  ) {
    super(app);
  }

  public readIssues(workspace: string): IssueDocument[] {
    const feature = basename(workspace);
    const ledger = this.ledgerRepository.readLedger({
      feature,
      workspace,
      spec: join(workspace, "spec.md"),
      ledger: join(workspace, "sdd.json"),
    });
    const progressById = new Map(ledger.issues.map((issue) => [issue.id, issue]));
    const directory = join(workspace, "issues");
    const issues: IssueDocument[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.name.endsWith(".md")) continue;
      const id = entry.name.slice(0, -3);
      validateIssueId(id);
      const path = join(directory, entry.name);
      this.pathSafety.assertIssuePath(workspace, path);
      const raw = readFileSync(path, "utf8");
      const parsed = matter(raw);
      const data = parsed.data;
      if (!isRecord(data) || data.id !== id)
        throw new Error(`Issue ${id} has invalid YAML front matter.`);
      const progress = progressById.get(id);
      if (!progress) throw new Error(`Issue ${id} has no ledger record.`);
      const title = progress.title ?? data.title;
      const reporter = progress.reporter ?? data.reporter;
      const category = String(progress.category ?? data.category);
      const status =
        progress.status ??
        (data.status === "wontfix"
          ? "closed"
          : data.status === "in-progress" || data.status === "closed"
            ? data.status
            : "open");
      const blockedBy = progress.blockedBy ?? data.blocked_by;
      const legacyBlocker = ["needs-triage", "needs-info", "ready-for-human"].includes(
        String(data.status),
      )
        ? `Legacy issue status '${data.status}' requires review before claiming.`
        : undefined;
      const blocker =
        progress.blocker ??
        (typeof data.blocker === "string" ? data.blocker : undefined) ??
        legacyBlocker;
      if (typeof title !== "string" || !title.trim())
        throw new Error(`Issue ${id} title is invalid.`);
      if (typeof reporter !== "string" || !reporter.trim())
        throw new Error(`Issue ${id} reporter is invalid.`);
      validateCategory(category);
      if (status !== "open" && status !== "in-progress" && status !== "closed") {
        throw new Error(`Issue ${id} status is invalid.`);
      }
      if (!Array.isArray(blockedBy) || !blockedBy.every((blocked) => typeof blocked === "string")) {
        throw new Error(`Issue ${id} dependencies must be a list of issue IDs.`);
      }
      if (new Set(blockedBy).size !== blockedBy.length)
        throw new Error(`Issue ${id} has duplicate dependencies.`);
      for (const blocked of blockedBy) validateIssueId(blocked);
      const metadata =
        ledger.schemaVersion === 1
          ? { ...data }
          : Object.fromEntries(
              Object.entries(data).filter(
                ([key]) => !["title", "reporter", "category", "status", "blocked_by"].includes(key),
              ),
            );
      issues.push({
        metadata,
        id,
        title,
        reporter,
        category,
        status,
        blocked_by: [...blockedBy],
        ...(blocker ? { blocker } : {}),
        body: parsed.content,
        path,
        raw,
      });
    }
    return issues;
  }

  public metadata(issue: IssueDocument): Record<string, unknown> {
    return {
      ...issue.metadata,
      id: issue.id,
    };
  }

  public requireIssue(issues: IssueDocument[], id: string): IssueDocument {
    const issue = issues.find((item) => item.id === id);
    if (!issue) throw new Error(`Issue not found: ${id}.`);
    return issue;
  }

  public normalizeDependencies(values: string[]): string[] {
    const dependencies = values.flatMap((value) => value.split(",")).map((value) => value.trim());
    if (dependencies.some((value) => !value)) throw new Error("Dependency IDs must not be empty.");
    for (const dependency of dependencies) validateIssueId(dependency);
    if (new Set(dependencies).size !== dependencies.length) {
      throw new Error("Dependency IDs must not contain duplicates.");
    }
    return dependencies;
  }

  public validateDependencyGraph(issues: IssueDocument[]): void {
    const byId = new Map(issues.map((item) => [item.id, item]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) throw new Error(`Issue dependency cycle detected at ${id}.`);
      if (visited.has(id)) return;
      const issue = byId.get(id);
      if (!issue) return;
      visiting.add(id);
      for (const dependency of issue.blocked_by) {
        if (!byId.has(dependency))
          throw new Error(`Issue ${id} references missing dependency ${dependency}.`);
        visit(dependency);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const issue of issues) visit(issue.id);
  }

  public appendAudit(body: string, author: string, details: string): string {
    const heading = /^## Comments[ \t]*\r?$/m.exec(body);
    if (!heading) throw new Error("Issue must contain a ## Comments section.");
    const start = heading.index + heading[0].length;
    const nextHeading = /^#{1,2}[ \t]+/m.exec(body.slice(start));
    const end = nextHeading ? start + nextHeading.index : body.length;
    const content = body.slice(0, end).replace(/\s+$/, "");
    const laterSections = body.slice(end);
    const entry = `**${new Date().toISOString()} - ${author.trim()}**\n\n${details}`;
    return `${content}\n\n${entry}\n${laterSections ? `\n${laterSections}` : ""}`;
  }

  public serializeIssue(issue: IssueDocument, body: string): string {
    return matter.stringify(body, this.metadata(issue));
  }

  public validateIssueCreateOptions(options: IssueCreateOptions): void {
    if (!options.title.trim()) throw new Error("Title must not be empty.");
    if (!options.reporter.trim()) throw new Error("Reporter must not be empty.");
    validateCategory(options.category);
    validateAuthor(options.author);
  }
}
