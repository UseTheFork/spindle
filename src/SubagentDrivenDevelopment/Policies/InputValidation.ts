import type { CreateOptions } from "@spindle/SubagentDrivenDevelopment/Models/Options";
import { TICKET_ID, TICKET_CATEGORIES } from "@spindle/SubagentDrivenDevelopment/Models/Workflow";
import type { TicketDocument } from "@spindle/SubagentDrivenDevelopment/Models/Workflow";

export class InputValidation {
  public static validateAuthor(author: string): void {
    if (!author.trim()) throw new Error("Author must not be empty.");
  }

  public static validateTicketId(ticket: string): void {
    if (!TICKET_ID.test(ticket)) throw new Error(`Invalid ticket ID: ${ticket}.`);
  }

  public static validateCategory(category: string): asserts category is TicketDocument["category"] {
    if (!TICKET_CATEGORIES.includes(category as TicketDocument["category"])) {
      throw new Error(`Invalid ticket category: ${category}.`);
    }
  }

  public static validateCreateOptions({ title, author }: CreateOptions): void {
    if (!title.trim()) throw new Error("Title must not be empty.");
    if (!author.trim()) throw new Error("Author must not be empty.");
  }

  public static featureSlug(title: string): string {
    const slug = title
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug) throw new Error("Title must contain at least one letter or number.");
    return slug;
  }
}
