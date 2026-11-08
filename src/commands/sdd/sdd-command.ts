import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  readlinkSync,
  unlinkSync,
  writeFileSync,
  writeSync,
  type Stats,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import type { Command } from "commander";
import matter from "gray-matter";

import { App, Service } from "../../app.js";
import { blueprintCatalog } from "../../blueprints/catalog.js";
import { once } from "../shared-options.js";

const FEATURE_DIRECTORY = /^(\d{4,})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const HISTORICAL_DATE_DIRECTORY = /^\d{4}-\d{2}-\d{2}-/;
const LOCK_TIMEOUT_MS = 15_000;
const ISSUE_ID = /^I-(\d{4,})$/;
const ISSUE_CATEGORIES = ["bug", "enhancement"] as const;
const TRIAGE_STATUSES = [
  "needs-triage",
  "needs-info",
  "ready-for-agent",
  "ready-for-human",
  "wontfix",
] as const;
const EXECUTION_STATES = [
  "unstarted",
  "claimed",
  "implementing",
  "reviewing",
  "changes-requested",
  "accepted",
  "integrated",
  "blocked",
] as const;

interface CreateOptions {
  title: string;
  author: string;
  requireRetrospective?: boolean;
}

type ExecutionState = (typeof EXECUTION_STATES)[number];

type FindingSeverity = "high" | "medium" | "low";
type FindingStatus = "open" | "confirmed" | "fixed" | "dismissed" | "deferred";

interface FindingProvenance {
  report: string;
  snapshot: string;
  author: string;
  summary: string;
  details: string;
}

interface FindingHistoryEntry {
  at: string;
  author: string;
  action: string;
  details: string;
}

interface RequirementsDecision {
  id: string;
  finding: string;
  status: "approved" | "rejected";
  details: string;
  author: string;
  requirementsSnapshot: string;
  recordedAt: string;
}

interface ReviewFinding {
  id: string;
  severity: FindingSeverity;
  blocking: boolean;
  status: FindingStatus;
  summary: string;
  details: string;
  author: string;
  createdAt: string;
  provenance: FindingProvenance[];
  history: FindingHistoryEntry[];
  rulingDetails?: string;
  followUp?: string;
  requirementsDecision?: string;
  verification?: {
    snapshot: string;
    checkCommands: string[];
    verifiedAt: string;
    verifiedBy: string;
  };
}

interface IssueProgress {
  id: string;
  execution: ExecutionState;
  owner?: string;
  baseSha?: string;
  assignment?: ImplementationAssignment;
  reviewAssignments?: ReviewAssignment[];
  reviewHistory?: ReviewAssignment[];
  requirementsDecisions?: RequirementsDecision[];
  checks?: IssueChecks;
  findings?: ReviewFinding[];
}

interface CheckRequirement {
  command: string;
  addedAt: string;
  addedBy: string;
  removedAt?: string;
  removedBy?: string;
  removalDetails?: string;
}

interface IssueChecks {
  required: CheckRequirement[];
  records: CheckRecord[];
  invalidations?: CheckGateInvalidation[];
}

interface CheckGateInvalidation {
  at: string;
  author: string;
  command: string;
  from: "accepted" | "integrated";
  to: "reviewing";
}

interface CheckRecord {
  command: string;
  result: "passed" | "failed" | "unavailable";
  author: string;
  snapshot: string;
  codeSnapshot: string;
  requirementsSnapshot: string;
  headSha: string;
  recordedAt: string;
  details?: string;
}

interface ContentIdentity {
  snapshot: string;
  codeSnapshot: string;
  requirementsSnapshot: string;
  headSha: string;
}

interface ImplementationAssignment {
  id: string;
  role: "implementation";
  action: "implement";
  controller: string;
  report: string;
  requestedAt: string;
  status: "pending" | "submitted" | "unavailable";
  reportSha256?: string;
  submittedAt?: string;
  submittedBy?: string;
  unavailableDetails?: string;
  handoffs: { at: string; from: string; to: string; confirmedStopped: boolean }[];
}

type ReviewResult = "passed" | "failed" | "unavailable";

interface ReviewAssignment {
  id: string;
  agent: string;
  role: "review";
  scope: "initial";
  snapshot: string;
  codeSnapshot: string;
  requirementsSnapshot: string;
  headSha: string;
  inventory: string[];
  report: string;
  requestedAt: string;
  status: "pending" | "submitted";
  result?: ReviewResult;
  noFindings?: true;
  findingIds?: string[];
  reportSha256?: string;
  submittedAt?: string;
  submittedBy?: string;
  details?: string;
}

interface DeliveryHistoryEntry {
  at: string;
  author: string;
  action: string;
}

interface FeatureLedger {
  schemaVersion: number;
  featureId: string;
  title: string;
  createdBy: string;
  createdAt: string;
  retrospectiveRequired: boolean;
  reviewPolicy: {
    version: number;
    issue: string[];
    delivery: string[];
  };
  issues: IssueProgress[];
  delivery: {
    execution: ExecutionState;
    history: DeliveryHistoryEntry[];
  };
}

interface FeaturePaths {
  feature: string;
  workspace: string;
  spec: string;
  ledger: string;
}

interface StatusOptions {
  spec: string;
}

interface IssueCreateOptions {
  spec: string;
  title: string;
  reporter: string;
  category: string;
  author: string;
}

interface IssueSelection {
  spec: string;
  issue: string;
  author: string;
}

interface IssueUpdateOptions extends IssueSelection {
  title?: string;
  reporter?: string;
  blockedBy?: string[];
  clearBlockedBy?: boolean;
}

interface TriageOptions extends IssueSelection {
  status: string;
  category: string;
  details: string;
}

interface IssueCommentOptions extends IssueSelection {
  details: string;
}

interface ReadyOptions {
  spec: string;
}

type ClaimOptions = IssueSelection;

type ImplementOptions = IssueSelection;

interface SubmitOptions extends IssueSelection {
  role: string;
  report?: string;
  assignment?: string;
  result?: string;
  noFindings?: boolean;
  findingIds?: string[];
  findings?: string[] | boolean;
  unavailable?: boolean;
  details?: string;
}

interface FindingCreateOptions extends IssueSelection {
  source: string;
  snapshot: string;
  severity: string;
  blocking?: boolean;
  nonBlocking?: boolean;
  summary: string;
  details: string;
  link?: string;
}

interface FindingUpdateOptions extends IssueSelection {
  finding: string;
  status: string;
  details?: string;
  followUp?: string;
  evidence?: string;
  requirementsDecision?: string;
}

interface RequirementsDecideOptions extends IssueSelection {
  finding: string;
  decision: string;
  details: string;
}

interface ReviewOptions extends IssueSelection {
  inventory: string;
}

type AcceptOptions = IssueSelection;

interface ResumeOptions extends IssueSelection {
  confirmHandoff?: boolean;
}

interface ChecksRequireOptions extends IssueSelection {
  command: string;
  remove?: boolean;
  details?: string;
}

interface ChecksRecordOptions extends IssueSelection {
  snapshot: string;
  command: string;
  result: string;
  details?: string;
}

interface NextOptions {
  spec: string;
}

interface IssueDocument {
  metadata: Record<string, unknown>;
  id: string;
  title: string;
  reporter: string;
  category: (typeof ISSUE_CATEGORIES)[number];
  status: (typeof TRIAGE_STATUSES)[number];
  blocked_by: string[];
  body: string;
  path: string;
  raw: string;
}

interface RecoveryWrite {
  path: string;
  before: string | null;
  after: string;
}

function validateAuthor(author: string): void {
  if (!author.trim()) throw new Error("Author must not be empty.");
}

function validateIssueId(issue: string): void {
  if (!ISSUE_ID.test(issue)) throw new Error(`Invalid issue ID: ${issue}.`);
}

function validateCategory(category: string): asserts category is IssueDocument["category"] {
  if (!ISSUE_CATEGORIES.includes(category as IssueDocument["category"])) {
    throw new Error(`Invalid issue category: ${category}.`);
  }
}

function validateTriageStatus(status: string): asserts status is IssueDocument["status"] {
  if (!TRIAGE_STATUSES.includes(status as IssueDocument["status"])) {
    throw new Error(`Invalid triage status: ${status}.`);
  }
}

function validateCreateOptions({ title, author }: CreateOptions): void {
  if (!title.trim()) throw new Error("Title must not be empty.");
  if (!author.trim()) throw new Error("Author must not be empty.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImplementationAssignment(value: unknown): value is ImplementationAssignment {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    value.role !== "implementation" ||
    value.action !== "implement" ||
    typeof value.controller !== "string" ||
    !value.controller.trim() ||
    typeof value.report !== "string" ||
    !isAbsolute(value.report) ||
    typeof value.requestedAt !== "string" ||
    !Number.isFinite(Date.parse(value.requestedAt)) ||
    !["pending", "submitted", "unavailable"].includes(String(value.status)) ||
    !Array.isArray(value.handoffs) ||
    !value.handoffs.every(
      (handoff) =>
        isRecord(handoff) &&
        typeof handoff.at === "string" &&
        Number.isFinite(Date.parse(handoff.at)) &&
        typeof handoff.from === "string" &&
        handoff.from.trim() &&
        typeof handoff.to === "string" &&
        handoff.to.trim() &&
        handoff.confirmedStopped === true,
    )
  ) {
    return false;
  }
  if (value.status === "submitted") {
    return (
      typeof value.reportSha256 === "string" &&
      /^[0-9a-f]{64}$/i.test(value.reportSha256) &&
      typeof value.submittedAt === "string" &&
      Number.isFinite(Date.parse(value.submittedAt)) &&
      typeof value.submittedBy === "string" &&
      !!value.submittedBy.trim()
    );
  }
  if (value.status === "unavailable") {
    return typeof value.unavailableDetails === "string" && !!value.unavailableDetails.trim();
  }
  return true;
}

function isReviewAssignment(value: unknown): value is ReviewAssignment {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.agent !== "string" ||
    !value.agent.trim() ||
    value.role !== "review" ||
    value.scope !== "initial" ||
    typeof value.snapshot !== "string" ||
    !/^[0-9a-f]{64}$/i.test(value.snapshot) ||
    typeof value.codeSnapshot !== "string" ||
    !/^[0-9a-f]{64}$/i.test(value.codeSnapshot) ||
    typeof value.requirementsSnapshot !== "string" ||
    !/^[0-9a-f]{64}$/i.test(value.requirementsSnapshot) ||
    typeof value.headSha !== "string" ||
    !/^[0-9a-f]{40,64}$/i.test(value.headSha) ||
    !Array.isArray(value.inventory) ||
    !value.inventory.every((path) => typeof path === "string" && path.length > 0) ||
    new Set(value.inventory).size !== value.inventory.length ||
    typeof value.report !== "string" ||
    !isAbsolute(value.report) ||
    typeof value.requestedAt !== "string" ||
    !Number.isFinite(Date.parse(value.requestedAt)) ||
    !["pending", "submitted"].includes(String(value.status))
  ) {
    return false;
  }
  if (value.status === "pending") return true;
  return (
    ["passed", "failed", "unavailable"].includes(String(value.result)) &&
    (value.noFindings === true
      ? value.findingIds === undefined
      : value.noFindings === undefined &&
        Array.isArray(value.findingIds) &&
        value.findingIds.length > 0 &&
        value.findingIds.every((id) => typeof id === "string" && /^F-\d{4,}$/.test(id)) &&
        new Set(value.findingIds).size === value.findingIds.length) &&
    typeof value.reportSha256 === "string" &&
    /^[0-9a-f]{64}$/i.test(value.reportSha256) &&
    typeof value.submittedAt === "string" &&
    Number.isFinite(Date.parse(value.submittedAt)) &&
    typeof value.submittedBy === "string" &&
    !!value.submittedBy.trim() &&
    (value.result === "passed" || (typeof value.details === "string" && !!value.details.trim()))
  );
}

function isReviewFinding(value: unknown): value is ReviewFinding {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    /^F-\d{4,}$/.test(value.id) &&
    ["high", "medium", "low"].includes(String(value.severity)) &&
    typeof value.blocking === "boolean" &&
    ["open", "confirmed", "fixed", "dismissed", "deferred"].includes(String(value.status)) &&
    typeof value.summary === "string" &&
    !!value.summary.trim() &&
    typeof value.details === "string" &&
    !!value.details.trim() &&
    typeof value.author === "string" &&
    !!value.author.trim() &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    Array.isArray(value.provenance) &&
    value.provenance.length > 0 &&
    value.provenance.every(
      (source) =>
        isRecord(source) &&
        typeof source.report === "string" &&
        isAbsolute(source.report) &&
        typeof source.snapshot === "string" &&
        /^[0-9a-f]{64}$/i.test(source.snapshot) &&
        typeof source.author === "string" &&
        !!source.author.trim() &&
        typeof source.summary === "string" &&
        !!source.summary.trim() &&
        typeof source.details === "string" &&
        !!source.details.trim(),
    ) &&
    Array.isArray(value.history) &&
    value.history.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.at === "string" &&
        Number.isFinite(Date.parse(entry.at)) &&
        typeof entry.author === "string" &&
        !!entry.author.trim() &&
        typeof entry.action === "string" &&
        !!entry.action.trim() &&
        typeof entry.details === "string" &&
        !!entry.details.trim(),
    ) &&
    (value.status !== "dismissed" ||
      (typeof value.rulingDetails === "string" && !!value.rulingDetails.trim())) &&
    (value.status !== "deferred" ||
      (typeof value.rulingDetails === "string" &&
        !!value.rulingDetails.trim() &&
        typeof value.followUp === "string" &&
        !!value.followUp.trim())) &&
    (!Object.hasOwn(value, "requirementsDecision") ||
      (typeof value.requirementsDecision === "string" &&
        /^R-\d{4,}$/.test(value.requirementsDecision))) &&
    (value.status !== "fixed" ||
      (isRecord(value.verification) &&
        typeof value.verification.snapshot === "string" &&
        /^[0-9a-f]{64}$/i.test(value.verification.snapshot) &&
        Array.isArray(value.verification.checkCommands) &&
        value.verification.checkCommands.length > 0 &&
        value.verification.checkCommands.every(
          (command) => typeof command === "string" && !!command.trim(),
        ) &&
        typeof value.verification.verifiedAt === "string" &&
        Number.isFinite(Date.parse(value.verification.verifiedAt)) &&
        typeof value.verification.verifiedBy === "string" &&
        !!value.verification.verifiedBy.trim()))
  );
}

function isRequirementsDecision(value: unknown): value is RequirementsDecision {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    /^R-\d{4,}$/.test(value.id) &&
    typeof value.finding === "string" &&
    /^F-\d{4,}$/.test(value.finding) &&
    ["approved", "rejected"].includes(String(value.status)) &&
    typeof value.details === "string" &&
    !!value.details.trim() &&
    typeof value.author === "string" &&
    !!value.author.trim() &&
    typeof value.requirementsSnapshot === "string" &&
    /^[0-9a-f]{64}$/i.test(value.requirementsSnapshot) &&
    typeof value.recordedAt === "string" &&
    Number.isFinite(Date.parse(value.recordedAt))
  );
}

function isCheckRequirement(value: unknown): value is CheckRequirement {
  if (
    !isRecord(value) ||
    typeof value.command !== "string" ||
    !value.command.trim() ||
    typeof value.addedAt !== "string" ||
    !Number.isFinite(Date.parse(value.addedAt)) ||
    typeof value.addedBy !== "string" ||
    !value.addedBy.trim()
  ) {
    return false;
  }
  const removed = Object.hasOwn(value, "removedAt");
  return (
    !removed ||
    (typeof value.removedAt === "string" &&
      Number.isFinite(Date.parse(value.removedAt)) &&
      typeof value.removedBy === "string" &&
      !!value.removedBy.trim() &&
      typeof value.removalDetails === "string" &&
      !!value.removalDetails.trim())
  );
}

function isCheckRecord(value: unknown): value is CheckRecord {
  return (
    isRecord(value) &&
    typeof value.command === "string" &&
    !!value.command.trim() &&
    ["passed", "failed", "unavailable"].includes(String(value.result)) &&
    typeof value.author === "string" &&
    !!value.author.trim() &&
    typeof value.snapshot === "string" &&
    /^[0-9a-f]{64}$/i.test(value.snapshot) &&
    typeof value.codeSnapshot === "string" &&
    /^[0-9a-f]{64}$/i.test(value.codeSnapshot) &&
    typeof value.requirementsSnapshot === "string" &&
    /^[0-9a-f]{64}$/i.test(value.requirementsSnapshot) &&
    typeof value.headSha === "string" &&
    /^[0-9a-f]{40,64}$/i.test(value.headSha) &&
    typeof value.recordedAt === "string" &&
    Number.isFinite(Date.parse(value.recordedAt)) &&
    (value.result === "passed" || (typeof value.details === "string" && !!value.details.trim()))
  );
}

function isCheckGateInvalidation(value: unknown): value is CheckGateInvalidation {
  return (
    isRecord(value) &&
    typeof value.at === "string" &&
    Number.isFinite(Date.parse(value.at)) &&
    typeof value.author === "string" &&
    !!value.author.trim() &&
    typeof value.command === "string" &&
    !!value.command.trim() &&
    ["accepted", "integrated"].includes(String(value.from)) &&
    value.to === "reviewing"
  );
}

function featureSlug(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) throw new Error("Title must contain at least one letter or number.");
  return slug;
}

