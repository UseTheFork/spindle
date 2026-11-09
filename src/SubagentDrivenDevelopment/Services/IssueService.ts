import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import matter from "gray-matter";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import type {
  IssueCreateOptions,
  IssueUpdateOptions,
  IssueCommentOptions,
} from "@/SubagentDrivenDevelopment/Models/Options";
import {
  ISSUE_CATEGORIES,
  ISSUE_ID,
  TRACKER_STATUSES,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import type { IssueDocument } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { lstatIfPresent } from "@/SubagentDrivenDevelopment/Persistence/FileSystem";
import { IssueRepository } from "@/SubagentDrivenDevelopment/Persistence/IssueRepository";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { PathSafety } from "@/SubagentDrivenDevelopment/Persistence/PathSafety";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import {
  validateAuthor,
  validateIssueId,
  validateCategory,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";

export class IssueService extends Service {
  public constructor(
    app: Application,
    private readonly issueRepository: IssueRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly pathSafety: PathSafety,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public issueCreate(options: IssueCreateOptions): { issue: string; path: string } {
    this.issueRepository.validateIssueCreateOptions(options);
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const issues = this.issueRepository.readIssues(feature.workspace);
      this.issueRepository.validateDependencyGraph(issues);
      let highest = 0n;
      for (const candidate of [
        ...issues.map((item) => item.id),
        ...ledger.issues.map((item) => item.id),
      ]) {
        const match = ISSUE_ID.exec(candidate);
        if (match && BigInt(match[1]!) > highest) highest = BigInt(match[1]!);
      }
      const id = `I-${String(highest + 1n).padStart(4, "0")}`;
      const path = join(feature.workspace, "issues", `${id}.md`);
      if (lstatIfPresent(path)) throw new Error(`Issue already exists: ${id}.`);
      this.pathSafety.assertIssuePath(feature.workspace, path);
      this.ledgerRepository.upgradeIssueTracking(ledger, issues);
      const issue = {
        id,
        title: options.title.trim(),
        reporter: options.reporter.trim(),
        category: options.category as IssueDocument["category"],
        status: "open" as const,
        blockedBy: [],
      };
      const document = matter.stringify(
        this.issueRepository.appendAudit(
          "\n## Requirements\n\n## Acceptance Criteria\n\n## Comments\n",
          options.author,
          "Issue created.",
        ),
        { id },
      );
      ledger.schemaVersion = 2;
      ledger.issues.push({
        ...issue,
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
      return { issue: id, path };
    });
  }

  public issueUpdate(options: IssueUpdateOptions): { issue: string; path: string } {
    validateIssueId(options.issue);
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
      throw new Error("Provide issue fields, status, blocker, or dependency options to update.");
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
      throw new Error(`Issue status must be one of: ${TRACKER_STATUSES.join(", ")}.`);
    }
    if (options.blocker !== undefined && !options.blocker.trim()) {
      throw new Error("Blocker reason must not be empty.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const issues = this.issueRepository.readIssues(feature.workspace);
      const current = this.issueRepository.requireIssue(issues, options.issue);
      const updated = { ...current };
      const progress = ledger.issues.find((item) => item.id === current.id);
      if (!progress) throw new Error(`Issue ${current.id} has no ledger record.`);
      this.ledgerRepository.upgradeIssueTracking(ledger, issues);
      const structured = ledger.issues.find((item) => item.id === current.id)!;
      if (options.title !== undefined) structured.title = updated.title = options.title.trim();
      if (options.reporter !== undefined)
        structured.reporter = updated.reporter = options.reporter.trim();
      if (options.category !== undefined) {
        structured.category = options.category as (typeof ISSUE_CATEGORIES)[number];
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
        const blockedBy = this.issueRepository.normalizeDependencies(options.blockedBy);
        updated.blocked_by = blockedBy;
        structured.blockedBy = blockedBy;
      }
      if (options.clearBlockedBy) {
        updated.blocked_by = [];
        structured.blockedBy = [];
      }
      if (structured.status === "closed" && structured.blocker) {
        throw new Error("Cannot close a blocked issue; clear its blocker first.");
      }
      const changed = this.issueRepository.serializeIssue(
        updated,
        this.issueRepository.appendAudit(current.body, options.author, "Issue fields updated."),
      );
      const candidate = issues.map((item) =>
        item.id === current.id ? { ...updated, raw: changed, body: matter(changed).content } : item,
      );
      this.issueRepository.validateDependencyGraph(candidate);
      this.workspaceTransaction.applyWrites(feature.workspace, [
        { path: relative(feature.workspace, current.path), before: current.raw, after: changed },
        {
          path: "sdd.json",
          before: readFileSync(feature.ledger, "utf8"),
          after: `${JSON.stringify(ledger, null, 2)}\n`,
        },
      ]);
      return { issue: options.issue, path: current.path };
    });
  }

  public issueComment(options: IssueCommentOptions): { issue: string; path: string } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    if (!options.details.trim()) throw new Error("Comment details must not be empty.");
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      this.ledgerRepository.readLedger(feature);
      const current = this.issueRepository.requireIssue(
        this.issueRepository.readIssues(feature.workspace),
        options.issue,
      );
      const after = matter.stringify(
        this.issueRepository.appendAudit(current.body, options.author, options.details.trim()),
        this.issueRepository.metadata(current),
      );
      this.workspaceTransaction.applyWrites(feature.workspace, [
        { path: relative(feature.workspace, current.path), before: current.raw, after },
      ]);
      return { issue: options.issue, path: current.path };
    });
  }
}
