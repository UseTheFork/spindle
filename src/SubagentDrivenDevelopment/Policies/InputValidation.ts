import type { CreateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import {
  TICKET_ID,
  TICKET_CATEGORIES,
  TRACKER_STATUSES,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import type { TicketDocument } from "@/SubagentDrivenDevelopment/Models/Workflow";

export function validateAuthor(author: string): void {
  if (!author.trim()) throw new Error("Author must not be empty.");
}

export function validateTicketId(ticket: string): void {
  if (!TICKET_ID.test(ticket)) throw new Error(`Invalid ticket ID: ${ticket}.`);
}

export function validateCategory(category: string): asserts category is TicketDocument["category"] {
  if (!TICKET_CATEGORIES.includes(category as TicketDocument["category"])) {
    throw new Error(`Invalid ticket category: ${category}.`);
  }
}

export function validateTriageStatus(status: string): asserts status is TicketDocument["status"] {
  if (!TRACKER_STATUSES.includes(status as TicketDocument["status"])) {
    throw new Error(`Invalid ticket status: ${status}.`);
  }
}

export function validateCreateOptions({ title, author }: CreateOptions): void {
  if (!title.trim()) throw new Error("Title must not be empty.");
  if (!author.trim()) throw new Error("Author must not be empty.");
}

export function featureSlug(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) throw new Error("Title must contain at least one letter or number.");
  return slug;
}