function assertRealDirectory(path: string, label: string): void {
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (entry && !entry.isDirectory()) {
    throw new Error(`${label} must be a real directory, not a file or symlink.`);
  }
}

function lstatIfPresent(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function waitBriefly(): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
}

export class SddCommand extends Service {
  static register(program: Command, createApp: () => App): void {
    program
      .command("create")
      .description("Create a numbered SDD feature workspace and initial ledger.")
      .requiredOption("--title <title>", "Feature title", once("--title"))
      .requiredOption("--author <author>", "Creation author", once("--author"))
      .option("--require-retrospective", "Require a retrospective when finishing this feature")
      .allowExcessArguments(false)
      .action(async (options: CreateOptions) => {
        validateCreateOptions(options);
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.create(options), null, 2));
      });

    const issue = program.command("issue").description("Create and maintain feature issues.");
    issue
      .command("create")
      .description("Create an attributed issue in the selected feature.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--title <title>", "Issue title", once("--title"))
      .requiredOption("--reporter <reporter>", "Issue reporter", once("--reporter"))
      .requiredOption("--category <category>", "Issue category", once("--category"))
      .requiredOption("--author <author>", "Acting author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: IssueCreateOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.issueCreate(options), null, 2));
      });

    issue
      .command("update")
      .description("Update issue descriptive metadata and dependencies.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .option("--title <title>", "Updated issue title", once("--title"))
      .option("--reporter <reporter>", "Updated issue reporter", once("--reporter"))
      .option("--blocked-by <issues...>", "Authoritative dependency issue IDs")
      .option("--clear-blocked-by", "Remove all issue dependencies")
      .requiredOption("--author <author>", "Acting author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: IssueUpdateOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.issueUpdate(options), null, 2));
      });

    issue
      .command("comment")
      .description("Append an attributed issue comment.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption("--details <details>", "Comment text", once("--details"))
      .requiredOption("--author <author>", "Acting author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: IssueCommentOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.issueComment(options), null, 2));
      });

    program
      .command("triage")
      .description("Set an issue's category and triage status with rationale.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption("--status <status>", "Triage status", once("--status"))
      .requiredOption("--category <category>", "Issue category", once("--category"))
      .requiredOption("--details <details>", "Triage rationale", once("--details"))
      .requiredOption("--author <author>", "Acting author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: TriageOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.triage(options), null, 2));
      });

    program
      .command("ready")
      .description("List ready issues and issues waiting on dependencies.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .allowExcessArguments(false)
      .action(async (options: ReadyOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.ready(options), null, 2));
      });

    program
      .command("claim")
      .description("Claim a ready issue from a clean Git checkout.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption("--author <author>", "Controller author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: ClaimOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.claim(options), null, 2));
      });

    const checks = program.command("checks").description("Declare and record required checks.");
    checks
      .command("require")
      .description("Add or remove a required external check.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption("--command <command>", "Exact externally executed command", once("--command"))
      .option("--remove", "Remove the requirement; requires --details rationale")
      .option("--details <details>", "Removal rationale")
      .requiredOption("--author <author>", "Acting controller", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: ChecksRequireOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.checksRequire(options), null, 2));
      });
    checks
      .command("record")
      .description("Record an externally executed check against a current snapshot.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption(
        "--snapshot <snapshot>",
        "CLI-returned content snapshot identity",
        once("--snapshot"),
      )
      .requiredOption("--command <command>", "Exact required command", once("--command"))
      .requiredOption(
        "--result <result>",
        "Check result: passed, failed, unavailable",
        once("--result"),
      )
      .option("--details <details>", "Failure or unavailability details")
      .requiredOption("--author <author>", "Acting controller", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: ChecksRecordOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.checksRecord(options), null, 2));
      });

    program
      .command("implement")
      .description("Persist and return an implementation assignment.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption("--author <author>", "Controller author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: ImplementOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.implement(options), null, 2));
      });

    program
      .command("review")
      .description("Freeze the confirmed change inventory and persist review assignments.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption(
        "--inventory <json>",
        "Controller-confirmed Git-derived inventory as a JSON string array",
        once("--inventory"),
      )
      .requiredOption("--author <author>", "Controller author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: ReviewOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.review(options), null, 2));
      });

    const finding = program
      .command("finding")
      .description("Register canonical review findings and explicit rulings.");
    finding
      .command("create")
      .description("Register a review finding with its report and snapshot provenance.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption(
        "--source <path>",
        "Assigned review report containing the finding",
        once("--source"),
      )
      .requiredOption(
        "--snapshot <snapshot>",
        "Reviewed snapshot returned by the CLI",
        once("--snapshot"),
      )
      .requiredOption(
        "--severity <severity>",
        "Finding severity: high, medium, low",
        once("--severity"),
      )
      .option("--blocking", "Mark the finding as blocking")
      .option("--non-blocking", "Mark the finding as non-blocking")
      .option("--link <id>", "Explicitly link this observation to a canonical finding")
      .requiredOption("--summary <summary>", "Concise finding summary", once("--summary"))
      .requiredOption("--details <details>", "Full finding details", once("--details"))
      .requiredOption("--author <author>", "Finding registration author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: FindingCreateOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.findingCreate(options), null, 2));
      });
    finding
      .command("update")
      .description("Record an explicit, attributed finding disposition.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption("--finding <id>", "Canonical finding ID", once("--finding"))
      .requiredOption(
        "--status <status>",
        "Finding status: open, confirmed, fixed, dismissed, deferred",
      )
      .option("--details <details>", "Ruling explanation or rationale")
      .option("--follow-up <reference>", "Required follow-up reference for a deferral")
      .option(
        "--requirements-decision <id>",
        "Approved requirements decision covering a scope change",
      )
      .option("--evidence <snapshot>", "Current CLI snapshot with passing verification checks")
      .requiredOption("--author <author>", "Ruling author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: FindingUpdateOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.findingUpdate(options), null, 2));
      });
    const requirements = program
      .command("requirements")
      .description("Record explicit requirements decisions before fresh review.");
    requirements
      .command("decide")
      .description("Approve or reject an issue requirements change and invalidate prior review.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption(
        "--finding <id>",
        "Finding affected by the requirements decision",
        once("--finding"),
      )
      .requiredOption("--decision <decision>", "Decision: approved or rejected")
      .requiredOption("--details <details>", "Decision rationale", once("--details"))
      .requiredOption("--author <author>", "Decision author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: RequirementsDecideOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.requirementsDecide(options), null, 2));
      });

    let findingsDeclared = false;
    let noFindingsDeclared = false;
    const submitCommand = program
      .command("submit")
      .description("Register an implementation or review report.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption("--role <role>", "Assignment role")
      .option("--assignment <id>", "Exact review assignment ID", once("--assignment"))
      .option("--report <path>", "Implementation report path", once("--report"))
      .option("--result <result>", "Review result: passed, failed, unavailable", once("--result"))
      .option("--findings <ids...>", "Complete canonical finding ID list for this report")
      .option("--no-findings", "Explicitly attest that the review report has no findings")
      .option("--unavailable", "Record that the assigned report is unavailable")
      .option(
        "--details <details>",
        "Required details for failed or unavailable results",
        once("--details"),
      )
      .requiredOption("--author <author>", "Controller author", once("--author"))
      .allowExcessArguments(false);
    submitCommand.on("option:findings", () => {
      findingsDeclared = true;
    });
    submitCommand.on("option:no-findings", () => {
      noFindingsDeclared = true;
    });
    submitCommand.action(async (options: SubmitOptions) => {
      const command = await createApp().get(SddCommand);
      if (findingsDeclared && noFindingsDeclared) {
        throw new Error("--findings and --no-findings cannot be combined.");
      }
      const { findings, ...submission } = options;
      console.log(
        JSON.stringify(
          command.submit({
            ...submission,
            ...(options.role === "review"
              ? findings === false
                ? { noFindings: true }
                : Array.isArray(findings)
                  ? { findingIds: findings }
                  : {}
              : {}),
          }),
          null,
          2,
        ),
      );
    });

    program
      .command("accept")
      .description("Accept an issue with current checks and complete passing review coverage.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption("--author <author>", "Controller author", once("--author"))
      .allowExcessArguments(false)
      .action(async (options: AcceptOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.accept(options), null, 2));
      });

    program
      .command("resume")
      .description("Restore the recorded issue gate and assignment.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .requiredOption("--issue <id>", "Issue ID", once("--issue"))
      .requiredOption("--author <author>", "Controller author", once("--author"))
      .option("--confirm-handoff", "Confirm the previous controller has stopped editing")
      .allowExcessArguments(false)
      .action(async (options: ResumeOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.resume(options), null, 2));
      });

    program
      .command("next")
      .description("Show the next permitted issue actions without changing state.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .allowExcessArguments(false)
      .action(async (options: NextOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.next(options), null, 2));
      });

    program
      .command("status")
      .description("Inspect state, permitted actions, assignments, and blockers.")
      .requiredOption("--spec <path>", "Feature spec path", once("--spec"))
      .allowExcessArguments(false)
      .action(async (options: StatusOptions) => {
        const command = await createApp().get(SddCommand);
        console.log(JSON.stringify(command.status(options), null, 2));
      });
  }

  constructor(app: App) {
    super(app);
  }

  create(options: CreateOptions): FeaturePaths {
    validateCreateOptions(options);
    const root = realpathSync(this.app.workspaceRoot);
    if (!statSync(root).isDirectory()) throw new Error("Workspace root must be a directory.");

    const scratch = join(root, ".scratch");
    if (this.#isIgnored(root, ".scratch/.sdd-create.lock")) {
      throw new Error("Feature destination is ignored: .scratch");
    }
    const scratchEntry = lstatIfPresent(scratch);
    if (scratchEntry) {
      assertRealDirectory(scratch, ".scratch");
    } else {
      try {
        mkdirSync(scratch);
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          error.code !== "EEXIST"
        ) {
          throw error;
        }
        assertRealDirectory(scratch, ".scratch");
      }
    }
    if (!isPathInside(root, realpathSync(scratch))) {
      throw new Error(".scratch must remain inside this checkout.");
    }

    const release = this.#acquireCreationLock(scratch);
    try {
      this.#rejectAbandonedStaging(scratch);
      const id = this.#nextFeatureId(scratch);
      const feature = `${id}-${featureSlug(options.title)}`;
      const workspace = join(scratch, feature);
      if (lstatIfPresent(workspace)) {
        throw new Error(`Feature workspace already exists: ${feature}`);
      }

      const relativeBase = `.scratch/${feature}`;
      for (const target of [
        `${relativeBase}/spec.md`,
        `${relativeBase}/sdd.json`,
        `${relativeBase}/issues`,
        `${relativeBase}/reports`,
      ]) {
        if (this.#isIgnored(root, target)) {
          throw new Error(`Feature destination is ignored: ${target}`);
        }
      }

      const staging = mkdtempSync(join(scratch, ".sdd-create-"));
      try {
        mkdirSync(join(staging, "issues"));
        mkdirSync(join(staging, "reports"));
        const ledger: FeatureLedger = {
          schemaVersion: 1,
          featureId: id,
          title: options.title.trim(),
          createdBy: options.author.trim(),
          createdAt: new Date().toISOString(),
          retrospectiveRequired: options.requireRetrospective ?? false,
          reviewPolicy: {
            version: 1,
            issue: ["sdd-reviewer"],
            delivery: ["sdd-reviewer"],
          },
          issues: [],
          delivery: {
            execution: "unstarted",
            history: [],
          },
        };
        writeFileSync(join(staging, "spec.md"), `# ${options.title.trim()}\n`, {
          flag: "wx",
        });
        writeFileSync(join(staging, "sdd.json"), `${JSON.stringify(ledger, null, 2)}\n`, {
          flag: "wx",
        });
        if (lstatIfPresent(workspace)) {
          throw new Error(`Feature workspace already exists: ${feature}`);
        }
        renameSync(staging, workspace);
      } catch (error) {
        rmSync(staging, { recursive: true, force: true });
        throw new Error(
          `Feature creation failed before publishing ${feature}; no complete workspace was created: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return {
        feature,
        workspace,
        spec: join(workspace, "spec.md"),
        ledger: join(workspace, "sdd.json"),
      };
    } finally {
      release();
    }
  }

  status({ spec }: StatusOptions): FeaturePaths & {
    state: FeatureLedger;
    snapshots: ({ issue: string } & ContentIdentity)[];
    findings: { issue: string; finding: ReviewFinding }[];
    requirementsDecisions: { issue: string; decision: RequirementsDecision }[];
    actions: { issue: string; action: string }[];
    pendingAssignments: {
      issue: string;
      id: string;
      role: "implementation" | "review";
      action: "implement" | "review";
      report: string;
      status: ImplementationAssignment["status"] | ReviewAssignment["status"];
      agent?: string;
      scope?: ReviewAssignment["scope"];
    }[];
    blockers: { issue: string; reason: string }[];
  } {
    if (!spec.trim()) throw new Error("Spec path must not be empty.");
    if (spec.includes("\\"))
      throw new Error("Spec path must use checkout-relative path separators.");
    const inputSegments = spec.startsWith("/") ? spec.slice(1).split("/") : spec.split("/");
    if (inputSegments.some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error("Spec path must not contain empty, current, or parent path segments.");
    }
    const root = realpathSync(this.app.workspaceRoot);
    const specPath = resolve(root, spec);
    if (!isPathInside(root, specPath)) throw new Error("Spec must be inside this checkout.");
    const relativeSpec = relative(root, specPath);
    const segments = relativeSpec.split(sep);
    if (
      segments.length !== 3 ||
      segments[0] !== ".scratch" ||
      segments[2] !== "spec.md" ||
      HISTORICAL_DATE_DIRECTORY.test(segments[1] ?? "") ||
      !FEATURE_DIRECTORY.test(segments[1] ?? "")
    ) {
      throw new Error("Spec must be spec.md in a numbered feature workspace under .scratch.");
    }
    const feature = this.#statusFromPaths(root, specPath, relativeSpec, segments);
    const issues = this.#readIssues(feature.workspace);
    this.#validateDependencyGraph(issues);
    const byId = new Map(issues.map((issue) => [issue.id, issue]));
    const progressById = new Map(feature.state.issues.map((item) => [item.id, item]));
    let checkoutChanges: string | undefined;
    try {
      checkoutChanges = this.#gitChangeSummary(feature);
    } catch {
      checkoutChanges = undefined;
    }
    const actions: { issue: string; action: string }[] = [];
    const snapshots: ({ issue: string } & ContentIdentity)[] = [];
    const findings: { issue: string; finding: ReviewFinding }[] = [];
    const requirementsDecisions: { issue: string; decision: RequirementsDecision }[] = [];
    const pendingAssignments: {
      issue: string;
      id: string;
      role: "implementation" | "review";
      action: "implement" | "review";
      report: string;
      status: ImplementationAssignment["status"] | ReviewAssignment["status"];
      agent?: string;
      scope?: ReviewAssignment["scope"];
    }[] = [];
    const blockers: { issue: string; reason: string }[] = [];

    for (const progress of feature.state.issues) {
      const issue = byId.get(progress.id);
      if (!issue) {
        blockers.push({ issue: progress.id, reason: "Issue Markdown is missing." });
        continue;
      }
      const identity = this.#contentIdentity(feature, issue, progress.baseSha, progress.checks);
      snapshots.push({ issue: progress.id, ...identity });
      for (const finding of progress.findings ?? []) {
        findings.push({ issue: progress.id, finding });
      }
      for (const decision of progress.requirementsDecisions ?? []) {
        requirementsDecisions.push({ issue: progress.id, decision });
        if (
          decision.status === "rejected" &&
          decision.requirementsSnapshot === identity.requirementsSnapshot
        ) {
          blockers.push({
            issue: progress.id,
            reason: `Requirements decision ${decision.id} was rejected; acceptance requires an approved decision and fresh review.`,
          });
        }
      }
      const checkBlockers = this.#checkBlockers(progress, identity);
      for (const reason of checkBlockers) blockers.push({ issue: progress.id, reason });
      for (const reason of this.#findingBlockers(progress, identity)) {
        blockers.push({ issue: progress.id, reason });
      }
      if (progress.execution === "unstarted") {
        if (issue.status !== "ready-for-agent") {
          blockers.push({ issue: progress.id, reason: `Triage status is ${issue.status}.` });
          continue;
        }
        const unmet = issue.blocked_by.filter((dependency) => {
          const dependencyProgress = progressById.get(dependency);
          const dependencyIssue = byId.get(dependency);
          return (
            !dependencyProgress ||
            dependencyProgress.execution !== "integrated" ||
            !dependencyIssue ||
            !this.#hasCurrentCheckCoverage(feature, dependencyIssue, dependencyProgress)
          );
        });
        if (unmet.length > 0) {
          blockers.push({
            issue: progress.id,
            reason: `Dependencies are not integrated: ${unmet.join(", ")}.`,
          });
          continue;
        }
        if (checkoutChanges === undefined) {
          blockers.push({
            issue: progress.id,
            reason: "Checkout cleanliness could not be verified; claim is unavailable.",
          });
          continue;
        }
        if (checkoutChanges) {
          blockers.push({
            issue: progress.id,
            reason: `Checkout is dirty; claim requires no staged, unstaged, or untracked changes: ${checkoutChanges}`,
          });
          continue;
        }
        actions.push({ issue: progress.id, action: "claim" });
      } else if (progress.execution === "claimed") {
        if (progress.owner && progress.baseSha) {
          actions.push({ issue: progress.id, action: "implement" });
        } else {
          blockers.push({
            issue: progress.id,
            reason: "Claim has no recorded owner or baseline; implementation is unavailable.",
          });
        }
      } else if (progress.execution === "implementing") {
        if (progress.assignment) {
          pendingAssignments.push({
            issue: progress.id,
            id: progress.assignment.id,
            role: progress.assignment.role,
            action: progress.assignment.action,
            report: progress.assignment.report,
            status: progress.assignment.status,
          });
          if (progress.assignment.status === "submitted") {
            const reason = this.#implementationReportBlocker(feature, progress.assignment);
            if (reason) blockers.push({ issue: progress.id, reason });
            else if (checkBlockers.length === 0)
              actions.push({ issue: progress.id, action: "review" });
          } else {
            actions.push({ issue: progress.id, action: "await-implementation-report" });
          }
        } else {
          blockers.push({
            issue: progress.id,
            reason: "Implementation is marked in progress without a recorded assignment.",
          });
        }
      } else if (progress.execution === "reviewing") {
        const reason = this.#implementationReportBlocker(feature, progress.assignment);
        if (reason) {
          blockers.push({ issue: progress.id, reason });
          continue;
        }
        const reviewCheckBlockers = this.#reviewCheckBlockers(progress, identity);
        for (const blocker of reviewCheckBlockers)
          blockers.push({ issue: progress.id, reason: blocker });
        const assignments = progress.reviewAssignments ?? [];
        for (const assignment of assignments) {
          if (assignment.status === "pending") {
            pendingAssignments.push({
              issue: progress.id,
              id: assignment.id,
              role: assignment.role,
              action: "review",
              report: assignment.report,
              status: assignment.status,
              agent: assignment.agent,
              scope: assignment.scope,
            });
          }
          const assignmentBlocker = this.#reviewAssignmentBlocker(
            feature,
            progress,
            assignment,
            identity,
          );
          if (assignmentBlocker) blockers.push({ issue: progress.id, reason: assignmentBlocker });
        }
        if (reviewCheckBlockers.length === 0) {
          if (assignments.length === 0) actions.push({ issue: progress.id, action: "review" });
          else if (assignments.some((assignment) => assignment.status === "pending")) {
            actions.push({ issue: progress.id, action: "await-review-report" });
          } else if (
            assignments.every(
              (assignment) => assignment.status === "submitted" && assignment.result === "passed",
            ) &&
            assignments.every(
              (assignment) =>
                this.#reviewAssignmentBlocker(feature, progress, assignment, identity) ===
                undefined,
            )
          ) {
            actions.push({
              issue: progress.id,
              action:
                this.#findingBlockers(progress, identity).length > 0
                  ? "resolve-findings"
                  : "accept",
            });
          }
        }
      } else if (progress.execution === "changes-requested") {
        blockers.push({
          issue: progress.id,
          reason: "A correction decision is required before another implementation dispatch.",
        });
        actions.push({
          issue: progress.id,
          action:
            this.#findingBlockers(progress, identity).length > 0
              ? "adjudicate-findings"
              : "controller-correction-decision",
        });
      } else if (progress.execution === "blocked") {
        blockers.push({ issue: progress.id, reason: "Issue execution is blocked." });
      } else if (progress.execution === "accepted") {
        const acceptanceBlockers = this.#acceptBlockers(feature, feature.state, progress, identity);
        for (const reason of acceptanceBlockers) {
          if (
            !blockers.some((blocker) => blocker.issue === progress.id && blocker.reason === reason)
          ) {
            blockers.push({ issue: progress.id, reason });
          }
        }
        if (acceptanceBlockers.length === 0)
          actions.push({ issue: progress.id, action: "integrate" });
      }
    }
    for (const issue of issues) {
      if (!progressById.has(issue.id)) {
        blockers.push({ issue: issue.id, reason: "Issue has no ledger execution record." });
      }
    }

    return {
      ...feature,
      snapshots,
      findings,
      requirementsDecisions,
      actions,
      pendingAssignments,
      blockers,
    };
  }

  issueCreate(options: IssueCreateOptions): { issue: string; path: string } {
    this.#validateIssueCreateOptions(options);
    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const ledger = this.#readLedger(feature);
      const issues = this.#readIssues(feature.workspace);
      this.#validateDependencyGraph(issues);
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
      this.#assertIssuePath(feature.workspace, path);
      const issue = {
        id,
        title: options.title.trim(),
        reporter: options.reporter.trim(),
        category: options.category as IssueDocument["category"],
        status: "needs-triage" as const,
        blocked_by: [],
      };
      const document = matter.stringify(
        this.#appendAudit(
          "\n## Requirements\n\n## Acceptance Criteria\n\n## Comments\n",
          options.author,
          "Issue created.",
        ),
        issue,
      );
      ledger.issues.push({ id, execution: "unstarted" });
      this.#applyWrites(feature.workspace, [
        { path: relative(feature.workspace, path), before: null, after: document },
        {
          path: "sdd.json",
          before: readFileSync(feature.ledger, "utf8"),
          after: `${JSON.stringify(ledger, null, 2)}\n`,
        },
      ]);
      return { issue: id, path };
    } finally {
      release();
    }
  }

  checksRequire(options: ChecksRequireOptions): {
    issue: string;
    checks: IssueChecks;
    idempotent?: boolean;
    invalidatedDecision?: { from: "accepted" | "integrated"; to: "reviewing" };
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    const command = options.command.trim();
    if (!command) throw new Error("Check command must not be empty.");
    if (options.remove && !options.details?.trim()) {
      throw new Error("Removing a required check requires non-empty --details rationale.");
    }
    if (!options.remove && options.details !== undefined) {
      throw new Error("--details is only valid when removing a required check.");
    }
    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const ledger = this.#readLedger(feature);
      const progress = this.#requireProgress(ledger, options.issue);
      if (progress.execution === "reviewing" && (progress.reviewAssignments?.length ?? 0) > 0) {
        throw new Error(
          "The review snapshot is frozen; required checks cannot change while review assignments are active.",
        );
      }
      const checks = (progress.checks ??= { required: [], records: [], invalidations: [] });
      const active = checks.required.find(
        (requirement) => requirement.command === command && !requirement.removedAt,
      );
      if (options.remove) {
        if (!active) throw new Error(`Required check is not declared: ${command}.`);
        active.removedAt = new Date().toISOString();
        active.removedBy = options.author.trim();
        active.removalDetails = options.details!.trim();
      } else {
        if (active) {
          return {
            issue: options.issue,
            checks,
            idempotent: true,
            ...this.#contentIdentity(
              feature,
              this.#requireIssue(this.#readIssues(feature.workspace), options.issue),
              progress.baseSha,
              checks,
            ),
          };
        }
        checks.required.push({
          command,
          addedAt: new Date().toISOString(),
          addedBy: options.author.trim(),
        });
      }
      let invalidatedDecision: { from: "accepted" | "integrated"; to: "reviewing" } | undefined;
      if (progress.execution === "accepted" || progress.execution === "integrated") {
        const from = progress.execution;
        progress.execution = "reviewing";
        const invalidation = {
          at: new Date().toISOString(),
          author: options.author.trim(),
          command,
          from,
          to: "reviewing" as const,
        };
        (checks.invalidations ??= []).push(invalidation);
        invalidatedDecision = { from, to: "reviewing" };
      }
      const currentIssue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const identity = this.#contentIdentity(feature, currentIssue, progress.baseSha, checks);
      this.#writeLedger(feature, ledger);
      return {
        issue: options.issue,
        checks,
        ...(invalidatedDecision ? { invalidatedDecision } : {}),
        ...identity,
      };
    } finally {
      release();
    }
  }

  checksRecord(options: ChecksRecordOptions): {
    issue: string;
    record: CheckRecord;
    idempotent?: boolean;
  } & ContentIdentity {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    const command = options.command.trim();
    if (!command) throw new Error("Check command must not be empty.");
    if (!/^[0-9a-f]{64}$/i.test(options.snapshot)) {
      throw new Error("Snapshot must be a 64-character hexadecimal content identity.");
    }
    if (!["passed", "failed", "unavailable"].includes(options.result)) {
      throw new Error(`Invalid check result: ${options.result}.`);
    }
    if (options.result !== "passed" && !options.details?.trim()) {
      throw new Error("--details is required for failed or unavailable checks.");
    }
    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const ledger = this.#readLedger(feature);
      const progress = this.#requireProgress(ledger, options.issue);
      const checks = progress.checks;
      if (!checks) throw new Error("No required checks are declared for this issue.");
      const requirement = checks.required.find(
        (item) => item.command === command && !item.removedAt,
      );
      if (!requirement) throw new Error(`Check command is not currently required: ${command}.`);
      const issue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const identity = this.#contentIdentity(feature, issue, progress.baseSha, checks);
      if (identity.snapshot !== options.snapshot) {
        throw new Error(
          `Snapshot is stale; current content identity is ${identity.snapshot}. No check result was recorded.`,
        );
      }
      const latestForCommand = [...checks.records]
        .reverse()
        .find((record) => record.command === command);
      const repeat =
        latestForCommand &&
        latestForCommand.result === options.result &&
        latestForCommand.author === options.author.trim() &&
        latestForCommand.snapshot === options.snapshot &&
        latestForCommand.details === options.details?.trim()
          ? latestForCommand
          : undefined;
      if (repeat) return { issue: options.issue, record: repeat, idempotent: true, ...identity };
      const record: CheckRecord = {
        command,
        result: options.result as CheckRecord["result"],
        author: options.author.trim(),
        snapshot: identity.snapshot,
        codeSnapshot: identity.codeSnapshot,
        requirementsSnapshot: identity.requirementsSnapshot,
        headSha: identity.headSha,
        recordedAt: new Date().toISOString(),
        ...(options.details?.trim() ? { details: options.details.trim() } : {}),
      };
      checks.records.push(record);
      const confirmedIssue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const confirmedIdentity = this.#contentIdentity(
        feature,
        confirmedIssue,
        progress.baseSha,
        checks,
      );
      if (confirmedIdentity.snapshot !== identity.snapshot) {
        checks.records.pop();
        throw new Error("Content changed while recording the check; retry with a fresh snapshot.");
      }
      this.#writeLedger(feature, ledger);
      return { issue: options.issue, record, ...identity };
    } finally {
      release();
    }
  }

  issueUpdate(options: IssueUpdateOptions): { issue: string; path: string } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    if (
      options.title === undefined &&
      options.reporter === undefined &&
      options.blockedBy === undefined &&
      !options.clearBlockedBy
    ) {
      throw new Error("Provide descriptive metadata or dependency options to update.");
    }
    if (options.clearBlockedBy && options.blockedBy !== undefined) {
      throw new Error("--clear-blocked-by cannot be combined with --blocked-by.");
    }
    if (options.title !== undefined && !options.title.trim())
      throw new Error("Title must not be empty.");
    if (options.reporter !== undefined && !options.reporter.trim()) {
      throw new Error("Reporter must not be empty.");
    }
    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const issues = this.#readIssues(feature.workspace);
      const current = this.#requireIssue(issues, options.issue);
      const updated = { ...current };
      if (options.title !== undefined) updated.title = options.title.trim();
      if (options.reporter !== undefined) updated.reporter = options.reporter.trim();
      if (options.blockedBy !== undefined) {
        const blockedBy = this.#normalizeDependencies(options.blockedBy);
        updated.blocked_by = blockedBy;
      }
      if (options.clearBlockedBy) updated.blocked_by = [];
      const changed = this.#serializeIssue(
        updated,
        this.#appendAudit(current.body, options.author, "Issue metadata and dependencies updated."),
      );
      const candidate = issues.map((item) =>
        item.id === current.id ? { ...updated, raw: changed, body: matter(changed).content } : item,
      );
      this.#validateDependencyGraph(candidate);
      this.#applyWrites(feature.workspace, [
        { path: relative(feature.workspace, current.path), before: current.raw, after: changed },
      ]);
      return { issue: options.issue, path: current.path };
    } finally {
      release();
    }
  }

  triage(options: TriageOptions): { issue: string; path: string } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    if (!options.details.trim()) throw new Error("Triage details must not be empty.");
    validateCategory(options.category);
    validateTriageStatus(options.status);
    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      this.#readLedger(feature);
      const issues = this.#readIssues(feature.workspace);
      const current = this.#requireIssue(issues, options.issue);
      const metadata = this.#metadata(current);
      metadata.category = options.category;
      metadata.status = options.status;
      const after = matter.stringify(
        this.#appendAudit(current.body, options.author, options.details.trim()),
        metadata,
      );
      this.#validateDependencyGraph(issues);
      this.#applyWrites(feature.workspace, [
        { path: relative(feature.workspace, current.path), before: current.raw, after },
      ]);
      return { issue: options.issue, path: current.path };
    } finally {
      release();
    }
  }

  issueComment(options: IssueCommentOptions): { issue: string; path: string } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    if (!options.details.trim()) throw new Error("Comment details must not be empty.");
    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      this.#readLedger(feature);
      const current = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const after = matter.stringify(
        this.#appendAudit(current.body, options.author, options.details.trim()),
        this.#metadata(current),
      );
      this.#applyWrites(feature.workspace, [
        { path: relative(feature.workspace, current.path), before: current.raw, after },
      ]);
      return { issue: options.issue, path: current.path };
    } finally {
      release();
    }
  }

  ready(options: ReadyOptions): {
    ready: string[];
    unready: { issue: string; blockedBy: string[] }[];
  } {
    const feature = this.#resolveFeature(options.spec);
    let ledger: FeatureLedger | undefined;
    let issues: IssueDocument[] | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.#assertReadyReadable(feature.workspace);
      const ledgerRaw = readFileSync(feature.ledger, "utf8");
      this.#validateLedger(JSON.parse(ledgerRaw) as unknown, feature.feature);
      const observedIssues = this.#readIssues(feature.workspace);
      this.#assertReadyReadable(feature.workspace);

      const confirmedLedgerRaw = readFileSync(feature.ledger, "utf8");
      const confirmedLedger = this.#validateLedger(
        JSON.parse(confirmedLedgerRaw) as unknown,
        feature.feature,
      );
      const confirmedIssues = this.#readIssues(feature.workspace);
      this.#assertReadyReadable(feature.workspace);
      const observedIssueContents = new Map(observedIssues.map((issue) => [issue.id, issue.raw]));
      const issuesMatch =
        observedIssueContents.size === confirmedIssues.length &&
        confirmedIssues.every((issue) => observedIssueContents.get(issue.id) === issue.raw);
      if (ledgerRaw === confirmedLedgerRaw && issuesMatch) {
        ledger = confirmedLedger;
        issues = confirmedIssues;
        break;
      }
    }
    if (!ledger || !issues) {
      throw new Error("Issue data changed while reading the ready queue; retry ready.");
    }
    this.#validateDependencyGraph(issues);
    const progress = new Map(ledger.issues.map((item) => [item.id, item]));
    const byId = new Map(issues.map((item) => [item.id, item]));
    const eligible = issues.filter(
      (item) =>
        item.status === "ready-for-agent" && progress.get(item.id)?.execution === "unstarted",
    );
    const ready: string[] = [];
    const unready: { issue: string; blockedBy: string[] }[] = [];
    for (const item of eligible) {
      const pending = item.blocked_by.filter((id) => {
        const dependencyProgress = progress.get(id);
        const dependencyIssue = byId.get(id);
        return (
          !dependencyProgress ||
          dependencyProgress.execution !== "integrated" ||
          !dependencyIssue ||
          !this.#hasCurrentCheckCoverage(feature, dependencyIssue, dependencyProgress)
        );
      });
      if (pending.length === 0) ready.push(item.id);
      else unready.push({ issue: item.id, blockedBy: pending });
    }
    for (const item of issues) {
      if (!progress.has(item.id))
        throw new Error(`Issue ${item.id} has no ledger execution record.`);
    }
    for (const id of progress.keys()) {
      if (!byId.has(id)) throw new Error(`Ledger issue ${id} has no corresponding Markdown issue.`);
    }
    this.#assertReadyReadable(feature.workspace);
    return { ready, unready };
  }

  claim(options: ClaimOptions): {
    issue: string;
    execution: "claimed";
    owner: string;
    baseSha: string;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const ledger = this.#readLedger(feature);
      const issues = this.#readIssues(feature.workspace);
      this.#validateDependencyGraph(issues);
      const issue = this.#requireIssue(issues, options.issue);
      const progress = this.#requireProgress(ledger, options.issue);
      if (progress.execution !== "unstarted") {
        throw new Error(
          `Issue ${options.issue} is already owned or has progressed to ${progress.execution}.`,
        );
      }
      if (issue.status !== "ready-for-agent") {
        throw new Error(`Issue ${options.issue} is not ready for an agent.`);
      }
      const byId = new Map(ledger.issues.map((item) => [item.id, item]));
      const issuesById = new Map(issues.map((item) => [item.id, item]));
      const unmet = issue.blocked_by.filter((dependency) => {
        const dependencyProgress = byId.get(dependency);
        const dependencyIssue = issuesById.get(dependency);
        return (
          !dependencyProgress ||
          dependencyProgress.execution !== "integrated" ||
          !dependencyIssue ||
          !this.#hasCurrentCheckCoverage(feature, dependencyIssue, dependencyProgress)
        );
      });
      if (unmet.length > 0) {
        throw new Error(
          `Issue ${options.issue} has dependencies that are not integrated: ${unmet.join(", ")}.`,
        );
      }
      const baseSha = this.#cleanGitBaseline(feature);
      progress.execution = "claimed";
      progress.owner = options.author.trim();
      progress.baseSha = baseSha;
      const identity = this.#contentIdentity(feature, issue, baseSha, progress.checks);
      const afterIssue = matter.stringify(
        this.#appendAudit(
          issue.body,
          options.author,
          `Claimed from clean Git baseline ${baseSha}.`,
        ),
        this.#metadata(issue),
      );
      this.#writeWorkflowState(feature, issue, afterIssue, ledger);
      return {
        issue: options.issue,
        execution: "claimed",
        owner: options.author.trim(),
        baseSha,
        ...identity,
      };
    } finally {
      release();
    }
  }

  implement(options: ImplementOptions): {
    issue: string;
    execution: "implementing";
    assignment: ImplementationAssignment;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const ledger = this.#readLedger(feature);
      const issue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const progress = this.#requireProgress(ledger, options.issue);
      const identity = this.#contentIdentity(feature, issue, progress.baseSha, progress.checks);
      if (progress.execution === "implementing" && progress.assignment) {
        if (progress.owner !== options.author.trim()) {
          throw new Error("Controller ownership changed; resume and confirm the handoff first.");
        }
        return {
          issue: options.issue,
          execution: "implementing",
          assignment: progress.assignment,
          ...identity,
        };
      }
      if (progress.execution !== "claimed" || !progress.baseSha || !progress.owner) {
        throw new Error(`Issue ${options.issue} must be claimed before implementation dispatch.`);
      }
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the recorded controller may dispatch implementation.");
      }

      const report = join(feature.workspace, "reports", `${options.issue}-implementation.md`);
      this.#assertReportPath(feature, report, false);
      if (lstatIfPresent(report)) {
        throw new Error(`Assigned report already exists and was preserved: ${report}.`);
      }
      const assignment: ImplementationAssignment = {
        id: randomUUID(),
        role: "implementation",
        action: "implement",
        controller: options.author.trim(),
        report,
        requestedAt: new Date().toISOString(),
        status: "pending",
        handoffs: [],
      };
      progress.execution = "implementing";
      progress.assignment = assignment;
      const afterIssue = matter.stringify(
        this.#appendAudit(
          issue.body,
          options.author,
          `Implementation assignment ${assignment.id} recorded; role=implementation; report=${report}. No agent was launched.`,
        ),
        this.#metadata(issue),
      );
      this.#writeWorkflowState(feature, issue, afterIssue, ledger);
      return { issue: options.issue, execution: "implementing", assignment, ...identity };
    } finally {
      release();
    }
  }

  review(options: ReviewOptions): {
    issue: string;
    execution: "reviewing";
    assignments: ReviewAssignment[];
    idempotent?: boolean;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    let confirmedInventory: unknown;
    try {
      confirmedInventory = JSON.parse(options.inventory) as unknown;
    } catch {
      throw new Error("--inventory must be a JSON string array of Git-derived paths.");
    }
    if (
      !Array.isArray(confirmedInventory) ||
      !confirmedInventory.every((path) => typeof path === "string" && path.length > 0) ||
      new Set(confirmedInventory).size !== confirmedInventory.length
    ) {
      throw new Error("--inventory must be a JSON string array without duplicate paths.");
    }

    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const ledger = this.#readLedger(feature);
      const issue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const progress = this.#requireProgress(ledger, options.issue);
      if (progress.execution !== "reviewing" || !progress.assignment) {
        throw new Error(
          `Issue ${options.issue} must have a submitted implementation before review.`,
        );
      }
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the recorded controller may dispatch review.");
      }
      const implementationBlocker = this.#implementationReportBlocker(feature, progress.assignment);
      if (implementationBlocker) throw new Error(implementationBlocker);
      if (!progress.baseSha) throw new Error("Review requires the issue's recorded Git baseline.");

      const identity = this.#contentIdentity(feature, issue, progress.baseSha, progress.checks);
      const reviewCheckBlockers = this.#reviewCheckBlockers(progress, identity);
      if (reviewCheckBlockers.length > 0) throw new Error(reviewCheckBlockers.join("\n"));
      const inventory = this.#changedPaths(progress.baseSha);
      const suppliedPaths = new Set(confirmedInventory);
      if (
        suppliedPaths.size !== inventory.length ||
        inventory.some((path) => !suppliedPaths.has(path))
      ) {
        throw new Error(
          `Controller-confirmed inventory does not match the current Git-derived inventory: ${JSON.stringify(inventory)}.`,
        );
      }

      const existing = progress.reviewAssignments ?? [];
      if (existing.length > 0) {
        if (
          existing.length !== ledger.reviewPolicy.issue.length ||
          existing.some(
            (assignment, index) =>
              assignment.agent !== ledger.reviewPolicy.issue[index] ||
              assignment.snapshot !== identity.snapshot ||
              assignment.codeSnapshot !== identity.codeSnapshot ||
              assignment.requirementsSnapshot !== identity.requirementsSnapshot ||
              JSON.stringify(assignment.inventory) !== JSON.stringify(inventory),
          )
        ) {
          throw new Error(
            "The frozen review assignment no longer matches the current issue snapshot.",
          );
        }
        for (const assignment of existing) {
          const blocker = this.#reviewSnapshotBlocker(feature, progress, assignment, identity);
          if (blocker) throw new Error(blocker);
        }
        return {
          issue: options.issue,
          execution: "reviewing",
          assignments: existing,
          idempotent: true,
          ...identity,
        };
      }

      const assignments = ledger.reviewPolicy.issue.map((agent) => {
        const catalogEntry = blueprintCatalog.agents[agent];
        if (!catalogEntry || catalogEntry.canReview !== true) {
          throw new Error(`Review agent '${agent}' is not explicitly marked review-eligible.`);
        }
        const id = randomUUID();
        const report = join(feature.workspace, "reports", `${options.issue}-review-${id}.md`);
        this.#assertReportPath(feature, report, false);
        if (lstatIfPresent(report)) {
          throw new Error(`Assigned review report already exists and was preserved: ${report}.`);
        }
        return {
          id,
          agent,
          role: "review" as const,
          scope: "initial" as const,
          snapshot: identity.snapshot,
          codeSnapshot: identity.codeSnapshot,
          requirementsSnapshot: identity.requirementsSnapshot,
          headSha: identity.headSha,
          inventory,
          report,
          requestedAt: new Date().toISOString(),
          status: "pending" as const,
        };
      });

      const confirmedIssue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const confirmedIdentity = this.#contentIdentity(
        feature,
        confirmedIssue,
        progress.baseSha,
        progress.checks,
      );
      const confirmedCurrentInventory = this.#changedPaths(progress.baseSha);
      if (
        confirmedIdentity.snapshot !== identity.snapshot ||
        JSON.stringify(confirmedCurrentInventory) !== JSON.stringify(inventory)
      ) {
        throw new Error(
          "Issue content changed while freezing review; retry with a fresh inventory.",
        );
      }
      progress.reviewAssignments = assignments;
      const assignmentSummary = assignments
        .map((assignment) => `${assignment.agent} (${assignment.id}) -> ${assignment.report}`)
        .join("; ");
      const afterIssue = matter.stringify(
        this.#appendAudit(
          issue.body,
          options.author,
          `Initial review assignment${assignments.length === 1 ? "" : "s"} recorded: ${assignmentSummary}. Inventory and snapshot are frozen.`,
        ),
        this.#metadata(issue),
      );
      this.#writeWorkflowState(feature, issue, afterIssue, ledger);
      return {
        issue: options.issue,
        execution: "reviewing",
        assignments,
        ...identity,
      };
    } finally {
      release();
    }
  }

  findingCreate(options: FindingCreateOptions): {
    issue: string;
    finding: ReviewFinding;
    idempotent?: boolean;
    snapshot: string;
    headSha: string;
  } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    if (!["high", "medium", "low"].includes(options.severity)) {
      throw new Error(`Invalid finding severity: ${options.severity}.`);
    }
    if (options.blocking === options.nonBlocking) {
      throw new Error("Choose exactly one of --blocking or --non-blocking.");
    }
    if (!options.summary.trim()) throw new Error("Finding summary must not be empty.");
    if (!options.details.trim()) throw new Error("Finding details must not be empty.");
    if (!/^[0-9a-f]{64}$/i.test(options.snapshot)) {
      throw new Error("Finding snapshot must be a CLI-returned content snapshot.");
    }

    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const ledger = this.#readLedger(feature);
      const issue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const progress = this.#requireProgress(ledger, options.issue);
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the current issue controller may register findings.");
      }
      const report = options.source
        ? isAbsolute(options.source)
          ? resolve(options.source)
          : resolve(feature.workspace, options.source)
        : "";
      const assignment = progress.reviewAssignments?.find(
        (candidate) => candidate.report === report && candidate.snapshot === options.snapshot,
      );
      if (!assignment) {
        throw new Error(
          "Finding source report and snapshot must match a frozen review assignment for this issue.",
        );
      }
      if (assignment.status === "submitted") {
        throw new Error("Findings must be registered before submitting the review assignment.");
      }
      if (!progress.baseSha)
        throw new Error("Finding registration requires a recorded Git baseline.");
      const identity = this.#contentIdentity(feature, issue, progress.baseSha, progress.checks);
      const snapshotBlocker = this.#reviewSnapshotBlocker(feature, progress, assignment, identity);
      if (snapshotBlocker) throw new Error(snapshotBlocker);
      this.#readReportDigest(feature, report);
      const source: FindingProvenance = {
        report,
        snapshot: options.snapshot,
        author: options.author.trim(),
        summary: options.summary.trim(),
        details: options.details.trim(),
      };
      const findings = progress.findings ?? [];
      if (options.link !== undefined) {
        if (!/^F-\d{4,}$/.test(options.link)) {
          throw new Error(`Invalid canonical finding ID to link: ${options.link}.`);
        }
        const canonical = findings.find((finding) => finding.id === options.link);
        if (!canonical) throw new Error(`Canonical finding not found: ${options.link}.`);
        const priorSource = canonical.provenance.find(
          (provenance) =>
            provenance.report === source.report && provenance.snapshot === source.snapshot,
        );
        if (priorSource) {
          if (
            priorSource.author !== source.author ||
            priorSource.summary !== source.summary ||
            priorSource.details !== source.details
          ) {
            throw new Error("This report and snapshot are already linked with different details.");
          }
          return {
            issue: options.issue,
            finding: canonical,
            idempotent: true,
            snapshot: identity.snapshot,
            headSha: identity.headSha,
          };
        }
        canonical.provenance.push(source);
        canonical.history.push({
          at: new Date().toISOString(),
          author: options.author.trim(),
          action: "observation-linked",
          details: `Linked observation from ${report} at snapshot ${options.snapshot}: ${source.summary} — ${source.details}`,
        });
        if (canonical.status === "fixed" || canonical.status === "dismissed") {
          canonical.status = "open";
          delete canonical.rulingDetails;
          delete canonical.followUp;
          delete canonical.requirementsDecision;
          delete canonical.verification;
          canonical.history.push({
            at: new Date().toISOString(),
            author: options.author.trim(),
            action: "observation-reopened",
            details: `New observation from ${report} at snapshot ${options.snapshot} requires renewed adjudication.`,
          });
        }
        const afterIssue = matter.stringify(
          this.#appendAudit(
            issue.body,
            options.author,
            `Observation linked to finding ${canonical.id}: source=${report}; snapshot=${options.snapshot}; summary=${source.summary}.`,
          ),
          this.#metadata(issue),
        );
        this.#writeWorkflowState(feature, issue, afterIssue, ledger);
        return {
          issue: options.issue,
          finding: canonical,
          snapshot: identity.snapshot,
          headSha: identity.headSha,
        };
      }
      const existing = findings.find(
        (finding) =>
          finding.author === options.author.trim() &&
          finding.severity === options.severity &&
          finding.blocking === (options.blocking === true) &&
          finding.summary === options.summary.trim() &&
          finding.details === options.details.trim() &&
          finding.provenance.some(
            (provenance) =>
              provenance.report === source.report &&
              provenance.snapshot === source.snapshot &&
              provenance.author === source.author &&
              provenance.summary === source.summary &&
              provenance.details === source.details,
          ),
      );
      if (existing) {
        return {
          issue: options.issue,
          finding: existing,
          idempotent: true,
          snapshot: identity.snapshot,
          headSha: identity.headSha,
        };
      }

      let highest = 0n;
      for (const candidate of findings) {
        const match = /^F-(\d{4,})$/.exec(candidate.id);
        if (match && BigInt(match[1]!) > highest) highest = BigInt(match[1]!);
      }
      const at = new Date().toISOString();
      progress.findings = findings;
      const finding: ReviewFinding = {
        id: `F-${String(highest + 1n).padStart(4, "0")}`,
        severity: options.severity as FindingSeverity,
        blocking: options.blocking === true,
        status: "open",
        summary: options.summary.trim(),
        details: options.details.trim(),
        author: options.author.trim(),
        createdAt: at,
        provenance: [source],
        history: [
          {
            at,
            author: options.author.trim(),
            action: "registered",
            details: `Registered from ${report} at snapshot ${options.snapshot}.`,
          },
        ],
      };
      findings.push(finding);
      const afterIssue = matter.stringify(
        this.#appendAudit(
          issue.body,
          options.author,
          `Finding ${finding.id} registered by ${options.author.trim()}: ${finding.summary}; source=${report}; snapshot=${options.snapshot}.`,
        ),
        this.#metadata(issue),
      );
      this.#writeWorkflowState(feature, issue, afterIssue, ledger);
      return {
        issue: options.issue,
        finding,
        snapshot: identity.snapshot,
        headSha: identity.headSha,
      };
    } finally {
      release();
    }
  }

  findingUpdate(options: FindingUpdateOptions): {
    issue: string;
    finding: ReviewFinding;
    idempotent?: boolean;
    snapshot: string;
  } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    if (!/^F-\d{4,}$/.test(options.finding)) {
      throw new Error(`Invalid finding ID: ${options.finding}.`);
    }
    if (!["open", "confirmed", "fixed", "dismissed", "deferred"].includes(options.status)) {
      throw new Error(`Invalid finding status: ${options.status}.`);
    }
    if (["dismissed", "deferred"].includes(options.status) && !options.details?.trim()) {
      throw new Error(`--details is required for a ${options.status} finding disposition.`);
    }
    if (options.status === "deferred" && !options.followUp?.trim()) {
      throw new Error("--follow-up is required for a deferred finding.");
    }
    if (options.status === "fixed" && !options.evidence?.trim()) {
      throw new Error("--evidence is required to mark a finding fixed.");
    }
    if (options.status !== "deferred" && options.followUp !== undefined) {
      throw new Error("--follow-up is only valid for a deferred finding.");
    }
    if (options.status !== "deferred" && options.requirementsDecision !== undefined) {
      throw new Error("--requirements-decision is only valid for a deferred finding.");
    }
    if (options.status !== "fixed" && options.evidence !== undefined) {
      throw new Error("--evidence is only valid for a fixed finding.");
    }

    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const ledger = this.#readLedger(feature);
      const issue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const progress = this.#requireProgress(ledger, options.issue);
      const finding = progress.findings?.find((candidate) => candidate.id === options.finding);
      if (!finding) throw new Error(`Finding not found: ${options.finding}.`);
      const wasBlocking = finding.blocking && !["fixed", "dismissed"].includes(finding.status);
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the current issue controller may record a finding ruling.");
      }
      if (!progress.baseSha) throw new Error("Finding rulings require a recorded Git baseline.");
      const identity = this.#contentIdentity(feature, issue, progress.baseSha, progress.checks);
      let verification: ReviewFinding["verification"];
      let requirementsDecision: RequirementsDecision | undefined;
      if (options.status === "deferred" && finding.blocking) {
        if (!options.requirementsDecision) {
          throw new Error(
            `Blocking finding ${finding.id} requires an approved requirements decision and fresh review before deferral.`,
          );
        }
        requirementsDecision = progress.requirementsDecisions?.find(
          (decision) =>
            decision.id === options.requirementsDecision &&
            decision.finding === finding.id &&
            decision.status === "approved" &&
            decision.requirementsSnapshot === identity.requirementsSnapshot,
        );
        if (!requirementsDecision) {
          throw new Error(
            "Blocking finding deferral requires a matching approved requirements decision for the current requirements snapshot.",
          );
        }
        const assignments = progress.reviewAssignments ?? [];
        for (const agent of ledger.reviewPolicy.issue) {
          const coverage = assignments.filter(
            (assignment) => assignment.agent === agent && assignment.scope === "initial",
          );
          if (
            coverage.length !== 1 ||
            coverage[0]!.status !== "submitted" ||
            coverage[0]!.result !== "passed" ||
            this.#reviewAssignmentBlocker(feature, progress, coverage[0]!, identity)
          ) {
            throw new Error(
              `Blocking finding deferral requires fresh passing review coverage for '${agent}'.`,
            );
          }
        }
      }
      if (options.status === "fixed") {
        if (!/^[0-9a-f]{64}$/i.test(options.evidence!)) {
          throw new Error("--evidence must be a CLI-returned content snapshot.");
        }
        if (options.evidence !== identity.snapshot) {
          throw new Error("Verification evidence must match the current issue snapshot.");
        }
        if (finding.provenance.some((observation) => observation.snapshot === identity.snapshot)) {
          throw new Error(
            "Verification evidence must reflect changed content since every finding observation; dismiss an invalid finding with --details.",
          );
        }
        const required = progress.checks?.required.filter((check) => !check.removedAt) ?? [];
        if (required.length === 0) {
          throw new Error("Verification requires at least one current passing required check.");
        }
        const checkBlockers = this.#checkBlockers(progress, identity);
        if (checkBlockers.length > 0) {
          throw new Error(`Verification evidence is insufficient:\n${checkBlockers.join("\n")}`);
        }
        verification = {
          snapshot: identity.snapshot,
          checkCommands: required.map((check) => check.command),
          verifiedAt: new Date().toISOString(),
          verifiedBy: options.author.trim(),
        };
      }

      const rulingDetails = options.details?.trim();
      const followUp = options.followUp?.trim();
      const last = finding.history.at(-1);
      if (
        finding.status === options.status &&
        finding.rulingDetails === rulingDetails &&
        finding.followUp === followUp &&
        finding.requirementsDecision === requirementsDecision?.id &&
        last?.action === `status:${options.status}` &&
        last.author === options.author.trim() &&
        last.details ===
          (rulingDetails ??
            (verification ? `Verified at ${verification.snapshot}.` : options.status)) &&
        (options.status !== "fixed" || finding.verification?.snapshot === verification?.snapshot)
      ) {
        return { issue: options.issue, finding, idempotent: true, snapshot: identity.snapshot };
      }

      const before = identity.snapshot;
      const currentIdentity = this.#contentIdentity(
        feature,
        this.#requireIssue(this.#readIssues(feature.workspace), options.issue),
        progress.baseSha,
        progress.checks,
      );
      if (currentIdentity.snapshot !== before) {
        throw new Error("Issue content changed while recording the finding ruling.");
      }
      finding.status = options.status as FindingStatus;
      if (["dismissed", "deferred"].includes(options.status)) {
        finding.rulingDetails = rulingDetails!;
      } else {
        delete finding.rulingDetails;
      }
      if (options.status === "deferred") finding.followUp = followUp!;
      else delete finding.followUp;
      if (options.status === "deferred" && requirementsDecision) {
        finding.requirementsDecision = requirementsDecision.id;
      } else {
        delete finding.requirementsDecision;
      }
      if (verification) finding.verification = verification;
      else delete finding.verification;
      if (
        progress.execution === "changes-requested" &&
        wasBlocking &&
        ["fixed", "dismissed"].includes(options.status) &&
        this.#findingBlockers(progress, identity).length === 0
      ) {
        const assignments = progress.reviewAssignments ?? [];
        const freshCoverage =
          assignments.length === ledger.reviewPolicy.issue.length &&
          ledger.reviewPolicy.issue.every((agent) => {
            const matching = assignments.filter((assignment) => assignment.agent === agent);
            return (
              matching.length === 1 &&
              matching[0]!.status === "submitted" &&
              matching[0]!.result === "passed" &&
              this.#reviewAssignmentBlocker(feature, progress, matching[0]!, identity) === undefined
            );
          });
        if (!freshCoverage) {
          progress.reviewHistory = [...(progress.reviewHistory ?? []), ...assignments];
          delete progress.reviewAssignments;
        }
        progress.execution = "reviewing";
      }
      const historyDetails =
        rulingDetails ?? (verification ? `Verified at ${verification.snapshot}.` : options.status);
      finding.history.push({
        at: new Date().toISOString(),
        author: options.author.trim(),
        action: `status:${options.status}`,
        details: historyDetails,
      });
      const audit = [
        `Finding ${finding.id} disposition recorded: ${options.status}`,
        rulingDetails ? `details=${rulingDetails}` : undefined,
        followUp ? `follow-up=${followUp}` : undefined,
        verification ? `verification=${verification.snapshot}` : undefined,
      ]
        .filter((entry): entry is string => entry !== undefined)
        .join("; ");
      const afterIssue = matter.stringify(
        this.#appendAudit(issue.body, options.author, `${audit}.`),
        this.#metadata(issue),
      );
      this.#writeWorkflowState(feature, issue, afterIssue, ledger);
      return { issue: options.issue, finding, snapshot: identity.snapshot };
    } finally {
      release();
    }
  }

  requirementsDecide(options: RequirementsDecideOptions): {
    issue: string;
    execution: ExecutionState;
    decision: RequirementsDecision;
    idempotent?: boolean;
    snapshot: string;
    requirementsSnapshot: string;
  } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    if (!/^F-\d{4,}$/.test(options.finding)) {
      throw new Error(`Invalid finding ID: ${options.finding}.`);
    }
    if (!["approved", "rejected"].includes(options.decision)) {
      throw new Error(`Invalid requirements decision: ${options.decision}.`);
    }
    if (!options.details.trim())
      throw new Error("Requirements decision details must not be empty.");

    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const ledger = this.#readLedger(feature);
      const issue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const progress = this.#requireProgress(ledger, options.issue);
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the current issue controller may record a requirements decision.");
      }
      const finding = progress.findings?.find((candidate) => candidate.id === options.finding);
      if (!finding) throw new Error(`Finding not found: ${options.finding}.`);
      if (!progress.baseSha) {
        throw new Error("Requirements decisions require a recorded Git baseline.");
      }
      const identity = this.#contentIdentity(feature, issue, progress.baseSha, progress.checks);
      const decisions = (progress.requirementsDecisions ??= []);
      const existing = decisions.find(
        (decision) =>
          decision.finding === finding.id &&
          decision.status === options.decision &&
          decision.details === options.details.trim() &&
          decision.author === options.author.trim() &&
          decision.requirementsSnapshot === identity.requirementsSnapshot,
      );
      if (existing) {
        return {
          issue: options.issue,
          execution: progress.execution,
          decision: existing,
          idempotent: true,
          snapshot: identity.snapshot,
          requirementsSnapshot: identity.requirementsSnapshot,
        };
      }
      const priorAssignments = [
        ...(progress.reviewHistory ?? []),
        ...(progress.reviewAssignments ?? []),
      ];
      if (
        priorAssignments.every(
          (assignment) => assignment.requirementsSnapshot === identity.requirementsSnapshot,
        )
      ) {
        throw new Error(
          "A requirements decision requires an explicit requirements change after review.",
        );
      }
      if (
        (progress.reviewAssignments ?? []).some((assignment) => assignment.status === "pending")
      ) {
        throw new Error(
          "Resolve pending review assignments before recording a requirements decision.",
        );
      }

      let highest = 0n;
      for (const decision of decisions) {
        const match = /^R-(\d{4,})$/.exec(decision.id);
        if (match && BigInt(match[1]!) > highest) highest = BigInt(match[1]!);
      }
      const decision: RequirementsDecision = {
        id: `R-${String(highest + 1n).padStart(4, "0")}`,
        finding: finding.id,
        status: options.decision as RequirementsDecision["status"],
        details: options.details.trim(),
        author: options.author.trim(),
        requirementsSnapshot: identity.requirementsSnapshot,
        recordedAt: new Date().toISOString(),
      };
      decisions.push(decision);
      if (decision.status === "approved") {
        progress.reviewHistory = [
          ...(progress.reviewHistory ?? []),
          ...(progress.reviewAssignments ?? []),
        ];
        delete progress.reviewAssignments;
        progress.execution = "reviewing";
      }
      const currentIdentity = this.#contentIdentity(
        feature,
        this.#requireIssue(this.#readIssues(feature.workspace), options.issue),
        progress.baseSha,
        progress.checks,
      );
      if (
        currentIdentity.snapshot !== identity.snapshot ||
        currentIdentity.requirementsSnapshot !== identity.requirementsSnapshot
      ) {
        throw new Error("Issue requirements changed while recording the requirements decision.");
      }
      const afterIssue = matter.stringify(
        this.#appendAudit(
          issue.body,
          options.author,
          `[SDD-SCOPE-RULING id=${decision.id} status=${decision.status}] ${decision.details}.`,
        ),
        this.#metadata(issue),
      );
      this.#writeWorkflowState(feature, issue, afterIssue, ledger);
      return {
        issue: options.issue,
        execution: progress.execution,
        decision,
        snapshot: identity.snapshot,
        requirementsSnapshot: identity.requirementsSnapshot,
      };
    } finally {
      release();
    }
  }

  submit(options: SubmitOptions): {
    issue: string;
    execution: ExecutionState;
    assignment: ImplementationAssignment | ReviewAssignment;
    report?: string;
    reportSha256?: string;
    unavailable?: boolean;
    idempotent?: boolean;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    if (options.role === "review") return this.#submitReview(options);
    if (options.role !== "implementation") {
      throw new Error("Submit role must be implementation or review.");
    }
    if (
      options.assignment !== undefined ||
      options.result !== undefined ||
      options.noFindings ||
      options.findings !== undefined
    ) {
      throw new Error("Review assignment, result, and no-findings options require role review.");
    }
    if (options.unavailable && !options.details?.trim()) {
      throw new Error("--details is required when the implementation report is unavailable.");
    }
    if (options.unavailable && options.report !== undefined) {
      throw new Error("--report cannot be combined with --unavailable.");
    }
    if (!options.unavailable && options.details !== undefined) {
      throw new Error("--details is only valid with --unavailable.");
    }
    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const ledger = this.#readLedger(feature);
      const issue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const progress = this.#requireProgress(ledger, options.issue);
      const identity = this.#contentIdentity(feature, issue, progress.baseSha, progress.checks);
      const assignment = progress.assignment;
      if (!assignment || assignment.action !== "implement" || assignment.role !== options.role) {
        throw new Error("No matching implementation assignment is pending for this issue.");
      }
      if (
        progress.owner !== options.author.trim() ||
        assignment.controller !== options.author.trim()
      ) {
        throw new Error("Only the current controller may submit this implementation report.");
      }
      if (options.unavailable) {
        const details = options.details!.trim();
        if (assignment.status === "unavailable" && assignment.unavailableDetails === details) {
          return {
            issue: options.issue,
            execution: progress.execution,
            assignment,
            unavailable: true,
            idempotent: true,
            ...identity,
          };
        }
        if (assignment.status !== "pending" || progress.execution !== "implementing") {
          throw new Error("The implementation assignment is no longer awaiting a report.");
        }
        assignment.status = "unavailable";
        assignment.unavailableDetails = details;
        const afterIssue = matter.stringify(
          this.#appendAudit(
            issue.body,
            options.author,
            `Implementation report unavailable for assignment ${assignment.id}: ${details}. Work remains pending.`,
          ),
          this.#metadata(issue),
        );
        this.#writeWorkflowState(feature, issue, afterIssue, ledger);
        return {
          issue: options.issue,
          execution: progress.execution,
          assignment,
          unavailable: true,
          ...identity,
        };
      }
      if (assignment.status === "submitted") {
        const currentPath = this.#submissionReportPath(feature, assignment, options.report);
        const digest = this.#readReportDigest(feature, currentPath);
        if (digest !== assignment.reportSha256) {
          throw new Error("The registered implementation report changed after submission.");
        }
        return {
          issue: options.issue,
          execution: progress.execution,
          assignment,
          report: assignment.report,
          reportSha256: digest,
          idempotent: true,
          ...identity,
        };
      }
      if (
        (assignment.status !== "pending" && assignment.status !== "unavailable") ||
        progress.execution !== "implementing"
      ) {
        throw new Error("The implementation assignment is not awaiting a report.");
      }
      const reportPath = this.#submissionReportPath(feature, assignment, options.report);
      let reportSha256: string;
      try {
        reportSha256 = this.#readReportDigest(feature, reportPath);
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          throw new Error(
            `Implementation report is missing or unavailable at ${assignment.report}; the assignment remains pending.`,
          );
        }
        throw error;
      }
      assignment.status = "submitted";
      assignment.reportSha256 = reportSha256;
      assignment.submittedAt = new Date().toISOString();
      assignment.submittedBy = options.author.trim();
      delete assignment.unavailableDetails;
      progress.execution = "reviewing";
      const afterIssue = matter.stringify(
        this.#appendAudit(
          issue.body,
          options.author,
          `Implementation report submitted for assignment ${assignment.id}: ${assignment.report} (sha256 ${reportSha256}).`,
        ),
        this.#metadata(issue),
      );
      this.#writeWorkflowState(feature, issue, afterIssue, ledger);
      return {
        issue: options.issue,
        execution: progress.execution,
        assignment,
        report: assignment.report,
        reportSha256,
        ...identity,
      };
    } finally {
      release();
    }
  }

  #submitReview(options: SubmitOptions): {
    issue: string;
    execution: ExecutionState;
    assignment: ReviewAssignment;
    report: string;
    reportSha256: string;
    idempotent?: boolean;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    if (!options.assignment?.trim()) {
      throw new Error("Review submission requires --assignment.");
    }
    if (!options.report) throw new Error("Review submission requires --report.");
    if (!options.result) throw new Error("Review submission requires explicit --result.");
    if (!["passed", "failed", "unavailable"].includes(options.result)) {
      throw new Error(`Invalid review result: ${options.result}.`);
    }
    const findingIds = options.findingIds?.map((id) => id.trim());
    if (options.noFindings === true && findingIds !== undefined) {
      throw new Error("--findings and --no-findings cannot be combined.");
    }
    if (
      findingIds !== undefined &&
      (findingIds.length === 0 ||
        findingIds.some((id) => !/^F-\d{4,}$/.test(id)) ||
        new Set(findingIds).size !== findingIds.length)
    ) {
      throw new Error("--findings must contain unique canonical finding IDs.");
    }
    if (options.noFindings !== true && findingIds === undefined) {
      throw new Error("Review submission requires either --findings or exclusive --no-findings.");
    }
    if (options.unavailable) {
      throw new Error("Use --result unavailable, not --unavailable, for review submissions.");
    }
    if (options.result === "passed" && options.details !== undefined) {
      throw new Error("--details is only valid for failed or unavailable review results.");
    }
    if (options.result !== "passed" && !options.details?.trim()) {
      throw new Error("--details is required for failed or unavailable reviews.");
    }

    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const ledger = this.#readLedger(feature);
      const issue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const progress = this.#requireProgress(ledger, options.issue);
      if (!["reviewing", "changes-requested"].includes(progress.execution) || !progress.owner) {
        throw new Error(`Issue ${options.issue} is not awaiting review submission.`);
      }
      if (progress.owner !== options.author.trim()) {
        throw new Error("Only the current controller may submit a review result.");
      }
      const assignment = progress.reviewAssignments?.find(
        (candidate) => candidate.id === options.assignment,
      );
      if (!assignment || assignment.role !== "review") {
        throw new Error(`No review assignment matches ID ${options.assignment}.`);
      }
      if (progress.execution === "changes-requested" && assignment.status !== "submitted") {
        throw new Error(`Issue ${options.issue} is awaiting a controller correction decision.`);
      }
      if (!progress.baseSha) throw new Error("Review assignment has no recorded Git baseline.");
      const identity = this.#contentIdentity(feature, issue, progress.baseSha, progress.checks);
      const checkBlockers = this.#reviewCheckBlockers(progress, identity);
      if (checkBlockers.length > 0) throw new Error(checkBlockers.join("\n"));
      const snapshotBlocker = this.#reviewSnapshotBlocker(feature, progress, assignment, identity);
      if (snapshotBlocker) throw new Error(snapshotBlocker);
      const reportPath = this.#submissionReportPath(feature, assignment, options.report);
      const reportSha256 = this.#readReportDigest(feature, reportPath);
      const registeredFromReport = (progress.findings ?? [])
        .filter((finding) =>
          finding.provenance.some(
            (source) =>
              source.report === assignment.report && source.snapshot === assignment.snapshot,
          ),
        )
        .map((finding) => finding.id);
      if (options.noFindings === true && registeredFromReport.length > 0) {
        throw new Error(
          `Review report has registered findings and cannot declare --no-findings: ${registeredFromReport.join(", ")}.`,
        );
      }
      if (findingIds !== undefined) {
        const missing = registeredFromReport.filter((id) => !findingIds.includes(id));
        const unknown = findingIds.filter((id) => !registeredFromReport.includes(id));
        if (missing.length > 0 || unknown.length > 0) {
          throw new Error(
            `--findings must exactly list canonical findings registered from this report and snapshot; missing=${missing.join(",") || "none"}; invalid provenance=${unknown.join(",") || "none"}.`,
          );
        }
      }

      if (assignment.status === "submitted") {
        if (
          assignment.result === options.result &&
          assignment.noFindings === (options.noFindings === true ? true : undefined) &&
          JSON.stringify(assignment.findingIds) === JSON.stringify(findingIds) &&
          assignment.submittedBy === options.author.trim() &&
          assignment.details === options.details?.trim()
        ) {
          return {
            issue: options.issue,
            execution: progress.execution,
            assignment,
            report: assignment.report,
            reportSha256,
            idempotent: true,
            ...identity,
          };
        }
        throw new Error("The review assignment already has a different submitted result.");
      }

      const confirmedIssue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const confirmedIdentity = this.#contentIdentity(
        feature,
        confirmedIssue,
        progress.baseSha,
        progress.checks,
      );
      const confirmedInventory = this.#changedPaths(progress.baseSha);
      const confirmedReportDigest = this.#readReportDigest(feature, reportPath);
      if (
        confirmedIdentity.snapshot !== identity.snapshot ||
        JSON.stringify(confirmedInventory) !== JSON.stringify(assignment.inventory) ||
        confirmedReportDigest !== reportSha256
      ) {
        throw new Error(
          "Review inputs changed while submitting; retry against the frozen assignment.",
        );
      }

      assignment.status = "submitted";
      assignment.result = options.result as ReviewResult;
      if (options.noFindings === true) assignment.noFindings = true;
      else delete assignment.noFindings;
      if (findingIds !== undefined) assignment.findingIds = findingIds;
      else delete assignment.findingIds;
      assignment.reportSha256 = reportSha256;
      assignment.submittedAt = new Date().toISOString();
      assignment.submittedBy = options.author.trim();
      if (options.details?.trim()) assignment.details = options.details.trim();
      const submittedFindings = (assignment.findingIds ?? [])
        .map((id) => progress.findings?.find((finding) => finding.id === id))
        .filter((finding): finding is ReviewFinding => finding !== undefined);
      if (
        assignment.result !== "passed" ||
        submittedFindings.some(
          (finding) =>
            finding.blocking && finding.status !== "fixed" && finding.status !== "dismissed",
        )
      ) {
        progress.execution = "changes-requested";
      }
      const afterIssue = matter.stringify(
        this.#appendAudit(
          issue.body,
          options.author,
          `Review report submitted for assignment ${assignment.id}: result=${assignment.result}${assignment.noFindings === true ? "; no-findings explicitly declared" : `; findings=${(assignment.findingIds ?? []).join(",")}`}; report=${assignment.report} (sha256 ${reportSha256}).`,
        ),
        this.#metadata(issue),
      );
      this.#writeWorkflowState(feature, issue, afterIssue, ledger);
      return {
        issue: options.issue,
        execution: progress.execution,
        assignment,
        report: assignment.report,
        reportSha256,
        ...identity,
      };
    } finally {
      release();
    }
  }

  accept(options: AcceptOptions): {
    issue: string;
    execution: "accepted";
    reviews: {
      agent: string;
      assignment: string;
      result: "passed";
      noFindings?: true;
      findingIds?: string[];
    }[];
    idempotent?: boolean;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const ledger = this.#readLedger(feature);
      const issue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const progress = this.#requireProgress(ledger, options.issue);
      if (
        progress.execution !== "reviewing" &&
        progress.execution !== "changes-requested" &&
        progress.execution !== "accepted"
      ) {
        throw new Error(`Issue ${options.issue} must be reviewing before it can be accepted.`);
      }
      if (!progress.owner || progress.owner !== options.author.trim()) {
        throw new Error("Only the current controller may accept this issue.");
      }
      const identity = this.#contentIdentity(feature, issue, progress.baseSha, progress.checks);
      const blockers = this.#acceptBlockers(feature, ledger, progress, identity);
      if (blockers.length > 0) {
        throw new Error(`Issue ${options.issue} cannot be accepted:\n${blockers.join("\n")}`);
      }
      const reviews = ledger.reviewPolicy.issue.map((agent) => {
        const assignment = progress.reviewAssignments!.find(
          (candidate) => candidate.agent === agent && candidate.scope === "initial",
        )!;
        return {
          agent,
          assignment: assignment.id,
          result: "passed" as const,
          ...(assignment.noFindings === true
            ? { noFindings: true as const }
            : { findingIds: assignment.findingIds }),
        };
      });
      if (progress.execution === "accepted") {
        return {
          issue: options.issue,
          execution: "accepted",
          reviews,
          idempotent: true,
          ...identity,
        };
      }

      const confirmedIssue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const confirmedIdentity = this.#contentIdentity(
        feature,
        confirmedIssue,
        progress.baseSha,
        progress.checks,
      );
      const confirmedBlockers = this.#acceptBlockers(feature, ledger, progress, confirmedIdentity);
      if (confirmedIdentity.snapshot !== identity.snapshot || confirmedBlockers.length > 0) {
        throw new Error(
          `Issue content changed while accepting; revalidate current review and check coverage:\n${confirmedBlockers.join("\n")}`,
        );
      }
      progress.execution = "accepted";
      const afterIssue = matter.stringify(
        this.#appendAudit(
          issue.body,
          options.author,
          `Issue accepted with current passing checks and complete initial review coverage: ${reviews.map((review) => `${review.agent} (${review.assignment})`).join(", ")}.`,
        ),
        this.#metadata(issue),
      );
      this.#writeWorkflowState(feature, issue, afterIssue, ledger);
      return {
        issue: options.issue,
        execution: "accepted",
        reviews,
        ...identity,
      };
    } finally {
      release();
    }
  }

  resume(options: ResumeOptions): {
    issue: string;
    gate: ExecutionState;
    nextAction: string;
    owner?: string;
    assignment?: ImplementationAssignment;
    reviewAssignments?: ReviewAssignment[];
    handoffRecorded?: boolean;
    blocker?: string;
    snapshot: string;
    codeSnapshot: string;
    requirementsSnapshot: string;
    headSha: string;
  } {
    validateIssueId(options.issue);
    validateAuthor(options.author);
    const feature = this.#resolveFeature(options.spec);
    const release = this.#acquireIssueLock(feature.workspace);
    try {
      this.#recoverWrites(feature.workspace);
      const ledger = this.#readLedger(feature);
      const issue = this.#requireIssue(this.#readIssues(feature.workspace), options.issue);
      const progress = this.#requireProgress(ledger, options.issue);
      let handoffRecorded = false;
      if (progress.owner && progress.owner !== options.author.trim()) {
        if (!options.confirmHandoff) {
          throw new Error(
            `Ownership handoff from ${progress.owner} to ${options.author.trim()} requires --confirm-handoff after the previous controller has stopped editing.`,
          );
        }
        const previousOwner = progress.owner;
        progress.owner = options.author.trim();
        if (progress.assignment) {
          progress.assignment.controller = options.author.trim();
          progress.assignment.handoffs.push({
            at: new Date().toISOString(),
            from: previousOwner,
            to: options.author.trim(),
            confirmedStopped: true,
          });
        }
        const afterIssue = matter.stringify(
          this.#appendAudit(
            issue.body,
            options.author,
            `Controller handoff from ${previousOwner} to ${options.author.trim()} confirmed after the previous controller stopped editing.`,
          ),
          this.#metadata(issue),
        );
        this.#writeWorkflowState(feature, issue, afterIssue, ledger);
        handoffRecorded = true;
      }
      const identity = this.#contentIdentity(
        feature,
        this.#requireIssue(this.#readIssues(feature.workspace), options.issue),
        progress.baseSha,
        progress.checks,
      );
      const reviewBlocker = (progress.reviewAssignments ?? [])
        .map((assignment) => this.#reviewAssignmentBlocker(feature, progress, assignment, identity))
        .find((reason) => reason !== undefined);
      const blocker =
        this.#resumeBlocker(feature, progress) ??
        reviewBlocker ??
        this.#checkBlockers(progress, identity)[0];
      return {
        issue: options.issue,
        gate: progress.execution,
        nextAction: this.#nextAction(progress, blocker),
        ...(progress.owner ? { owner: progress.owner } : {}),
        ...(progress.assignment ? { assignment: progress.assignment } : {}),
        ...(progress.reviewAssignments ? { reviewAssignments: progress.reviewAssignments } : {}),
        ...(handoffRecorded ? { handoffRecorded: true } : {}),
        ...(blocker ? { blocker } : {}),
        ...identity,
      };
    } finally {
      release();
    }
  }

  next(options: NextOptions) {
    const status = this.status(options);
    return {
      feature: status.feature,
      spec: status.spec,
      snapshots: status.snapshots,
      findings: status.findings,
      requirementsDecisions: status.requirementsDecisions,
      actions: status.actions,
      pendingAssignments: status.pendingAssignments,
      blockers: status.blockers,
    };
  }

  #hasCurrentCheckCoverage(
    feature: FeaturePaths,
    issue: IssueDocument,
    progress: IssueProgress,
  ): boolean {
    const identity = this.#contentIdentity(feature, issue, progress.baseSha, progress.checks);
    return this.#checkBlockers(progress, identity).length === 0;
  }

  #checkBlockers(progress: IssueProgress, identity: ContentIdentity): string[] {
    const checks = progress.checks;
    if (!checks) return [];
    return checks.required
      .filter((requirement) => !requirement.removedAt)
      .flatMap((requirement) => {
        const records = checks.records.filter((record) => record.command === requirement.command);
        const current = records.filter(
          (record) =>
            record.snapshot === identity.snapshot &&
            record.codeSnapshot === identity.codeSnapshot &&
            record.requirementsSnapshot === identity.requirementsSnapshot,
        );
        const latest = current.at(-1);
        if (!latest) {
          const state = records.length > 0 ? "stale" : "missing";
          return [`Required check ${requirement.command} is ${state} for the current content.`];
        }
        if (latest.result !== "passed") {
          const suffix = latest.details ? ` Details: ${latest.details}` : "";
          return [`Required check ${requirement.command} is ${latest.result}.${suffix}`];
        }
        return [];
      });
  }

  #findingBlockers(progress: IssueProgress, identity: ContentIdentity): string[] {
    return (progress.findings ?? [])
      .filter(
        (finding) =>
          finding.blocking &&
          finding.status !== "fixed" &&
          finding.status !== "dismissed" &&
          !(
            finding.status === "deferred" &&
            finding.requirementsDecision &&
            progress.requirementsDecisions?.some(
              (decision) =>
                decision.id === finding.requirementsDecision &&
                decision.finding === finding.id &&
                decision.status === "approved" &&
                decision.requirementsSnapshot === identity.requirementsSnapshot,
            ) &&
            (progress.reviewAssignments?.length ?? 0) > 0 &&
            progress.reviewAssignments!.every(
              (assignment) =>
                assignment.status === "submitted" &&
                assignment.result === "passed" &&
                assignment.snapshot === identity.snapshot &&
                assignment.requirementsSnapshot === identity.requirementsSnapshot,
            )
          ),
      )
      .map(
        (finding) =>
          `Finding ${finding.id} is unresolved and blocking acceptance (severity=${finding.severity}, status=${finding.status}).`,
      );
  }

  #reviewCheckBlockers(progress: IssueProgress, identity: ContentIdentity): string[] {
    const activeRequirements =
      progress.checks?.required.filter((requirement) => !requirement.removedAt) ?? [];
    if (activeRequirements.length === 0) {
      return ["Review requires at least one currently required passing check."];
    }
    return this.#checkBlockers(progress, identity);
  }

  #reviewAssignmentBlocker(
    feature: FeaturePaths,
    progress: IssueProgress,
    assignment: ReviewAssignment,
    identity: ContentIdentity,
  ): string | undefined {
    const snapshotBlocker = this.#reviewSnapshotBlocker(feature, progress, assignment, identity);
    if (snapshotBlocker) return snapshotBlocker;
    if (assignment.status === "pending") return undefined;
    if (assignment.result !== "passed") {
      return `Review assignment ${assignment.id} is ${assignment.result}.${assignment.details ? ` Details: ${assignment.details}` : ""}`;
    }
    if (assignment.noFindings !== true && (assignment.findingIds?.length ?? 0) === 0) {
      return `Review assignment ${assignment.id} has no explicit findings declaration.`;
    }
    return undefined;
  }

  #reviewSnapshotBlocker(
    feature: FeaturePaths,
    progress: IssueProgress,
    assignment: ReviewAssignment,
    identity: ContentIdentity,
  ): string | undefined {
    if (
      assignment.snapshot !== identity.snapshot ||
      assignment.codeSnapshot !== identity.codeSnapshot ||
      assignment.requirementsSnapshot !== identity.requirementsSnapshot
    ) {
      return `Review assignment ${assignment.id} is stale for the current issue snapshot.`;
    }
    if (!progress.baseSha) return "Review assignment has no recorded Git baseline.";
    let inventory: string[];
    try {
      inventory = this.#changedPaths(progress.baseSha);
    } catch (error) {
      return `Review inventory cannot be revalidated: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (JSON.stringify(inventory) !== JSON.stringify(assignment.inventory)) {
      return `Review assignment ${assignment.id} no longer matches the frozen Git inventory.`;
    }
    if (assignment.status === "pending") return undefined;
    try {
      const currentDigest = this.#readReportDigest(feature, assignment.report);
      if (currentDigest !== assignment.reportSha256) {
        return `The registered review report for assignment ${assignment.id} changed after submission.`;
      }
    } catch {
      return `The registered review report for assignment ${assignment.id} is missing or unavailable.`;
    }
    return undefined;
  }

  #acceptBlockers(
    feature: FeaturePaths,
    ledger: FeatureLedger,
    progress: IssueProgress,
    identity: ContentIdentity,
  ): string[] {
    const blockers = this.#reviewCheckBlockers(progress, identity);
    blockers.push(...this.#findingBlockers(progress, identity));
    for (const decision of progress.requirementsDecisions ?? []) {
      if (
        decision.status === "rejected" &&
        decision.requirementsSnapshot === identity.requirementsSnapshot
      ) {
        blockers.push(
          `Requirements decision ${decision.id} was rejected; acceptance requires an approved decision and fresh review.`,
        );
      }
    }
    const implementationBlocker = this.#implementationReportBlocker(feature, progress.assignment);
    if (implementationBlocker) blockers.push(implementationBlocker);

    const assignments = progress.reviewAssignments ?? [];
    for (const agent of ledger.reviewPolicy.issue) {
      const coverage = assignments.filter(
        (assignment) => assignment.agent === agent && assignment.scope === "initial",
      );
      if (coverage.length === 0) {
        blockers.push(`Required initial review coverage for '${agent}' is missing.`);
      } else if (coverage.length > 1) {
        blockers.push(`Required initial review coverage for '${agent}' is duplicated.`);
      }
    }
    for (const assignment of assignments) {
      if (!ledger.reviewPolicy.issue.includes(assignment.agent)) {
        blockers.push(
          `Review assignment ${assignment.id} is not part of the pinned review policy.`,
        );
        continue;
      }
      if (assignment.status === "pending") {
        blockers.push(`Review assignment ${assignment.id} is pending.`);
        continue;
      }
      const blocker = this.#reviewAssignmentBlocker(feature, progress, assignment, identity);
      if (blocker) blockers.push(blocker);
    }
    return [...new Set(blockers)];
  }

  #nextAction(progress: IssueProgress, blocker?: string): string {
    if (progress.execution === "unstarted") return "claim";
    if (progress.execution === "claimed") {
      return progress.owner && progress.baseSha ? "implement" : "resolve-claim-blocker";
    }
    if (progress.execution === "implementing") {
      if (!progress.assignment) return "resolve-assignment-blocker";
      if (progress.assignment.status === "submitted") {
        if (blocker?.startsWith("Required check ")) return "record-current-checks";
        return blocker ? "restore-implementation-report" : "review";
      }
      return "await-implementation-report";
    }
    if (progress.execution === "reviewing") {
      if (blocker?.startsWith("Finding ")) return "resolve-findings";
      if (blocker?.startsWith("Required check ")) return "record-current-checks";
      const reviews = progress.reviewAssignments ?? [];
      if (reviews.length > 0) {
        if (blocker?.startsWith("The registered review report")) return "restore-review-report";
        if (blocker) return "resolve-review-blocker";
        if (reviews.some((assignment) => assignment.status === "pending")) {
          return "await-review-report";
        }
        if (reviews.some((assignment) => assignment.result !== "passed")) {
          return "resolve-review-result";
        }
        return "accept";
      }
      return blocker ? "restore-implementation-report" : "review";
    }
    if (progress.execution === "changes-requested") {
      return blocker?.startsWith("Finding ")
        ? "adjudicate-findings"
        : "controller-correction-decision";
    }
    if (progress.execution === "accepted") return blocker ? "resolve-check-blocker" : "integrate";
    if (progress.execution === "integrated") return blocker ? "resolve-check-blocker" : "complete";
    return "resolve-blocker";
  }

  #resumeBlocker(feature: FeaturePaths, progress: IssueProgress): string | undefined {
    if (progress.execution === "claimed" && (!progress.owner || !progress.baseSha)) {
      return "Claim has no recorded owner or baseline; implementation is unavailable.";
    }
    if (progress.execution === "implementing" && !progress.assignment) {
      return "Implementation is marked in progress without a recorded assignment.";
    }
    if (
      progress.execution === "reviewing" ||
      (progress.execution === "implementing" && progress.assignment?.status === "submitted")
    ) {
      return this.#implementationReportBlocker(feature, progress.assignment);
    }
    return undefined;
  }

  #requireProgress(ledger: FeatureLedger, issue: string): IssueProgress {
    const progress = ledger.issues.find((item) => item.id === issue);
    if (!progress) throw new Error(`Issue ${issue} has no ledger execution record.`);
    return progress;
  }

  #implementationReportBlocker(
    feature: FeaturePaths,
    assignment: ImplementationAssignment | undefined,
  ): string | undefined {
    if (!assignment || assignment.status !== "submitted" || !assignment.reportSha256) {
      return "Review is blocked because no submitted implementation report is registered.";
    }
    try {
      const currentDigest = this.#readReportDigest(feature, assignment.report);
      if (currentDigest !== assignment.reportSha256) {
        return "The registered implementation report content changed after submission.";
      }
    } catch {
      return "The registered implementation report is missing or unavailable.";
    }
    return undefined;
  }

  #cleanGitBaseline(feature: FeaturePaths): string {
    const root = realpathSync(this.app.workspaceRoot);
    const changes = this.#gitChangeSummary(feature);
    if (changes) {
      throw new Error(
        `Cannot claim from a dirty checkout; commit or otherwise resolve staged, unstaged, and untracked changes first:\n${changes}`,
      );
    }
    const revision = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    if (revision.error) throw revision.error;
    if (revision.status !== 0 || !/^[0-9a-f]{40,64}\n?$/i.test(revision.stdout)) {
      throw new Error(
        `Unable to record the clean checkout's starting commit: ${revision.stderr.trim()}`,
      );
    }
    return revision.stdout.trim();
  }

  #contentIdentity(
    feature: FeaturePaths,
    issue: IssueDocument,
    baseSha = this.#headSha(),
    checks?: IssueChecks,
  ): ContentIdentity {
    const root = realpathSync(this.app.workspaceRoot);
    const headSha = this.#headSha();
    const paths = new Set(this.#changedPaths(baseSha));
    const code = createHash("sha256");
    code.update("spindle-code-snapshot-v2\0");
    const field = (tag: string, value: Buffer | string) => {
      const tagBytes = Buffer.from(tag);
      const valueBytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const tagLength = Buffer.alloc(4);
      tagLength.writeUInt32BE(tagBytes.length);
      const valueLength = Buffer.alloc(8);
      valueLength.writeBigUInt64BE(BigInt(valueBytes.length));
      code.update(tagLength);
      code.update(tagBytes);
      code.update(valueLength);
      code.update(valueBytes);
    };
    for (const path of [...paths].sort()) {
      field("record", "path");
      field("path", path);
      field(
        "index-stage",
        this.#gitBuffer(["ls-files", "--stage", "-z", "--", `:(literal)${path}`]),
      );
      const indexed = spawnSync("git", ["show", `:${path}`], {
        cwd: root,
        encoding: "buffer",
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      });
      if (indexed.error) throw indexed.error;
      field("index-state", indexed.status === 0 ? "present" : "absent");
      if (indexed.status === 0) field("index-content", indexed.stdout);
      const pathOnDisk = join(root, path);
      const entry = lstatIfPresent(pathOnDisk);
      if (!entry) {
        field("worktree-state", "deleted");
      } else {
        field("worktree-mode", String(entry.mode & 0o777));
        if (entry.isSymbolicLink()) {
          field("worktree-type", "symlink");
          field("worktree-target", readlinkSync(pathOnDisk));
        } else if (entry.isFile()) {
          field("worktree-type", "file");
          field("worktree-content", readFileSync(pathOnDisk));
        } else if (entry.isDirectory()) {
          throw new Error(
            `Cannot compute code identity for nested repository or worktree '${path}'; directory worktrees are unsupported.`,
          );
        } else {
          throw new Error(
            `Cannot compute code identity for unsupported non-file worktree path '${path}'.`,
          );
        }
      }
    }
    const codeSnapshot = code.digest("hex");
    const requirementParts = [
      readFileSync(feature.spec, "utf8"),
      this.#issueRequirements(issue.raw),
      checks?.required ?? [],
    ];
    const requirementsSnapshot = createHash("sha256")
      .update(JSON.stringify(requirementParts))
      .digest("hex");
    const snapshot = createHash("sha256")
      .update(JSON.stringify([codeSnapshot, requirementsSnapshot]))
      .digest("hex");
    return { snapshot, codeSnapshot, requirementsSnapshot, headSha };
  }

  #changedPaths(baseSha: string): string[] {
    const paths = new Set<string>();
    for (const args of [
      ["diff", "--name-only", "-z", baseSha, "--", "."],
      ["diff", "--cached", "--name-only", "-z", baseSha, "--", "."],
      ["ls-files", "--others", "--exclude-standard", "-z"],
    ]) {
      const output = this.#gitBuffer(args).toString("utf8");
      for (const path of output.split("\0")) {
        if (path && path !== ".scratch" && !path.startsWith(".scratch/")) paths.add(path);
      }
    }
    this.#assertStableSubmodules(baseSha, paths);
    return [...paths].sort();
  }

  #assertStableSubmodules(baseSha: string, changedPaths: Set<string>): void {
    const gitlinks = new Map<string, string>();
    for (const record of this.#gitBuffer(["ls-files", "--stage", "-z"])
      .toString("utf8")
      .split("\0")) {
      const [metadata, path] = record.split("\t", 2);
      if (!metadata || !path || path === ".scratch" || path.startsWith(".scratch/")) continue;
      const [mode, sha, stage] = metadata.split(" ");
      if (mode === "160000" && sha && stage === "0") gitlinks.set(path, sha);
    }

    const knownPaths = new Set(gitlinks.keys());
    for (const record of this.#gitBuffer(["ls-tree", "-r", "-z", baseSha])
      .toString("utf8")
      .split("\0")) {
      const [metadata, path] = record.split("\t", 2);
      if (
        metadata?.startsWith("160000 commit ") &&
        path &&
        path !== ".scratch" &&
        !path.startsWith(".scratch/")
      ) {
        knownPaths.add(path);
      }
    }

    for (const path of knownPaths) {
      const entry = lstatIfPresent(join(this.app.workspaceRoot, path));
      if (!entry) {
        throw new Error(
          `Cannot compute code identity for submodule '${path}'; its worktree is missing or uninitialized.`,
        );
      }
      if (!entry.isDirectory()) {
        throw new Error(
          `Cannot compute code identity for submodule '${path}'; its worktree state is unsupported.`,
        );
      }

      if (changedPaths.has(path)) {
        throw new Error(
          `Cannot compute code identity for changed submodule '${path}'; submodule changes are unsupported.`,
        );
      }

      if (!gitlinks.has(path)) continue;

      let revision: string;
      try {
        revision = this.#gitBuffer(["-C", path, "rev-parse", "--verify", "HEAD"])
          .toString("utf8")
          .trim();
      } catch {
        throw new Error(
          `Cannot compute code identity for submodule '${path}'; its worktree is missing or uninitialized.`,
        );
      }
      const status = this.#gitBuffer([
        "-C",
        path,
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--ignore-submodules=none",
      ]).toString("utf8");
      if (revision !== gitlinks.get(path) || status.length > 0) {
        throw new Error(
          `Cannot compute code identity for changed submodule '${path}'; submodule changes are unsupported.`,
        );
      }
    }
  }

  #issueRequirements(raw: string): string {
    const body = matter(raw).content;
    const sections = new Map<string, string>();
    const headings = [...body.matchAll(/^##[ \t]+(.+?)[ \t]*\r?$/gm)];
    for (let index = 0; index < headings.length; index++) {
      const heading = headings[index]!;
      const title = heading[1]!.trim().toLowerCase();
      const start = heading.index! + heading[0].length;
      const end = headings[index + 1]?.index ?? body.length;
      if (title === "requirements" || title === "acceptance criteria") {
        sections.set(title, body.slice(start, end).trim());
      }
      if (title === "comments") {
        const decisions = body
          .slice(start, end)
          .split(/\n[ \t]*\n/)
          .filter(
            (entry) =>
              !entry.startsWith("[SDD-SCOPE-RULING ") && /\brequirements? decision\b/i.test(entry),
          )
          .map((entry) => entry.trim());
        sections.set("requirements decisions", decisions.join("\n\n"));
      }
    }
    return JSON.stringify(
      [...sections.entries()].sort(([left], [right]) => left.localeCompare(right)),
    );
  }

  #headSha(): string {
    const revision = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: realpathSync(this.app.workspaceRoot),
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    if (revision.error) throw revision.error;
    if (revision.status !== 0 || !/^[0-9a-f]{40,64}\n?$/i.test(revision.stdout)) {
      throw new Error(`Unable to identify current Git revision: ${revision.stderr.trim()}`);
    }
    return revision.stdout.trim();
  }

  #gitBuffer(args: string[]): Buffer {
    const result = spawnSync("git", args, {
      cwd: realpathSync(this.app.workspaceRoot),
      encoding: "buffer",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`git ${args[0]} failed: ${result.stderr.toString("utf8").trim()}`);
    }
    return result.stdout;
  }

  #gitChangeSummary(feature: FeaturePaths): string {
    const root = realpathSync(this.app.workspaceRoot);
    const relativeLock = relative(root, join(feature.workspace, ".sdd-issues.lock"));
    const status = spawnSync(
      "git",
      [
        "--no-pager",
        "-c",
        "color.ui=false",
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        ".",
        `:(exclude)${relativeLock}`,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      },
    );
    if (status.error) throw status.error;
    if (status.status !== 0) {
      throw new Error(`git status failed while checking claim readiness: ${status.stderr.trim()}`);
    }
    return status.stdout.trim();
  }

  #writeWorkflowState(
    feature: FeaturePaths,
    issue: IssueDocument,
    issueAfter: string,
    ledger: FeatureLedger,
  ): void {
    this.#applyWrites(feature.workspace, [
      {
        path: relative(feature.workspace, issue.path),
        before: issue.raw,
        after: issueAfter,
      },
      {
        path: "sdd.json",
        before: readFileSync(feature.ledger, "utf8"),
        after: `${JSON.stringify(ledger, null, 2)}\n`,
      },
    ]);
  }

  #writeLedger(feature: FeaturePaths, ledger: FeatureLedger): void {
    this.#applyWrites(feature.workspace, [
      {
        path: "sdd.json",
        before: readFileSync(feature.ledger, "utf8"),
        after: `${JSON.stringify(ledger, null, 2)}\n`,
      },
    ]);
  }

  #assertReportPath(feature: FeaturePaths, path: string, mustExist: boolean): void {
    const reports = join(feature.workspace, "reports");
    const directory = lstatIfPresent(reports);
    if (!directory?.isDirectory() || directory.isSymbolicLink()) {
      throw new Error("Feature reports path must be a real directory.");
    }
    if (!isPathInside(reports, path) || !/^[^/]+\.md$/.test(path.slice(reports.length + 1))) {
      throw new Error("Implementation report must be a Markdown file inside feature reports/.");
    }
    const root = realpathSync(this.app.workspaceRoot);
    if (!isPathInside(root, path) || !isPathInside(root, realpathSync(reports))) {
      throw new Error("Implementation report must remain inside this checkout.");
    }
    const relativePath = relative(root, path);
    if (this.#isIgnored(root, relativePath)) {
      throw new Error(`Implementation report path is ignored: ${relativePath}`);
    }
    const entry = lstatIfPresent(path);
    if (mustExist && !entry)
      throw Object.assign(new Error("Report does not exist."), { code: "ENOENT" });
    if (entry && (!entry.isFile() || entry.isSymbolicLink())) {
      throw new Error(`Implementation report must be a regular file: ${path}.`);
    }
    if (entry && !isPathInside(reports, realpathSync(path))) {
      throw new Error("Implementation report must remain inside feature reports/.");
    }
  }

  #submissionReportPath(
    feature: FeaturePaths,
    assignment: Pick<ImplementationAssignment, "report"> | Pick<ReviewAssignment, "report">,
    supplied?: string,
  ): string {
    const path = supplied
      ? isAbsolute(supplied)
        ? resolve(supplied)
        : resolve(feature.workspace, supplied)
      : assignment.report;
    if (path !== assignment.report) {
      throw new Error(
        `Report target does not match the assigned destination ${assignment.report}.`,
      );
    }
    this.#assertReportPath(feature, path, false);
    return path;
  }

  #readReportDigest(feature: FeaturePaths, report: string): string {
    this.#assertReportPath(feature, report, true);
    return createHash("sha256").update(readFileSync(report)).digest("hex");
  }

  #assertReadyReadable(workspace: string): void {
    if (lstatIfPresent(join(workspace, ".sdd-write-recovery.json"))) {
      throw new Error("Pending issue recovery journal; run a mutating issue command to recover.");
    }
    if (lstatIfPresent(join(workspace, ".sdd-issues.lock"))) {
      throw new Error("Issue updates are in progress; retry ready after the lock is released.");
    }
  }

  #validateIssueCreateOptions(options: IssueCreateOptions): void {
    if (!options.title.trim()) throw new Error("Title must not be empty.");
    if (!options.reporter.trim()) throw new Error("Reporter must not be empty.");
    validateCategory(options.category);
    validateAuthor(options.author);
  }

  #resolveFeature(spec: string): FeaturePaths {
    const absoluteSpec = isAbsolute(spec) ? relative(this.app.workspaceRoot, spec) : spec;
    return this.status({ spec: absoluteSpec });
  }

  #readLedger(feature: FeaturePaths): FeatureLedger {
    return this.#validateLedger(
      JSON.parse(readFileSync(feature.ledger, "utf8")) as unknown,
      feature.feature,
    );
  }

  #readIssues(workspace: string): IssueDocument[] {
    const directory = join(workspace, "issues");
    const issues: IssueDocument[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.name.endsWith(".md")) continue;
      const id = entry.name.slice(0, -3);
      validateIssueId(id);
      const path = join(directory, entry.name);
      this.#assertIssuePath(workspace, path);
      const raw = readFileSync(path, "utf8");
      const parsed = matter(raw);
      const data = parsed.data;
      if (!isRecord(data) || data.id !== id)
        throw new Error(`Issue ${id} has invalid YAML front matter.`);
      if ("execution" in data)
        throw new Error(`Issue ${id} must not mirror ledger execution in YAML.`);
      if (typeof data.title !== "string" || !data.title.trim())
        throw new Error(`Issue ${id} title is invalid.`);
      if (typeof data.reporter !== "string" || !data.reporter.trim())
        throw new Error(`Issue ${id} reporter is invalid.`);
      const category = String(data.category);
      const status = String(data.status);
      validateCategory(category);
      validateTriageStatus(status);
      if (
        !Array.isArray(data.blocked_by) ||
        !data.blocked_by.every((blocked) => typeof blocked === "string")
      ) {
        throw new Error(`Issue ${id} blocked_by must be a list of issue IDs.`);
      }
      const blockedBy = data.blocked_by as string[];
      if (new Set(blockedBy).size !== blockedBy.length)
        throw new Error(`Issue ${id} has duplicate dependencies.`);
      for (const blocked of blockedBy) validateIssueId(blocked);
      issues.push({
        metadata: { ...data },
        id,
        title: data.title,
        reporter: data.reporter,
        category,
        status,
        blocked_by: [...blockedBy],
        body: parsed.content,
        path,
        raw,
      });
    }
    return issues;
  }

  #metadata(issue: IssueDocument): Record<string, unknown> {
    return {
      ...issue.metadata,
      id: issue.id,
      title: issue.title,
      reporter: issue.reporter,
      category: issue.category,
      status: issue.status,
      blocked_by: issue.blocked_by,
    };
  }

  #requireIssue(issues: IssueDocument[], id: string): IssueDocument {
    const issue = issues.find((item) => item.id === id);
    if (!issue) throw new Error(`Issue not found: ${id}.`);
    return issue;
  }

  #normalizeDependencies(values: string[]): string[] {
    const dependencies = values.flatMap((value) => value.split(",")).map((value) => value.trim());
    if (dependencies.some((value) => !value)) throw new Error("Dependency IDs must not be empty.");
    for (const dependency of dependencies) validateIssueId(dependency);
    if (new Set(dependencies).size !== dependencies.length) {
      throw new Error("Dependency IDs must not contain duplicates.");
    }
    return dependencies;
  }

  #validateDependencyGraph(issues: IssueDocument[]): void {
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

  #appendAudit(body: string, author: string, details: string): string {
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

  #serializeIssue(issue: IssueDocument, body: string): string {
    return matter.stringify(body, this.#metadata(issue));
  }

  #assertIssuePath(workspace: string, path: string): void {
    const issuesDirectory = join(workspace, "issues");
    const directoryEntry = lstatIfPresent(issuesDirectory);
    if (!directoryEntry?.isDirectory() || directoryEntry.isSymbolicLink()) {
      throw new Error("Feature issues path must be a real directory.");
    }
    if (
      !isPathInside(issuesDirectory, path) ||
      !/^I-\d{4,}\.md$/.test(path.slice(issuesDirectory.length + 1))
    ) {
      throw new Error("Issue path must be a numbered Markdown file inside issues/.");
    }
    const entry = lstatIfPresent(path);
    if (entry && !entry.isFile()) throw new Error(`Issue path must be a regular file: ${path}.`);
    if (entry && !isPathInside(issuesDirectory, realpathSync(path))) {
      throw new Error("Issue file must remain inside the feature issues directory.");
    }
    const root = realpathSync(this.app.workspaceRoot);
    const relativePath = relative(root, path);
    if (this.#isIgnored(root, relativePath))
      throw new Error(`Issue path is ignored: ${relativePath}`);
  }

  #acquireIssueLock(workspace: string): () => void {
    const lockPath = join(workspace, ".sdd-issues.lock");
    const root = realpathSync(this.app.workspaceRoot);
    const relativeLock = relative(root, lockPath);
    if (this.#isIgnored(root, relativeLock)) {
      throw new Error(`Issue lock path is ignored: ${relativeLock}`);
    }
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (true) {
      try {
        const descriptor = openSync(lockPath, "wx", 0o600);
        try {
          writeSync(descriptor, JSON.stringify({ pid: process.pid }));
        } catch (error) {
          closeSync(descriptor);
          unlinkSync(lockPath);
          throw error;
        }
        return () => {
          try {
            closeSync(descriptor);
          } finally {
            unlinkSync(lockPath);
          }
        };
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          error.code !== "EEXIST"
        )
          throw error;
        if (this.#staleLockReason(lockPath)) {
          const lockEntry = lstatIfPresent(lockPath);
          if (!lockEntry?.isFile() || lockEntry.isSymbolicLink()) {
            throw new Error(
              `Issue lock path is not a regular file and was preserved: ${lockPath}.`,
            );
          }
          unlinkSync(lockPath);
          continue;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `Timed out waiting for issue updates; inspect ${lockPath} before retrying.`,
          );
        }
        waitBriefly();
      }
    }
  }

  #recoverWrites(workspace: string): void {
    const journalPath = join(workspace, ".sdd-write-recovery.json");
    const entry = lstatIfPresent(journalPath);
    if (!entry) return;
    if (!entry.isFile() || entry.isSymbolicLink())
      throw new Error("Issue recovery journal is not a regular file.");
    const value = JSON.parse(readFileSync(journalPath, "utf8")) as unknown;
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.writes)) {
      throw new Error("Issue recovery journal has an unsupported format.");
    }
    const writes = value.writes as RecoveryWrite[];
    const targets = new Set<string>();
    const pending: { target: string; after: string }[] = [];
    for (const write of writes) {
      if (
        !isRecord(write) ||
        typeof write.path !== "string" ||
        !(write.before === null || typeof write.before === "string") ||
        typeof write.after !== "string" ||
        !(write.path === "sdd.json" || /^issues\/I-\d{4,}\.md$/.test(write.path))
      )
        throw new Error("Issue recovery journal contains an invalid write target.");
      if (targets.has(write.path))
        throw new Error("Issue recovery journal contains duplicate write targets.");
      targets.add(write.path);
      const target = join(workspace, write.path);
      const root = realpathSync(this.app.workspaceRoot);
      const relativeTarget = relative(root, target);
      if (this.#isIgnored(root, relativeTarget)) {
        throw new Error(`Issue write target is ignored: ${relativeTarget}`);
      }
      if (write.path !== "sdd.json") this.#assertIssuePath(workspace, target);
      else {
        const ledgerEntry = lstatIfPresent(target);
        if (!ledgerEntry?.isFile() || ledgerEntry.isSymbolicLink()) {
          throw new Error("Feature ledger must be a regular file during issue recovery.");
        }
      }
      const current = lstatIfPresent(target) ? readFileSync(target, "utf8") : null;
      if (current !== write.before && current !== write.after) {
        throw new Error(
          `Issue recovery found conflicting external content at ${write.path}; preserved all files.`,
        );
      }
      if (current !== write.after) pending.push({ target, after: write.after });
    }
    for (const write of pending) this.#atomicWrite(write.target, write.after);
    unlinkSync(journalPath);
  }

  #applyWrites(workspace: string, writes: RecoveryWrite[]): void {
    const journalPath = join(workspace, ".sdd-write-recovery.json");
    if (lstatIfPresent(journalPath)) {
      throw new Error("A pending issue write recovery journal must be resolved first.");
    }
    for (const write of writes) {
      if (!(write.path === "sdd.json" || /^issues\/I-\d{4,}\.md$/.test(write.path))) {
        throw new Error(`Unsafe issue write target: ${write.path}.`);
      }
      const root = realpathSync(this.app.workspaceRoot);
      const target = join(workspace, write.path);
      const relativeTarget = relative(root, target);
      if (this.#isIgnored(root, relativeTarget)) {
        throw new Error(`Issue write target is ignored: ${relativeTarget}`);
      }
    }
    const root = realpathSync(this.app.workspaceRoot);
    const relativeJournal = relative(root, journalPath);
    if (this.#isIgnored(root, relativeJournal)) {
      throw new Error(`Issue recovery path is ignored: ${relativeJournal}`);
    }
    this.#atomicWrite(journalPath, `${JSON.stringify({ version: 1, writes }, null, 2)}\n`);
    this.#recoverWrites(workspace);
  }

  #atomicWrite(path: string, contents: string): void {
    const temporary = `${path}.${randomUUID()}.tmp`;
    const existing = lstatIfPresent(path);
    const mode = existing ? existing.mode & 0o777 : 0o666 & ~process.umask();
    try {
      writeFileSync(temporary, contents, { flag: "wx", mode: mode | 0o200 });
      if ((mode | 0o200) !== mode) chmodSync(temporary, mode);
      renameSync(temporary, path);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
  }

  #statusFromPaths(
    root: string,
    specPath: string,
    relativeSpec: string,
    segments: string[],
  ): FeaturePaths & { state: FeatureLedger } {
    const scratch = join(root, ".scratch");
    const workspace = join(scratch, segments[1]!);
    const ledgerPath = join(workspace, "sdd.json");
    assertRealDirectory(scratch, ".scratch");
    assertRealDirectory(workspace, "Feature workspace");
    for (const directory of ["issues", "reports"]) {
      assertRealDirectory(join(workspace, directory), `Feature ${directory} directory`);
    }
    const specEntry = lstatIfPresent(specPath);
    if (!specEntry?.isFile()) throw new Error("Feature spec must be a regular file.");
    const ledgerEntry = lstatIfPresent(ledgerPath);
    if (!ledgerEntry?.isFile()) throw new Error("Feature ledger must be a regular file.");
    if (
      !isPathInside(root, realpathSync(specPath)) ||
      !isPathInside(root, realpathSync(ledgerPath))
    ) {
      throw new Error("Feature files must remain inside this checkout.");
    }
    for (const path of [relativeSpec, relative(root, ledgerPath)]) {
      if (this.#isIgnored(root, path)) throw new Error(`Feature path is ignored: ${path}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(ledgerPath, "utf8"));
    } catch (error) {
      throw new Error(
        `Feature ledger is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const state = this.#validateLedger(parsed, segments[1]!);
    const feature = segments[1]!;
    return {
      feature,
      workspace,
      spec: specPath,
      ledger: ledgerPath,
      state,
    };
  }

  #validateLedger(value: unknown, feature: string): FeatureLedger {
    if (!isRecord(value)) throw new Error("Feature ledger must contain a JSON object.");
    const id = FEATURE_DIRECTORY.exec(feature)?.[1];
    if (value.schemaVersion !== 1) {
      throw new Error(`Unsupported feature ledger schema version: ${String(value.schemaVersion)}.`);
    }
    if (typeof value.featureId !== "string" || value.featureId !== id) {
      throw new Error("Feature ledger ID does not match its workspace directory.");
    }
    if (typeof value.title !== "string" || !value.title.trim()) {
      throw new Error("Feature ledger title must be a non-empty string.");
    }
    if (typeof value.createdBy !== "string" || !value.createdBy.trim()) {
      throw new Error("Feature ledger author must be a non-empty string.");
    }
    if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) {
      throw new Error("Feature ledger creation time must be a valid timestamp.");
    }
    if (typeof value.retrospectiveRequired !== "boolean") {
      throw new Error("Feature ledger retrospective policy must be a boolean.");
    }
    if (!isRecord(value.reviewPolicy)) throw new Error("Feature review policy must be an object.");
    if (
      typeof value.reviewPolicy.version !== "number" ||
      !Number.isSafeInteger(value.reviewPolicy.version) ||
      value.reviewPolicy.version < 1
    ) {
      throw new Error("Feature review policy version must be a positive integer.");
    }
    for (const role of ["issue", "delivery"] as const) {
      const reviewers = value.reviewPolicy[role];
      if (
        !Array.isArray(reviewers) ||
        reviewers.length === 0 ||
        !reviewers.every((reviewer) => typeof reviewer === "string" && reviewer.trim())
      ) {
        throw new Error(`Feature ${role} review requirements must be a non-empty string list.`);
      }
    }
    if (
      !Array.isArray(value.issues) ||
      !value.issues.every(
        (issue) =>
          isRecord(issue) &&
          typeof issue.id === "string" &&
          /^I-\d{4,}$/.test(issue.id) &&
          typeof issue.execution === "string" &&
          EXECUTION_STATES.includes(issue.execution as ExecutionState) &&
          ((!Object.hasOwn(issue, "owner") && !Object.hasOwn(issue, "baseSha")) ||
            (typeof issue.owner === "string" &&
              !!issue.owner.trim() &&
              typeof issue.baseSha === "string" &&
              /^[0-9a-f]{40,64}$/i.test(issue.baseSha))) &&
          (!Object.hasOwn(issue, "checks") ||
            (isRecord(issue.checks) &&
              Array.isArray(issue.checks.required) &&
              issue.checks.required.every(isCheckRequirement) &&
              Array.isArray(issue.checks.records) &&
              issue.checks.records.every(isCheckRecord) &&
              (!Object.hasOwn(issue.checks, "invalidations") ||
                (Array.isArray(issue.checks.invalidations) &&
                  issue.checks.invalidations.every(isCheckGateInvalidation))))) &&
          (!Object.hasOwn(issue, "assignment") ||
            (isImplementationAssignment(issue.assignment) &&
              issue.assignment.report ===
                join(
                  this.app.workspaceRoot,
                  ".scratch",
                  feature,
                  "reports",
                  `${issue.id}-implementation.md`,
                ))) &&
          (!Object.hasOwn(issue, "reviewAssignments") ||
            (Array.isArray(issue.reviewAssignments) &&
              issue.reviewAssignments.every(
                (assignment) =>
                  isReviewAssignment(assignment) &&
                  blueprintCatalog.agents[assignment.agent]?.canReview === true &&
                  assignment.report ===
                    join(
                      this.app.workspaceRoot,
                      ".scratch",
                      feature,
                      "reports",
                      `${issue.id}-review-${assignment.id}.md`,
                    ),
              ))) &&
          (!Object.hasOwn(issue, "reviewHistory") ||
            (Array.isArray(issue.reviewHistory) &&
              issue.reviewHistory.every(
                (assignment) =>
                  isReviewAssignment(assignment) &&
                  blueprintCatalog.agents[assignment.agent]?.canReview === true &&
                  assignment.report ===
                    join(
                      this.app.workspaceRoot,
                      ".scratch",
                      feature,
                      "reports",
                      `${issue.id}-review-${assignment.id}.md`,
                    ),
              ))) &&
          (!Object.hasOwn(issue, "requirementsDecisions") ||
            (Array.isArray(issue.requirementsDecisions) &&
              issue.requirementsDecisions.every(isRequirementsDecision))) &&
          (!Object.hasOwn(issue, "findings") ||
            (Array.isArray(issue.findings) && issue.findings.every(isReviewFinding))),
      )
    ) {
      throw new Error(
        "Feature issue records must contain an issue ID and a valid execution state.",
      );
    }
    if (
      new Set(value.issues.map((issue) => (issue as IssueProgress).id)).size !== value.issues.length
    ) {
      throw new Error("Feature ledger issue IDs must be unique.");
    }
    for (const issue of value.issues as IssueProgress[]) {
      const findingIds = issue.findings?.map((finding) => finding.id) ?? [];
      if (new Set(findingIds).size !== findingIds.length) {
        throw new Error(`Finding IDs must be unique within issue ${issue.id}.`);
      }
      const decisionIds = issue.requirementsDecisions?.map((decision) => decision.id) ?? [];
      if (new Set(decisionIds).size !== decisionIds.length) {
        throw new Error(`Requirements decision IDs must be unique within issue ${issue.id}.`);
      }
      for (const finding of issue.findings ?? []) {
        if (
          finding.requirementsDecision &&
          !issue.requirementsDecisions?.some(
            (decision) =>
              decision.id === finding.requirementsDecision &&
              decision.finding === finding.id &&
              decision.status === "approved",
          )
        ) {
          throw new Error(`Finding ${finding.id} references an invalid requirements decision.`);
        }
      }
      for (const assignment of [
        ...(issue.reviewHistory ?? []),
        ...(issue.reviewAssignments ?? []),
      ]) {
        const reported = (issue.findings ?? []).filter((finding) =>
          finding.provenance.some(
            (source) =>
              source.report === assignment.report && source.snapshot === assignment.snapshot,
          ),
        );
        if (assignment.noFindings === true && reported.length > 0) {
          throw new Error(
            `Review assignment ${assignment.id} declares no findings despite registered provenance.`,
          );
        }
        for (const id of assignment.findingIds ?? []) {
          const finding = (issue.findings ?? []).find((candidate) => candidate.id === id);
          if (
            !finding ||
            !finding.provenance.some(
              (source) =>
                source.report === assignment.report && source.snapshot === assignment.snapshot,
            )
          ) {
            throw new Error(
              `Review assignment ${assignment.id} references finding ${id} without matching provenance.`,
            );
          }
        }
        if (
          assignment.status === "submitted" &&
          assignment.findingIds &&
          (reported.length !== assignment.findingIds.length ||
            reported.some((finding) => !assignment.findingIds!.includes(finding.id)))
        ) {
          throw new Error(
            `Review assignment ${assignment.id} does not list the complete canonical findings set.`,
          );
        }
      }
    }
    const reviewAssignmentIds = value.issues.flatMap((issue) =>
      isRecord(issue)
        ? [
            ...(Array.isArray(issue.reviewHistory) ? issue.reviewHistory : []),
            ...(Array.isArray(issue.reviewAssignments) ? issue.reviewAssignments : []),
          ].map((assignment) => (isRecord(assignment) ? assignment.id : undefined))
        : [],
    );
    if (
      reviewAssignmentIds.some((assignmentId) => typeof assignmentId !== "string") ||
      new Set(reviewAssignmentIds).size !== reviewAssignmentIds.length
    ) {
      throw new Error("Feature review assignment IDs must be unique.");
    }
    if (!isRecord(value.delivery)) throw new Error("Feature delivery progress must be an object.");
    if (
      typeof value.delivery.execution !== "string" ||
      !EXECUTION_STATES.includes(value.delivery.execution as ExecutionState)
    ) {
      throw new Error("Feature delivery execution state is invalid.");
    }
    if (
      !Array.isArray(value.delivery.history) ||
      !value.delivery.history.every(
        (entry) =>
          isRecord(entry) &&
          typeof entry.at === "string" &&
          Number.isFinite(Date.parse(entry.at)) &&
          typeof entry.author === "string" &&
          entry.author.trim() &&
          typeof entry.action === "string" &&
          entry.action.trim(),
      )
    ) {
      throw new Error(
        "Feature delivery history records must contain a valid timestamp, author, and action.",
      );
    }

    return value as unknown as FeatureLedger;
  }

  #nextFeatureId(scratch: string): string {
    let highest = 0n;
    for (const entry of readdirSync(scratch, { withFileTypes: true })) {
      if (!entry.isDirectory() || HISTORICAL_DATE_DIRECTORY.test(entry.name)) continue;
      const match = FEATURE_DIRECTORY.exec(entry.name);
      if (!match) continue;
      const id = BigInt(match[1]!);
      if (id > highest) highest = id;
    }
    return String(highest + 1n).padStart(4, "0");
  }

  #rejectAbandonedStaging(scratch: string): void {
    const abandoned = readdirSync(scratch, { withFileTypes: true })
      .filter((entry) => entry.name.startsWith(".sdd-create-"))
      .map((entry) => join(scratch, entry.name));
    if (abandoned.length > 0) {
      throw new Error(
        `Incomplete feature creation staging content was preserved at ${abandoned.join(", ")}. Inspect and remove it before retrying.`,
      );
    }
  }

  #acquireCreationLock(scratch: string): () => void {
    const lockPath = join(scratch, ".sdd-create.lock");
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (true) {
      try {
        const descriptor = openSync(lockPath, "wx", 0o600);
        try {
          writeSync(descriptor, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
        } catch (error) {
          closeSync(descriptor);
          unlinkSync(lockPath);
          throw error;
        }
        return () => {
          try {
            closeSync(descriptor);
          } finally {
            unlinkSync(lockPath);
          }
        };
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          error.code !== "EEXIST"
        ) {
          throw error;
        }
        const staleLock = this.#staleLockReason(lockPath);
        if (staleLock) {
          throw new Error(
            `Stale feature creation lock at ${lockPath}: ${staleLock}. Verify its owner has stopped, then remove the lock and any abandoned .sdd-create-* staging directory before retrying.`,
          );
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `Timed out waiting for another feature workspace creation; inspect ${lockPath} and remove it only after confirming its owner stopped.`,
          );
        }
        waitBriefly();
      }
    }
  }

  #staleLockReason(lockPath: string): string | undefined {
    try {
      const entry = lstatIfPresent(lockPath);
      if (!entry) return undefined;
      if (!entry.isFile()) return "the lock path is not a regular file";
      let owner: { pid?: unknown };
      try {
        owner = JSON.parse(readFileSync(lockPath, "utf8")) as { pid?: unknown };
      } catch {
        return Date.now() - entry.mtimeMs >= LOCK_TIMEOUT_MS
          ? "the lock contents are malformed and old"
          : undefined;
      }
      if (typeof owner.pid === "number" && Number.isSafeInteger(owner.pid) && owner.pid > 0) {
        try {
          process.kill(owner.pid, 0);
          return undefined;
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "EPERM"
          ) {
            return undefined;
          }
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code !== "ESRCH"
          ) {
            return undefined;
          }
          return "the recorded owner process is no longer running";
        }
      }
      return Date.now() - entry.mtimeMs >= LOCK_TIMEOUT_MS
        ? "the lock has no live process owner"
        : undefined;
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }
  }

  #isIgnored(root: string, relativePath: string): boolean {
    const result = spawnSync(
      "git",
      [
        "--no-pager",
        "-c",
        "color.ui=false",
        "check-ignore",
        "--quiet",
        "--no-index",
        "--",
        relativePath,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`git check-ignore failed: ${result.stderr.trim()}`);
    }
    return result.status === 0;
  }
}

function isPathInside(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return (
    relativePath === "" ||
    (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`))
  );
}
