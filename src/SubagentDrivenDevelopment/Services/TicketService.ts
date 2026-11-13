import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import matter from "gray-matter";

import { templateCatalog } from "@/Assets/Templates/Catalog";
import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type {
  TicketCreateOptions,
  TicketUpdateOptions,
  TicketCommentOptions,
} from "@/SubagentDrivenDevelopment/Models/Options";
import {
  TICKET_CATEGORIES,
  TICKET_ID,
  TRACKER_STATUSES,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import type { TicketDocument } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { lstatIfPresent } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { PathSafety } from "@/SubagentDrivenDevelopment/Persistence/PathSafety";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import {
  validateAuthor,
  validateTicketId,
  validateCategory,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { resolveRenderContext } from "@/TemplateRendering/Computed/ResolveRenderContext";
import { renderText } from "@/TemplateRendering/Rendering/RenderText";

export class TicketService extends Service {
  public constructor(
    app: Application,
    private readonly ticketRepository: TicketRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly pathSafety: PathSafety,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public ticketCreate(options: TicketCreateOptions): { ticket: string; path: string } {
    this.ticketRepository.validateTicketCreateOptions(options);
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const tickets = this.ticketRepository.readTickets(feature.workspace);
      this.ticketRepository.validateDependencyGraph(tickets);
      let highest = 0n;
      for (const candidate of [
        ...tickets.map((item) => item.id),
        ...ledger.tickets.map((item) => item.id),
      ]) {
        const match = TICKET_ID.exec(candidate);
        if (match && BigInt(match[1]!) > highest) highest = BigInt(match[1]!);
      }
      const id = `T-${String(highest + 1n).padStart(4, "0")}`;
      const path = join(feature.workspace, "tickets", `${id}.md`);
      if (lstatIfPresent(path)) throw new Error(`Ticket already exists: ${id}.`);
      this.pathSafety.assertTicketPath(feature.workspace, path);
      const ticket = {
        id,
        title: options.title.trim(),
        reporter: options.reporter.trim(),
        category: options.category as TicketDocument["category"],
        status: "open" as const,
        blockedBy: [],
      };
      const context = resolveRenderContext(this.app, {
        variables: {
          title: options.title.trim(),
          reporter: options.reporter.trim(),
          category: options.category,
          author: options.author.trim(),
        },
      });
      const template = renderText(
        readFileSync(join(this.app.assetsPath("Templates"), templateCatalog.sdd.ticket), "utf8"),
        context,
      );
      const document = matter.stringify(
        this.ticketRepository.appendAudit(template, options.author, "Ticket created."),
        { id },
      );
      ledger.tickets.push({
        ...ticket,
        execution: "unstarted",
      });
      this.workspaceTransaction.applyWrites(feature.workspace, [
        { path: relative(feature.workspace, path), before: null, after: document },
        {
          path: "sdd.json",
          before: readFileSync(feature.ledger, "utf8"),
          after: `${JSON.stringify(ledger, null, 2)}\n`,
        },
      ]);
      return { ticket: id, path };
    });
  }

  public ticketUpdate(options: TicketUpdateOptions): { ticket: string; path: string } {
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    if (
      options.title === undefined &&
      options.reporter === undefined &&
      options.category === undefined &&
      options.status === undefined &&
      options.blocker === undefined &&
      !options.clearBlocker &&
      options.blockedBy === undefined &&
      !options.clearBlockedBy
    ) {
      throw new Error("Provide ticket fields, status, blocker, or dependency options to update.");
    }
    if (options.clearBlockedBy && options.blockedBy !== undefined) {
      throw new Error("--clear-blocked-by cannot be combined with --blocked-by.");
    }
    if (options.clearBlocker && options.blocker !== undefined) {
      throw new Error("--clear-blocker cannot be combined with --blocker.");
    }
    if (options.title !== undefined && !options.title.trim())
      throw new Error("Title must not be empty.");
    if (options.reporter !== undefined && !options.reporter.trim()) {
      throw new Error("Reporter must not be empty.");
    }
    if (options.category !== undefined) validateCategory(options.category);
    if (
      options.status !== undefined &&
      !TRACKER_STATUSES.some((status) => status === options.status)
    ) {
      throw new Error(`Ticket status must be one of: ${TRACKER_STATUSES.join(", ")}.`);
    }
    if (options.status === "closed") {
      throw new Error("Tickets close automatically after passing post-merge checks.");
    }
    if (options.blocker !== undefined && !options.blocker.trim()) {
      throw new Error("Blocker reason must not be empty.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const tickets = this.ticketRepository.readTickets(feature.workspace);
      const current = this.ticketRepository.requireTicket(tickets, options.ticket);
      const updated = { ...current };
      const progress = ledger.tickets.find((item) => item.id === current.id);
      if (!progress) throw new Error(`Ticket ${current.id} has no ledger record.`);
      const structured = ledger.tickets.find((item) => item.id === current.id)!;
      if (options.title !== undefined) structured.title = updated.title = options.title.trim();
      if (options.reporter !== undefined)
        structured.reporter = updated.reporter = options.reporter.trim();
      if (options.category !== undefined) {
        structured.category = options.category as (typeof TICKET_CATEGORIES)[number];
        updated.category = structured.category;
      }
      if (options.status !== undefined) {
        structured.status = options.status as (typeof TRACKER_STATUSES)[number];
        updated.status = structured.status;
      }
      if (options.blocker !== undefined) {
        structured.blocker = options.blocker.trim();
        updated.blocker = structured.blocker;
      }
      if (options.clearBlocker) {
        delete structured.blocker;
        delete updated.blocker;
      }
      if (options.blockedBy !== undefined) {
        const blockedBy = this.ticketRepository.normalizeDependencies(options.blockedBy);
        updated.blocked_by = blockedBy;
        structured.blockedBy = blockedBy;
      }
      if (options.clearBlockedBy) {
        updated.blocked_by = [];
        structured.blockedBy = [];
      }
      if (structured.status === "closed" && structured.blocker) {
        throw new Error("Cannot close a blocked ticket; clear its blocker first.");
      }
      const changed = this.ticketRepository.serializeTicket(
        updated,
        this.ticketRepository.appendAudit(current.body, options.author, "Ticket fields updated."),
      );
      const candidate = tickets.map((item) =>
        item.id === current.id ? { ...updated, raw: changed, body: matter(changed).content } : item,
      );
      this.ticketRepository.validateDependencyGraph(candidate);
      this.workspaceTransaction.applyWrites(feature.workspace, [
        { path: relative(feature.workspace, current.path), before: current.raw, after: changed },
        {
          path: "sdd.json",
          before: readFileSync(feature.ledger, "utf8"),
          after: `${JSON.stringify(ledger, null, 2)}\n`,
        },
      ]);
      return { ticket: options.ticket, path: current.path };
    });
  }

  public ticketComment(options: TicketCommentOptions): { ticket: string; path: string } {
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    if (!options.details.trim()) throw new Error("Comment details must not be empty.");
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      this.ledgerRepository.readLedger(feature);
      const current = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const after = matter.stringify(
        this.ticketRepository.appendAudit(current.body, options.author, options.details.trim()),
        this.ticketRepository.metadata(current),
      );
      this.workspaceTransaction.applyWrites(feature.workspace, [
        { path: relative(feature.workspace, current.path), before: current.raw, after },
      ]);
      return { ticket: options.ticket, path: current.path };
    });
  }
}
