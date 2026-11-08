import type { CreateOptions } from "@/SubagentDrivenDevelopment/Models/Options";
import {
  ISSUE_ID,
  ISSUE_CATEGORIES,
  TRIAGE_STATUSES,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import type { IssueDocument } from "@/SubagentDrivenDevelopment/Models/Workflow";

export function validateAuthor(author: string): void {
  if (!author.trim()) throw new Error("Author must not be empty.");
}

export function validateIssueId(issue: string): void {
  if (!ISSUE_ID.test(issue)) throw new Error(`Invalid issue ID: ${issue}.`);
}

export function validateCategory(category: string): asserts category is IssueDocument["category"] {
  if (!ISSUE_CATEGORIES.includes(category as IssueDocument["category"])) {
    throw new Error(`Invalid issue category: ${category}.`);
  }
}

export function validateTriageStatus(status: string): asserts status is IssueDocument["status"] {
  if (!TRIAGE_STATUSES.includes(status as IssueDocument["status"])) {
    throw new Error(`Invalid triage status: ${status}.`);
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
