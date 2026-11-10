import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import matter from "gray-matter";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type { TicketCreateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import type { TicketDocument } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { PathSafety } from "@/SubagentDrivenDevelopment/Persistence/PathSafety";
import {
  validateAuthor,
  validateTicketId,
  validateCategory,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { Records } from "@/Support/Records";

const isRecord = Records.isRecord;

export class TicketRepository extends Service {
  public constructor(
    app: Application,
    private readonly pathSafety: PathSafety,
    private readonly ledgerRepository: LedgerRepository,
  ) {
    super(app);
  }

  public readTickets(workspace: string): TicketDocument[] {
    const feature = basename(workspace);
    const ledger = this.ledgerRepository.readLedger({
      feature,
      workspace,
      spec: join(workspace, "spec.md"),
      ledger: join(workspace, "sdd.json"),
    });
    const progressById = new Map(ledger.tickets.map((ticket) => [ticket.id, ticket]));
    const directory = join(workspace, "tickets");
    const tickets: TicketDocument[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.name.endsWith(".md")) continue;
      const id = entry.name.slice(0, -3);
      validateTicketId(id);
      const path = join(directory, entry.name);
      this.pathSafety.assertTicketPath(workspace, path);
      const raw = readFileSync(path, "utf8");
      const parsed = matter(raw);
      const data = parsed.data;
      if (!isRecord(data) || data.id !== id)
        throw new Error(`Ticket ${id} has invalid YAML front matter.`);
      if (
        ["title", "reporter", "category", "status", "blocked_by", "blocker"].some((key) =>
          Object.hasOwn(data, key),
        )
      ) {
        throw new Error(`Ticket ${id} tracking metadata must be stored in sdd.json.`);
      }
      const progress = progressById.get(id);
      if (!progress) throw new Error(`Ticket ${id} has no ledger record.`);
      const { title, reporter, category, status, blockedBy, blocker } = progress;
      if (typeof title !== "string" || !title.trim())
        throw new Error(`Ticket ${id} title is invalid.`);
      if (typeof reporter !== "string" || !reporter.trim())
        throw new Error(`Ticket ${id} reporter is invalid.`);
      validateCategory(category);
      if (status !== "open" && status !== "in-progress" && status !== "closed") {
        throw new Error(`Ticket ${id} status is invalid.`);
      }
      if (!Array.isArray(blockedBy) || !blockedBy.every((blocked) => typeof blocked === "string")) {
        throw new Error(`Ticket ${id} dependencies must be a list of ticket IDs.`);
      }
      if (new Set(blockedBy).size !== blockedBy.length)
        throw new Error(`Ticket ${id} has duplicate dependencies.`);
      for (const blocked of blockedBy) validateTicketId(blocked);
      tickets.push({
        metadata: { ...data },
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
    return tickets;
  }

  public metadata(ticket: TicketDocument): Record<string, unknown> {
    return {
      ...ticket.metadata,
      id: ticket.id,
    };
  }

  public requireTicket(tickets: TicketDocument[], id: string): TicketDocument {
    const ticket = tickets.find((item) => item.id === id);
    if (!ticket) throw new Error(`Ticket not found: ${id}.`);
    return ticket;
  }

  public normalizeDependencies(values: string[]): string[] {
    const dependencies = values.flatMap((value) => value.split(",")).map((value) => value.trim());
    if (dependencies.some((value) => !value)) throw new Error("Dependency IDs must not be empty.");
    for (const dependency of dependencies) validateTicketId(dependency);
    if (new Set(dependencies).size !== dependencies.length) {
      throw new Error("Dependency IDs must not contain duplicates.");
    }
    return dependencies;
  }

  public validateDependencyGraph(tickets: TicketDocument[]): void {
    const byId = new Map(tickets.map((item) => [item.id, item]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) throw new Error(`Ticket dependency cycle detected at ${id}.`);
      if (visited.has(id)) return;
      const ticket = byId.get(id);
      if (!ticket) return;
      visiting.add(id);
      for (const dependency of ticket.blocked_by) {
        if (!byId.has(dependency))
          throw new Error(`Ticket ${id} references missing dependency ${dependency}.`);
        visit(dependency);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const ticket of tickets) visit(ticket.id);
  }

  public appendAudit(body: string, author: string, details: string): string {
    const heading = /^## Comments[ \t]*\r?$/m.exec(body);
    if (!heading) throw new Error("Ticket must contain a ## Comments section.");
    const start = heading.index + heading[0].length;
    const nextHeading = /^#{1,2}[ \t]+/m.exec(body.slice(start));
    const end = nextHeading ? start + nextHeading.index : body.length;
    const content = body.slice(0, end).replace(/\s+$/, "");
    const laterSections = body.slice(end);
    const entry = `**${new Date().toISOString()} - ${author.trim()}**\n\n${details}`;
    return `${content}\n\n${entry}\n${laterSections ? `\n${laterSections}` : ""}`;
  }

  public serializeTicket(ticket: TicketDocument, body: string): string {
    return matter.stringify(body, this.metadata(ticket));
  }

  public validateTicketCreateOptions(options: TicketCreateOptions): void {
    if (!options.title.trim()) throw new Error("Title must not be empty.");
    if (!options.reporter.trim()) throw new Error("Reporter must not be empty.");
    validateCategory(options.category);
    validateAuthor(options.author);
  }
}
