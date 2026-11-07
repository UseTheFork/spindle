import { spawnSync } from "node:child_process";
import {
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
  unlinkSync,
  writeFileSync,
  writeSync,
  type Stats,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import type { Command } from "commander";

import { App, Service } from "../../app.js";
import { once } from "../shared-options.js";

const FEATURE_DIRECTORY = /^(\d{4,})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const HISTORICAL_DATE_DIRECTORY = /^\d{4}-\d{2}-\d{2}-/;
const LOCK_TIMEOUT_MS = 15_000;
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

interface IssueProgress {
  id: string;
  execution: ExecutionState;
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

function validateCreateOptions({ title, author }: CreateOptions): void {
  if (!title.trim()) throw new Error("Title must not be empty.");
  if (!author.trim()) throw new Error("Author must not be empty.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

    program
      .command("status")
      .description("Inspect the recorded state and policy of an existing feature.")
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

  status({ spec }: StatusOptions): FeaturePaths & { state: FeatureLedger } {
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
          EXECUTION_STATES.includes(issue.execution as ExecutionState),
      )
    ) {
      throw new Error(
        "Feature issue records must contain an issue ID and a valid execution state.",
      );
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
