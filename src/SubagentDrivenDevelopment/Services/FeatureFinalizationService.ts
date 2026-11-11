import { createHash, randomUUID } from "node:crypto";
import {
  accessSync,
  constants,
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitService } from "@/Git/Services/GitService";
import type {
  CheckRecord,
  CheckRequirement,
  ContentIdentity,
} from "@/SubagentDrivenDevelopment/Models/Evidence";
import type { FeatureLedger, FeaturePaths } from "@/SubagentDrivenDevelopment/Models/Workflow";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { validateAuthor } from "@/SubagentDrivenDevelopment/Policies/InputValidation";

interface Startup {
  version: 1;
  id: string;
  feature: string;
  phase: "created";
  originalWorkspace: string;
  originalBranch: string;
  originalRevision: string;
  featureWorkspace: string;
  featureBranch: string;
  featureRevision: string;
  records: { paths: string[]; digest: string };
  targetIdentity?: { device: number; inode: number };
}
interface Target {
  workspace: string;
  branch: string;
  allowedParent: string;
  revision: string;
  dev: number;
  ino: number;
  step?: "remove-intent" | "removed" | "delete-intent" | "deleted";
}
interface Journal {
  version: 1;
  id: string;
  startup: Startup;
  startupDigest: string;
  common: string;
  repository: { dev: number; ino: number };
  original: { dev: number; ino: number };
  author: string;
  approved: ContentIdentity;
  approvedLedger: FeatureLedger;
  ledgerBefore: string;
  ledgerAfter: string;
  mappings: { before: string; after: string; sha256?: string }[];
  files: { path: string; sha256: string }[];
  required: CheckRequirement[];
  records: CheckRecord[];
  finalDeclared: boolean;
  phase: "records" | "merging" | "validation" | "metadata" | "cleanup" | "complete";
  beforeCommit: string;
  recordTree?: string;
  featureCommit?: string;
  mergeCommit?: string;
  finalIdentity?: ContentIdentity;
  targets: Target[];
  retrospective?: { report: string; reportSha256: string };
  ticketStarts: { path: string; digest: string }[];
  metadataTree?: string;
  metadataCommit?: string;
}

export interface FeatureFinishOptions {
  spec: string;
  author: string;
  report?: string;
  confirmRecords?: boolean;
}

export class FeatureFinalizationService extends Service {
  public constructor(
    app: Application,
    private readonly git: GitService,
    private readonly ledgers: LedgerRepository,
  ) {
    super(app);
  }

  public finish(
    feature: FeaturePaths,
    options: FeatureFinishOptions,
    assertReady: (ledger?: FeatureLedger) => {
      ledger: FeatureLedger;
      identity: ContentIdentity;
      retrospective?: { report: string; reportSha256: string };
    },
  ): unknown {
    validateAuthor(options.author);
    return this.locked(feature.feature, (common, path) => {
      let journal = this.read<Journal>(path);
      if (!journal) {
        if (!options.confirmRecords)
          throw new Error("Inspect canonical records and pass --confirm-records.");
        const startupPath = join(common, "spindle-feature-start", `${feature.feature}.json`);
        this.real(startupPath, "file");
        const startupBytes = readFileSync(startupPath);
        const startup = JSON.parse(startupBytes.toString("utf8")) as Startup;
        this.validateStartup(startup, feature.feature);
        if (this.app.workspaceRoot !== startup.featureWorkspace)
          throw new Error("Begin finish from the recorded feature worktree.");
        this.workspace(
          startup.originalWorkspace,
          startup.originalBranch,
          startup.featureRevision,
          common,
        );
        this.clean(startup.originalWorkspace, false);
        this.noOperation(startup.originalWorkspace);
        this.noHooks(startup.originalWorkspace);
        this.workspace(startup.featureWorkspace, startup.featureBranch, undefined, common);
        const startupIdentity = lstatSync(startup.featureWorkspace);
        if (
          !startup.targetIdentity ||
          startupIdentity.dev !== startup.targetIdentity.device ||
          startupIdentity.ino !== startup.targetIdentity.inode
        )
          throw new Error("Startup feature path identity changed.");
        this.noOperation(startup.featureWorkspace);
        this.noHooks(startup.featureWorkspace);
        this.recordsOnly(startup.featureWorkspace, feature.feature);
        const approval = assertReady();
        const required =
          approval.ledger.delivery.checks?.required.filter((item) => !item.removedAt) ?? [];
        if (
          !required.length ||
          new Set(required.map((item) => item.command)).size !== required.length
        ) {
          throw new Error("Declare a nonempty unique final delivery check list before finishing.");
        }
        const head = this.head(startup.featureWorkspace);
        this.ancestor(startup.originalWorkspace, startup.featureRevision, head);
        const ticketStarts: Journal["ticketStarts"] = [];
        const ownership = [
          { workspace: startup.featureWorkspace, branch: startup.featureBranch },
          ...approval.ledger.tickets.map((ticket) => {
            if (!ticket.worktree)
              throw new Error(`Ticket ${ticket.id} lacks recorded cleanup ownership.`);
            if (ticket.worktree.branch !== `tickets/${feature.feature}/${ticket.id}`)
              throw new Error(
                "Ticket cleanup branch does not match its exact feature/ticket owner.",
              );
            if (this.head(ticket.worktree.workspace) !== ticket.integration?.commitSha) {
              throw new Error(
                "Ticket branch moved from its recorded integrated commit; preserve it.",
              );
            }
            const path = join(
              common,
              "spindle-ticket-start",
              `${feature.feature}-${ticket.id}.json`,
            );
            this.real(path, "file");
            const bytes = readFileSync(path);
            const start = JSON.parse(bytes.toString("utf8")) as {
              version: number;
              id: string;
              feature: string;
              ticket: string;
              owner: string;
              featureWorkspace: string;
              workspace: string;
              branch: string;
              baseSha: string;
              directory?: { device: number; inode: number };
            };
            const stat = lstatSync(ticket.worktree.workspace);
            if (
              start.version !== 2 ||
              !start.id ||
              start.feature !== feature.feature ||
              start.ticket !== ticket.id ||
              start.owner !== ticket.owner ||
              start.featureWorkspace !== startup.featureWorkspace ||
              start.workspace !== ticket.worktree.workspace ||
              start.branch !== ticket.worktree.branch ||
              !start.directory ||
              start.directory.device !== stat.dev ||
              start.directory.inode !== stat.ino
            )
              throw new Error("Ticket startup ownership/path provenance failed verification.");
            if (start.baseSha !== ticket.worktree.baseSha) {
              const history = ticket.baselineHistory;
              if (
                !history?.length ||
                history[0]!.from !== start.baseSha ||
                history.at(-1)!.to !== ticket.worktree.baseSha ||
                ticket.baseSha !== ticket.worktree.baseSha
              ) {
                throw new Error(
                  "Ticket baseline moved without recorded startup-to-current provenance.",
                );
              }
              this.ancestor(startup.originalWorkspace, start.baseSha, ticket.worktree.baseSha);
            }
            ticketStarts.push({ path, digest: this.digest(bytes) });
            return ticket.worktree;
          }),
        ];
        const targets = ownership.map((item): Target => {
          this.location(item.workspace, startup, common);
          this.workspace(item.workspace, item.branch, undefined, common);
          const revision = this.head(item.workspace);
          this.ancestor(startup.originalWorkspace, revision, head);
          const stat = lstatSync(item.workspace);
          return {
            workspace: item.workspace,
            branch: item.branch,
            allowedParent: dirname(item.workspace),
            revision,
            dev: stat.dev,
            ino: stat.ino,
          };
        });
        if (
          new Set(targets.map((item) => item.workspace)).size !== targets.length ||
          new Set(targets.map((item) => item.branch)).size !== targets.length
        )
          throw new Error("Duplicate cleanup ownership.");
        this.inventory(startup, targets);
        const ledgerBefore = readFileSync(feature.ledger, "utf8");
        const relocated = this.relocate(approval.ledger, startup, targets);
        let retrospective: Journal["retrospective"];
        if (approval.retrospective) {
          const source = approval.retrospective.report;
          this.real(source, "file");
          if (
            !this.inside(
              join(startup.featureWorkspace, `.scratch/${feature.feature}/reports`),
              source,
            ) ||
            this.digest(readFileSync(source)) !== approval.retrospective.reportSha256
          )
            throw new Error("Invalid retrospective relocation.");
          const destination = join(
            startup.originalWorkspace,
            relative(startup.featureWorkspace, source),
          );
          relocated.mappings.push({
            before: source,
            after: destination,
            sha256: approval.retrospective.reportSha256,
          });
          retrospective = {
            report: destination,
            reportSha256: approval.retrospective.reportSha256,
          };
        }
        const repository = lstatSync(common);
        const original = lstatSync(startup.originalWorkspace);
        journal = {
          version: 1,
          id: randomUUID(),
          startup,
          common,
          startupDigest: this.digest(startupBytes),
          repository: { dev: repository.dev, ino: repository.ino },
          original: { dev: original.dev, ino: original.ino },
          author: options.author.trim(),
          approved: approval.identity,
          approvedLedger: approval.ledger,
          required: [],
          records: [],
          finalDeclared: false,
          ledgerBefore,
          ledgerAfter: `${JSON.stringify(relocated.ledger, null, 2)}\n`,
          mappings: relocated.mappings,
          files: [],
          targets,
          phase: "records",
          beforeCommit: head,
          ...(retrospective ? { retrospective } : {}),
          ticketStarts,
        };
        journal.files = this.recordFiles(startup.featureWorkspace, feature.feature).map((file) => ({
          path: file,
          sha256: this.digest(readFileSync(join(startup.featureWorkspace, file))),
        }));
        this.persist(path, journal);
      }
      this.verifyJournal(journal, common, feature.feature);
      if (journal.author !== options.author.trim())
        throw new Error("Only the recorded controller may finish this feature.");
      const state = journal.startup;
      if (journal.phase === "records") {
        this.workspace(
          state.originalWorkspace,
          state.originalBranch,
          state.featureRevision,
          common,
        );
        this.clean(state.originalWorkspace, false);
        this.noOperation(state.originalWorkspace);
        this.targetIdentity(journal.targets[0]!);
        this.workspace(state.featureWorkspace, state.featureBranch, undefined, common);
        this.noOperation(state.featureWorkspace);
        this.ready(journal, assertReady);
        this.recordsOnly(state.featureWorkspace, feature.feature);
        this.verifyFiles(journal, state.featureWorkspace);
        const head = this.head(state.featureWorkspace);
        if (head !== journal.beforeCommit) {
          if (!journal.recordTree)
            throw new Error("Feature branch moved outside journalled commit.");
          this.commitShape(
            state.featureWorkspace,
            head,
            [journal.beforeCommit],
            journal.recordTree,
          );
        } else {
          if (!journal.recordTree) {
            this.run(state.featureWorkspace, [
              "add",
              "-A",
              "--",
              `:(literal).scratch/${feature.feature}`,
            ]);
            journal.recordTree = this.run(state.featureWorkspace, ["write-tree"]);
            this.persist(path, journal);
          }
          this.ready(journal, assertReady);
          this.workspace(state.featureWorkspace, state.featureBranch, journal.beforeCommit, common);
          this.verifyFiles(journal, state.featureWorkspace);
          if (
            this.run(state.featureWorkspace, ["write-tree"]) !== journal.recordTree ||
            this.run(state.featureWorkspace, ["diff", "--name-only", "-z"])
          )
            throw new Error("Journalled index or records changed.");
          if (this.tree(state.featureWorkspace, head) !== journal.recordTree) {
            this.run(state.featureWorkspace, [
              "commit",
              "-m",
              `spindle: finalize ${feature.feature} records`,
            ]);
          }
        }
        journal.featureCommit = this.head(state.featureWorkspace);
        if (journal.featureCommit !== journal.beforeCommit) {
          this.commitShape(
            state.featureWorkspace,
            journal.featureCommit,
            [journal.beforeCommit],
            journal.recordTree!,
          );
          const paths = this.run(state.featureWorkspace, [
            "diff",
            "--name-only",
            "--no-renames",
            "-z",
            journal.beforeCommit,
            journal.featureCommit,
          ])
            .split("\0")
            .filter(Boolean);
          if (paths.some((file) => !this.canonical(file, feature.feature)))
            throw new Error("Record commit contains unrelated paths.");
        }
        this.clean(state.featureWorkspace);
        journal.targets[0]!.revision = journal.featureCommit;
        journal.phase = "merging";
        this.persist(path, journal);
      }
      if (journal.phase === "merging") {
        this.targetIdentity(journal.targets[0]!);
        this.workspace(state.featureWorkspace, state.featureBranch, journal.featureCommit, common);
        this.clean(state.featureWorkspace);
        this.verifyFiles(journal, state.featureWorkspace);
        this.workspace(state.originalWorkspace, state.originalBranch, undefined, common);
        this.ancestor(state.originalWorkspace, state.featureRevision, journal.featureCommit!);
        if (this.head(state.originalWorkspace) === state.featureRevision) {
          this.ready(journal, assertReady);
          const mergeHead = this.gitPath(state.originalWorkspace, "MERGE_HEAD");
          if (this.exists(mergeHead)) {
            this.real(mergeHead, "file");
            if (readFileSync(mergeHead, "utf8").trim() !== journal.featureCommit)
              throw new Error("Preserve unrelated in-progress merge.");
            this.noOperation(state.originalWorkspace, true);
          } else {
            this.clean(state.originalWorkspace, false);
            this.noOperation(state.originalWorkspace);
            this.assertNoIgnoredCollisions(state.originalWorkspace, journal.featureCommit!);
            this.run(state.originalWorkspace, [
              "merge",
              "--no-ff",
              "--no-commit",
              "--no-edit",
              "--no-autostash",
              "--no-overwrite-ignore",
              journal.featureCommit!,
            ]);
          }
          this.mergeIndex(state.originalWorkspace, journal.featureCommit!);
          this.workspace(
            state.originalWorkspace,
            state.originalBranch,
            state.featureRevision,
            common,
          );
          this.run(state.originalWorkspace, ["commit", "-m", `spindle: merge ${feature.feature}`]);
        }
        journal.mergeCommit = this.head(state.originalWorkspace);
        this.commitShape(
          state.originalWorkspace,
          journal.mergeCommit,
          [state.featureRevision, journal.featureCommit!],
          this.tree(state.originalWorkspace, journal.featureCommit!),
        );
        this.clean(state.originalWorkspace, false);
        this.noOperation(state.originalWorkspace);
        this.verifyFiles(journal, state.originalWorkspace);
        journal.finalIdentity = {
          ...journal.approved,
          headSha: journal.mergeCommit,
          snapshot: this.digest(
            JSON.stringify([
              journal.id,
              common,
              journal.mergeCommit,
              this.tree(state.originalWorkspace, journal.mergeCommit),
            ]),
          ),
        };
        journal.phase = "validation";
        this.persist(path, journal);
      }
      if (journal.phase !== "metadata") this.finalCheckout(journal);
      if (journal.phase === "validation" && !this.passing(journal))
        return this.pending(journal, path);
      if (journal.phase === "validation" || journal.phase === "metadata")
        this.metadata(journal, path);
      this.cleanup(journal, path);
      return {
        scope: "delivery",
        finished: true,
        feature: state.feature,
        mergeCommit: journal.mergeCommit,
        originalWorkspace: state.originalWorkspace,
        spec: join(state.originalWorkspace, `.scratch/${state.feature}/spec.md`),
        cleanup: "complete",
        checkedCommit: journal.mergeCommit,
        metadataCommit: journal.metadataCommit,
        metadataCommitChecked: false,
        journal: path,
        ...(journal.retrospective ? { retrospective: journal.retrospective } : {}),
      };
    });
  }

  public status(feature: string): unknown {
    return this.locked(feature, (common, path) => {
      const journal = this.read<Journal>(path);
      if (!journal) throw new Error("Feature has no finalization journal.");
      this.verifyJournal(journal, common, feature);
      if (journal.mergeCommit && journal.phase !== "metadata") this.finalCheckout(journal);
      return journal.phase === "complete"
        ? {
            feature,
            finished: true,
            mergeCommit: journal.mergeCommit,
            metadataCommit: journal.metadataCommit,
            checkedCommit: journal.mergeCommit,
            metadataCommitChecked: false,
            cleanup: "complete",
            journal: path,
          }
        : this.pending(journal, path);
    });
  }

  public hasStarted(feature: string): boolean {
    if (!/^\d{4,}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature))
      throw new Error("Invalid feature identifier.");
    const common = this.run(this.app.workspaceRoot, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]);
    this.real(common, "directory");
    const path = join(common, "spindle-feature-finalization", `${feature}.json`);
    if (!this.exists(path)) return false;
    this.real(path, "file");
    return true;
  }

  // The merged ledger may still contain feature-worktree paths during recovery.
  public recordedFeature(spec: string): FeaturePaths | undefined {
    const absolute = isAbsolute(spec) ? resolve(spec) : resolve(this.app.workspaceRoot, spec);
    const path = relative(this.app.workspaceRoot, absolute);
    const match = /^\.scratch\/(\d{4,}-[a-z0-9]+(?:-[a-z0-9]+)*)\/spec\.md$/.exec(path);
    if (!match || !this.hasStarted(match[1]!)) return undefined;
    this.real(absolute, "file");
    const workspace = dirname(absolute);
    this.real(join(workspace, "sdd.json"), "file");
    return { feature: match[1]!, workspace, spec: absolute, ledger: join(workspace, "sdd.json") };
  }

  public record(options: {
    feature: string;
    merge: string;
    snapshot: string;
    command: string;
    result: string;
    author: string;
    details?: string;
  }): unknown {
    validateAuthor(options.author);
    return this.locked(options.feature, (common, path) => {
      const journal = this.read<Journal>(path);
      if (!journal) throw new Error("No feature merge to validate.");
      this.verifyJournal(journal, common, options.feature);
      if (journal.phase !== "validation")
        throw new Error("Final-check records are only accepted during final validation.");
      if (!journal.finalDeclared)
        throw new Error(
          "Declare the complete final check list with checks require --scope final first.",
        );
      this.finalCheckout(journal);
      if (
        options.author.trim() !== journal.author ||
        options.merge !== journal.mergeCommit ||
        options.snapshot !== journal.finalIdentity?.snapshot ||
        !journal.required.some((item) => item.command === options.command)
      ) {
        throw new Error(
          "Final check controller, declared command, snapshot or exact merge identity does not match.",
        );
      }

      if (
        !["passed", "failed", "unavailable"].includes(options.result) ||
        (options.result !== "passed" && !options.details?.trim())
      )
        throw new Error("Invalid result or missing failure/unavailability details.");
      const record: CheckRecord = {
        ...journal.finalIdentity!,
        command: options.command,
        result: options.result as CheckRecord["result"],
        author: options.author.trim(),
        recordedAt: new Date().toISOString(),
        ...(options.details ? { details: options.details.trim() } : {}),
      };
      journal.records.push(record);
      this.persist(path, journal);
      return { record, ...this.pending(journal, path), checksPassing: this.passing(journal) };
    });
  }

  public declare(options: { spec: string; command: string[]; author: string }): unknown {
    validateAuthor(options.author);
    const feature = this.recordedFeature(options.spec);
    if (!feature) throw new Error("Final checks require a recorded feature merge.");
    return this.locked(feature.feature, (common, path) => {
      const journal = this.read<Journal>(path);
      if (!journal) throw new Error("No finalization journal.");
      this.verifyJournal(journal, common, feature.feature);
      if (journal.phase !== "validation")
        throw new Error("Final checks may only be declared after the feature merge.");
      this.finalCheckout(journal);
      const commands = options.command.map((command) => command.trim());
      if (
        options.author.trim() !== journal.author ||
        !commands.length ||
        commands.some((command) => !command) ||
        new Set(commands).size !== commands.length
      )
        throw new Error(
          "A nonempty unique complete command list from the recorded controller is required.",
        );
      if (journal.finalDeclared) {
        if (
          JSON.stringify(commands) !==
          JSON.stringify(journal.required.map((requirement) => requirement.command))
        ) {
          throw new Error("The final declared check list is frozen.");
        }
      } else {
        journal.required = commands.map((command) => ({
          command,
          addedAt: new Date().toISOString(),
          addedBy: journal.author,
        }));
        journal.finalDeclared = true;
        this.persist(path, journal);
      }
      return this.pending(journal, path);
    });
  }

  private ready(
    journal: Journal,
    gate: (ledger?: FeatureLedger) => {
      ledger: FeatureLedger;
      identity: ContentIdentity;
      retrospective?: { report: string; reportSha256: string };
    },
  ): void {
    const result = gate(structuredClone(journal.approvedLedger));
    if (
      result.identity.snapshot !== journal.approved.snapshot ||
      result.identity.codeSnapshot !== journal.approved.codeSnapshot ||
      result.identity.requirementsSnapshot !== journal.approved.requirementsSnapshot
    ) {
      throw new Error("Aggregate approval became stale during finalization.");
    }
    if (
      result.retrospective?.reportSha256 !== journal.retrospective?.reportSha256 ||
      (result.retrospective &&
        !journal.mappings.some(
          (mapping) =>
            mapping.before === result.retrospective!.report &&
            mapping.after === journal.retrospective?.report,
        ))
    ) {
      throw new Error("Retrospective evidence changed during finalization.");
    }
  }
  private relocate(
    input: FeatureLedger,
    startup: Startup,
    targets: Target[],
  ): {
    ledger: FeatureLedger;
    mappings: Journal["mappings"];
  } {
    const ledger = structuredClone(input);
    const mappings: Journal["mappings"] = [];
    const sourceRecords = join(startup.featureWorkspace, `.scratch/${startup.feature}`);
    const destinationRecords = join(startup.originalWorkspace, `.scratch/${startup.feature}`);
    // Historical worktree locations remain in the journal after cleanup.
    for (const ticket of ledger.tickets) delete ticket.worktree;
    const visit = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const object = value as Record<string, unknown>;
      for (const [key, item] of Object.entries(object)) {
        if (
          key === "workspace" &&
          typeof item === "string" &&
          targets.some((target) => target.workspace === item)
        ) {
          mappings.push({ before: item, after: "journal:execution-location" });
          delete object[key];
          delete object.branch;
        } else if (
          typeof item === "string" &&
          targets.some((target) => this.inside(target.workspace, item))
        ) {
          if (
            !isAbsolute(item) ||
            !this.inside(join(sourceRecords, "reports"), item) ||
            !/^[^/]+\.md$/.test(relative(join(sourceRecords, "reports"), item))
          ) {
            throw new Error(`Cannot safely relocate recorded path: ${item}.`);
          }
          this.real(item, "file");
          const digest = this.digest(readFileSync(item));
          if (
            key === "report" &&
            typeof object.reportSha256 === "string" &&
            object.reportSha256 !== digest
          ) {
            throw new Error("Report digest changed before relocation.");
          }
          const destination = join(destinationRecords, relative(sourceRecords, item));
          mappings.push({ before: item, after: destination, sha256: digest });
          object[key] = destination;
        } else {
          if (
            typeof item === "string" &&
            targets.some((target) => item.includes(target.workspace))
          ) {
            throw new Error(
              "Embedded workflow path cannot be silently rewritten; resolve it before finishing.",
            );
          }
          visit(item);
        }
      }
    };
    visit(ledger);
    return { ledger, mappings };
  }

  private passing(journal: Journal): boolean {
    return (
      journal.finalDeclared &&
      journal.required.length > 0 &&
      journal.required.every((requirement) => {
        const record = journal.records
          .filter((item) => item.command === requirement.command)
          .at(-1);
        return (
          record?.result === "passed" &&
          record.headSha === journal.mergeCommit &&
          record.snapshot === journal.finalIdentity?.snapshot
        );
      })
    );
  }
  private pending(journal: Journal, path: string) {
    return {
      scope: "delivery",
      feature: journal.startup.feature,
      phase: journal.phase,
      finalValidation: "pending",
      cleanup: "retained",
      mergeCommit: journal.mergeCommit,
      originalWorkspace: journal.startup.originalWorkspace,
      ...journal.finalIdentity,
      originalSpec: join(
        journal.startup.originalWorkspace,
        `.scratch/${journal.startup.feature}/spec.md`,
      ),
      required: journal.required,
      records: journal.records,
      journal: path,
    };
  }
  private finalCheckout(journal: Journal): void {
    const state = journal.startup;
    this.workspace(
      state.originalWorkspace,
      state.originalBranch,
      journal.metadataCommit ?? journal.mergeCommit,
      journal.common,
    );
    this.clean(state.originalWorkspace, false);
    this.noOperation(state.originalWorkspace);
    this.commitShape(
      state.originalWorkspace,
      journal.mergeCommit!,
      [state.featureRevision, journal.featureCommit!],
      this.tree(state.originalWorkspace, journal.featureCommit!),
    );
    if (journal.metadataCommit) this.metadataShape(journal, journal.metadataCommit);
    this.verifyFiles(journal, state.originalWorkspace);
    for (const mapping of journal.mappings) {
      if (!mapping.sha256) continue;
      this.real(mapping.after, "file");
      if (this.digest(readFileSync(mapping.after)) !== mapping.sha256)
        throw new Error("Relocated report verification failed.");
    }
  }
  private metadata(journal: Journal, path: string): void {
    if (!this.passing(journal))
      throw new Error("Declared final-merge checks must pass before metadata relocation.");
    const state = journal.startup;
    const root = state.originalWorkspace;
    if (this.app.workspaceRoot !== root)
      throw new Error(
        "Complete metadata relocation and cleanup from the recorded original checkout.",
      );
    this.noHooks(root);
    this.noOperation(root);
    this.recordsOnly(root, state.feature, false);
    this.preflight(journal);
    if (journal.phase === "validation") {
      const ledger = JSON.parse(journal.ledgerAfter) as FeatureLedger;
      const at = new Date().toISOString();
      ledger.delivery.status = "complete";
      ledger.delivery.execution = "complete";
      ledger.delivery.finished = { at, author: journal.author, ...journal.retrospective };
      ledger.delivery.history.push({
        at,
        author: journal.author,
        action: `feature-final-validation-passed:${journal.mergeCommit};journal:${journal.id}`,
      });
      journal.ledgerAfter = `${JSON.stringify(ledger, null, 2)}\n`;
    }
    this.ledgers.validateLedger(JSON.parse(journal.ledgerAfter), state.feature);
    const ledgerPath = `.scratch/${state.feature}/sdd.json`;
    const absoluteLedger = join(root, ledgerPath);
    if (journal.phase === "validation") {
      this.finalCheckout(journal);
      journal.phase = "metadata";
      this.persist(path, journal);
    }
    this.workspace(root, state.originalBranch, undefined, journal.common);
    const head = this.head(root);
    if (head !== journal.mergeCommit) {
      if (!journal.metadataTree)
        throw new Error("Original branch moved outside the journalled metadata commit.");
      this.metadataShape(journal, head);
    } else {
      const present = readFileSync(absoluteLedger, "utf8");
      if (present !== journal.ledgerBefore && present !== journal.ledgerAfter) {
        throw new Error("Original ledger changed during relocation; preserve it.");
      }
      for (const entry of this.statusBytes(root, false).split("\0").filter(Boolean)) {
        if (
          entry.length < 4 ||
          entry[2] !== " " ||
          /[RCU!]/.test(entry.slice(0, 2)) ||
          entry.slice(3) !== ledgerPath
        )
          throw new Error("Preserve user work during metadata recovery.");
      }
      for (const file of journal.files) {
        if (file.path === ledgerPath) continue;
        this.real(join(root, file.path), "file");
        if (this.digest(readFileSync(join(root, file.path))) !== file.sha256)
          throw new Error("Records changed during metadata recovery.");
      }
      if (present === journal.ledgerBefore) this.atomicBytes(absoluteLedger, journal.ledgerAfter);
      if (!journal.metadataTree) {
        this.run(root, ["add", "--", `:(literal)${ledgerPath}`]);
        journal.metadataTree = this.run(root, ["write-tree"]);
        this.persist(path, journal);
      }
      this.workspace(root, state.originalBranch, journal.mergeCommit, journal.common);
      if (
        this.run(root, ["write-tree"]) !== journal.metadataTree ||
        readFileSync(absoluteLedger, "utf8") !== journal.ledgerAfter ||
        this.run(root, ["diff", "--name-only", "-z"])
      )
        throw new Error("Metadata index/ledger changed; preserve it.");
      const staged = this.run(root, ["diff", "--cached", "--name-only", "--no-renames", "-z"])
        .split("\0")
        .filter(Boolean);
      if (JSON.stringify(staged) !== JSON.stringify([ledgerPath]))
        throw new Error("Only the canonical ledger may enter the metadata commit.");
      this.run(root, ["commit", "-m", `spindle: relocate ${state.feature} workflow provenance`]);
    }
    journal.metadataCommit = this.head(root);
    this.metadataShape(journal, journal.metadataCommit);
    this.clean(root, false);
    this.ledgers.readLedger({
      feature: state.feature,
      workspace: dirname(absoluteLedger),
      ledger: absoluteLedger,
      spec: join(dirname(absoluteLedger), "spec.md"),
    });
    this.persist(path, journal);
  }

  private metadataShape(journal: Journal, commit: string): void {
    const root = journal.startup.originalWorkspace;
    this.commitShape(root, commit, [journal.mergeCommit!], journal.metadataTree!);
    const changed = this.run(root, [
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      journal.mergeCommit!,
      commit,
    ])
      .split("\0")
      .filter(Boolean);
    if (
      JSON.stringify(changed) !== JSON.stringify([`.scratch/${journal.startup.feature}/sdd.json`])
    ) {
      throw new Error(
        "Metadata follow-up changed code or non-ledger records; it is not the checked merge.",
      );
    }
    const actual = this.run(root, [
      "show",
      `${commit}:.scratch/${journal.startup.feature}/sdd.json`,
    ]);
    if (actual !== journal.ledgerAfter.trim())
      throw new Error("Metadata commit differs from the validated relocation plan.");
  }

  private cleanup(journal: Journal, path: string): void {
    if (!this.passing(journal))
      throw new Error("Exact merge-bound declared checks have not all passed.");
    this.preflight(journal);
    if (journal.phase === "metadata") {
      journal.phase = "cleanup";
      this.persist(path, journal);
    }
    for (const target of journal.targets) {
      this.finalCheckout(journal);
      this.preflight(journal);
      if (!target.step) {
        target.step = "remove-intent";
        this.persist(path, journal);
      }
      if (target.step === "remove-intent") {
        if (this.exists(target.workspace))
          this.run(journal.startup.originalWorkspace, [
            "worktree",
            "remove",
            "--",
            target.workspace,
          ]);
        target.step = "removed";
        this.persist(path, journal);
      }
      if (target.step === "removed") {
        target.step = "delete-intent";
        this.persist(path, journal);
      }
      if (target.step === "delete-intent") {
        this.preflight(journal);
        if (this.branch(journal.startup.originalWorkspace, target.branch)) {
          this.run(journal.startup.originalWorkspace, [
            "update-ref",
            "-d",
            `refs/heads/${target.branch}`,
            target.revision,
          ]);
        }
        target.step = "deleted";
        this.persist(path, journal);
      }
    }
    this.preflight(journal);
    journal.phase = "complete";
    this.persist(path, journal);
  }
  private preflight(journal: Journal): void {
    const state = journal.startup;
    this.inventory(state, journal.targets);
    this.noHooks(state.originalWorkspace);
    const registrations = this.registrations(state.originalWorkspace);
    for (const target of journal.targets) {
      this.real(target.allowedParent, "directory");
      const registration = registrations.filter((item) => item.workspace === target.workspace);
      const present = this.exists(target.workspace);
      if (target.step && target.step !== "remove-intent" && (present || registration.length))
        throw new Error("Removed worktree was substituted or re-registered.");
      if (!present || !registration.length) {
        if (!target.step || present || registration.length)
          throw new Error("Worktree disappeared outside recorded cleanup.");
      } else {
        this.location(target.workspace, state, journal.common);
        this.targetIdentity(target);
        this.workspace(target.workspace, target.branch, target.revision, journal.common);
        this.clean(target.workspace);
        this.noOperation(target.workspace);
        this.noHooks(target.workspace);
      }
      if (
        registrations.some(
          (item) =>
            item.branch === `refs/heads/${target.branch}` && item.workspace !== target.workspace,
        )
      )
        throw new Error("Cleanup branch acquired another worktree owner.");
      const revision = this.branch(state.originalWorkspace, target.branch);
      if (revision) {
        if (target.step === "deleted" || revision !== target.revision)
          throw new Error("Cleanup branch moved or reappeared.");
        this.ancestor(state.originalWorkspace, revision, journal.mergeCommit!);
      } else if (!target.step || !["delete-intent", "deleted"].includes(target.step))
        throw new Error("Branch disappeared outside recorded cleanup.");
    }
  }

  private inventory(state: Startup, targets: Target[]): void {
    const owned = (branch: string) =>
      branch === state.featureBranch || branch.startsWith(`tickets/${state.feature}/`);
    const branches = this.run(state.originalWorkspace, [
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads/",
    ])
      .split("\n")
      .filter(Boolean);
    if (
      branches.some(
        (branch) => owned(branch) && !targets.some((target) => target.branch === branch),
      ) ||
      this.registrations(state.originalWorkspace).some(
        (item) =>
          owned(item.branch.replace(/^refs\/heads\//, "")) &&
          !targets.some(
            (target) =>
              target.workspace === item.workspace && `refs/heads/${target.branch}` === item.branch,
          ),
      )
    ) {
      throw new Error(
        "Unrecorded feature/ticket worktree or branch; cleanup inventory is incomplete.",
      );
    }
  }
  private recordFiles(root: string, feature: string): string[] {
    const prefix = `:(literal).scratch/${feature}`;
    return [
      ...new Set(
        [
          ...this.run(root, ["ls-files", "-z", "--", prefix]).split("\0"),
          ...this.run(root, [
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            prefix,
          ]).split("\0"),
        ].filter((file) => file && this.exists(join(root, file))),
      ),
    ].sort();
  }
  private verifyFiles(journal: Journal, root: string): void {
    const files = this.recordFiles(root, journal.startup.feature);
    if (JSON.stringify(files) !== JSON.stringify(journal.files.map((file) => file.path)))
      throw new Error("Canonical record inventory changed.");
    for (const file of journal.files) {
      this.real(join(root, file.path), "file");
      const expected =
        journal.metadataCommit &&
        root === journal.startup.originalWorkspace &&
        file.path.endsWith("/sdd.json")
          ? this.digest(journal.ledgerAfter)
          : file.sha256;
      if (this.digest(readFileSync(join(root, file.path))) !== expected)
        throw new Error("Canonical records changed after approval.");
    }
  }
  private canonical(file: string, feature: string): boolean {
    const prefix = `.scratch/${feature}/`;
    return (
      file.startsWith(prefix) &&
      /^(?:spec\.md|design\.md|sdd\.json|tickets\/T-\d{4,}\.md|reports\/[^/]+\.md)$/.test(
        file.slice(prefix.length),
      )
    );
  }
  private recordsOnly(root: string, feature: string, rejectIgnored = true): void {
    for (const entry of this.statusBytes(root, rejectIgnored).split("\0").filter(Boolean)) {
      if (
        entry.length < 4 ||
        entry[2] !== " " ||
        /[RCU!]/.test(entry.slice(0, 2)) ||
        !this.canonical(entry.slice(3), feature)
      )
        throw new Error(
          "Preserve unrelated, ignored, renamed or conflicted files; only canonical records may be dirty.",
        );
      if (this.exists(join(root, entry.slice(3)))) this.real(join(root, entry.slice(3)), "file");
    }
    this.real(join(root, `.scratch/${feature}/sdd.json`), "file");
    this.real(join(root, `.scratch/${feature}/spec.md`), "file");
    const files = this.run(root, ["ls-files", "-z"]).split("\0").filter(Boolean);
    if (files.length) {
      const attributes = this.run(root, [
        "check-attr",
        "-z",
        "filter",
        "merge",
        "--",
        ...files,
      ]).split("\0");
      for (let index = 0; index + 2 < attributes.length; index += 3) {
        const attribute = attributes[index + 1]!;
        const value = attributes[index + 2]!;
        if (
          (attribute === "filter" && value !== "unspecified" && value !== "unset") ||
          (attribute === "merge" &&
            !["unspecified", "unset", "set", "text", "binary", "union"].includes(value))
        ) {
          throw new Error(
            "Configured record/code filters or custom merge drivers require manual handling.",
          );
        }
      }
    }
  }
  private validateStartup(state: Startup, feature: string): void {
    if (
      state.version !== 1 ||
      state.phase !== "created" ||
      state.feature !== feature ||
      !state.id ||
      state.featureBranch !== `features/${feature}` ||
      !/^[0-9a-f]{40,64}$/.test(state.featureRevision) ||
      !/^[0-9a-f]{40,64}$/.test(state.originalRevision) ||
      !state.originalBranch ||
      state.originalBranch === state.featureBranch ||
      !state.records ||
      !Array.isArray(state.records.paths) ||
      !/^[0-9a-f]{64}$/.test(state.records.digest)
    )
      throw new Error("Incomplete or invalid startup provenance.");
  }
  private verifyJournal(journal: Journal, common: string, feature: string): void {
    if (journal.version !== 1 || journal.common !== common || !journal.id)
      throw new Error("Invalid finalization journal.");
    this.validateStartup(journal.startup, feature);
    if (
      ![journal.startup.originalWorkspace, journal.startup.featureWorkspace].includes(
        this.app.workspaceRoot,
      )
    )
      throw new Error("Finalization must run from a recorded feature/original checkout.");
    const stat = lstatSync(common);
    this.real(journal.startup.originalWorkspace, "directory");
    const original = lstatSync(journal.startup.originalWorkspace);
    if (
      stat.dev !== journal.repository.dev ||
      stat.ino !== journal.repository.ino ||
      original.dev !== journal.original.dev ||
      original.ino !== journal.original.ino
    )
      throw new Error("Repository/original checkout identity changed.");
    const startup = join(common, "spindle-feature-start", `${feature}.json`);
    this.real(startup, "file");
    if (this.digest(readFileSync(startup)) !== journal.startupDigest)
      throw new Error("Startup provenance changed.");
    for (const ticket of journal.ticketStarts) {
      this.real(ticket.path, "file");
      if (this.digest(readFileSync(ticket.path)) !== ticket.digest)
        throw new Error("Ticket startup ownership provenance changed.");
    }
  }
  private targetIdentity(target: Target): void {
    this.real(target.workspace, "directory");
    const stat = lstatSync(target.workspace);
    if (stat.dev !== target.dev || stat.ino !== target.ino)
      throw new Error("Worktree path substitution.");
  }
  private location(path: string, state: Startup, common: string): void {
    this.real(path, "directory");
    if (
      this.inside(state.originalWorkspace, path) ||
      this.inside(path, state.originalWorkspace) ||
      this.inside(common, path) ||
      this.inside(path, common)
    )
      throw new Error("Worktree path is outside safe allowed locations.");
  }
  private workspace(
    root: string,
    branch: string,
    revision: string | undefined,
    common: string,
  ): void {
    this.real(root, "directory");
    const marker = join(root, ".git");
    this.real(marker, lstatSync(marker).isDirectory() ? "directory" : "file");
    const admin = this.run(root, ["rev-parse", "--absolute-git-dir"]);
    this.real(admin, "directory");
    if (admin !== common) {
      const backlink = join(admin, "gitdir");
      this.real(backlink, "file");
      if (
        readFileSync(backlink, "utf8").trim() !== marker ||
        readFileSync(marker, "utf8").trim() !== `gitdir: ${admin}`
      )
        throw new Error("Git worktree administration substitution.");
    }
    if (
      this.run(root, ["rev-parse", "--show-toplevel"]) !== root ||
      realpathSync(this.run(root, ["rev-parse", "--path-format=absolute", "--git-common-dir"])) !==
        common ||
      this.run(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]) !== branch ||
      (revision && this.head(root) !== revision)
    )
      throw new Error("Original/worktree attached branch, HEAD or repository changed.");
    const registrations = this.registrations(root).filter((item) => item.workspace === root);
    if (
      registrations.length !== 1 ||
      registrations[0]!.branch !== `refs/heads/${branch}` ||
      registrations[0]!.head !== this.head(root) ||
      registrations[0]!.unsafe
    )
      throw new Error("Exact worktree registration verification failed.");
  }
  private registrations(root: string) {
    return this.run(root, ["worktree", "list", "--porcelain", "-z"])
      .split("\0\0")
      .filter(Boolean)
      .map((block) => {
        const fields = block.split("\0");
        const get = (key: string) =>
          fields.find((item) => item.startsWith(`${key} `))?.slice(key.length + 1) ?? "";
        return {
          workspace: get("worktree"),
          branch: get("branch"),
          head: get("HEAD"),
          unsafe: fields.some((item) => /^(?:locked|prunable)(?: |$)/.test(item)),
        };
      });
  }
  private assertNoIgnoredCollisions(root: string, featureCommit: string): void {
    const ignored = this.run(root, [
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "-z",
    ])
      .split("\0")
      .filter(Boolean)
      .map((path) => path.replace(/\/$/, ""));
    const incoming = this.run(root, ["ls-tree", "-r", "--name-only", "-z", featureCommit])
      .split("\0")
      .filter(Boolean);
    const incomingPaths = new Set(incoming);
    const sortedIncoming = [...incoming].sort();
    const collisions = ignored.filter((path) => {
      const components = path.split("/");
      for (let count = 1; count <= components.length; count++) {
        if (incomingPaths.has(components.slice(0, count).join("/"))) return true;
      }
      const prefix = `${path}/`;
      let low = 0;
      let high = sortedIncoming.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (sortedIncoming[middle]! < prefix) low = middle + 1;
        else high = middle;
      }
      return sortedIncoming[low]?.startsWith(prefix) ?? false;
    });
    // ls-files omits empty ignored directories. Preserve those too when the
    // incoming tree would replace the directory itself with a tracked file.
    if (!collisions.length) {
      for (const target of incoming) {
        const absolute = join(root, target);
        if (!this.exists(absolute) || !lstatSync(absolute).isDirectory()) continue;
        const result = this.git.run(["check-ignore", "--quiet", "--", target], {
          cwd: root,
          encoding: "utf8",
        });
        if (result.error) throw result.error;
        if (result.status === 0) collisions.push(target);
        else if (result.status !== 1)
          throw new Error("Cannot verify ignored directory collision safety.");
      }
    }
    if (collisions.length) {
      throw new Error(
        `Ignored original paths would be overwritten by merge; preserve and relocate them manually: ${collisions.join(", ")}.`,
      );
    }
  }

  private mergeIndex(root: string, featureCommit: string): void {
    this.assertNoIgnoredCollisions(root, featureCommit);
    if (
      this.run(root, ["ls-files", "--unmerged", "-z"]) ||
      this.run(root, ["diff", "--name-only", "-z"]) ||
      this.run(root, ["ls-files", "--others", "--exclude-standard", "-z"]) ||
      this.run(root, ["write-tree"]) !== this.tree(root, featureCommit)
    )
      throw new Error(
        "Preserve conflicts/user merge edits; index differs from the recorded feature tree.",
      );
  }
  private commitShape(root: string, commit: string, parents: string[], tree: string): void {
    if (
      JSON.stringify(this.run(root, ["rev-list", "--parents", "-n", "1", commit]).split(" ")) !==
        JSON.stringify([commit, ...parents]) ||
      this.tree(root, commit) !== tree
    )
      throw new Error("Exact merge/record commit ancestry or tree verification failed.");
  }
  private branch(root: string, name: string): string | undefined {
    this.run(root, ["check-ref-format", `refs/heads/${name}`]);
    const result = this.git.run(["show-ref", "--verify", "--hash", `refs/heads/${name}`], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status === 0) return result.stdout.trim();
    // show-ref --verify returns 128 for a missing ref; use quiet for exact absence.
    const absent = this.git.run(["show-ref", "--verify", "--quiet", `refs/heads/${name}`], {
      cwd: root,
      encoding: "utf8",
    });
    if (absent.error) throw absent.error;
    if (absent.status !== 1) throw new Error("Unable to verify branch absence.");
    return undefined;
  }
  private noOperation(root: string, allowMerge = false): void {
    for (const name of [
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
      "REBASE_HEAD",
      "rebase-merge",
      "rebase-apply",
      "sequencer",
    ]) {
      if (!(allowMerge && name === "MERGE_HEAD") && this.exists(this.gitPath(root, name)))
        throw new Error(`Preserve existing Git operation ${name}.`);
    }
  }
  private noHooks(root: string): void {
    for (const hook of [
      "pre-commit",
      "prepare-commit-msg",
      "commit-msg",
      "post-commit",
      "pre-merge-commit",
      "post-merge",
      "post-checkout",
      "reference-transaction",
    ]) {
      const path = this.gitPath(root, `hooks/${hook}`);
      try {
        accessSync(path, constants.X_OK);
      } catch (error) {
        if (["ENOENT", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) continue;
        throw error;
      }
      throw new Error(`Active Git hook requires manual handling: ${path}.`);
    }
  }
  private statusBytes(root: string, includeIgnored = true): string {
    return this.run(root, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      includeIgnored ? "--ignored=matching" : "--ignored=no",
      "--ignore-submodules=none",
    ]);
  }
  private clean(root: string, rejectIgnored = true): void {
    if (this.statusBytes(root, rejectIgnored))
      throw new Error(
        `Preserve dirty checkout${rejectIgnored ? " (including ignored files)" : ""}: ${root}.`,
      );
  }
  private head(root: string): string {
    return this.run(root, ["rev-parse", "--verify", "HEAD"]);
  }
  private tree(root: string, commit: string): string {
    return this.run(root, ["rev-parse", "--verify", `${commit}^{tree}`]);
  }
  private ancestor(root: string, before: string, after: string): void {
    this.run(root, ["merge-base", "--is-ancestor", before, after]);
  }
  private gitPath(root: string, name: string): string {
    return resolve(root, this.run(root, ["rev-parse", "--git-path", name]));
  }
  private digest(value: string | Buffer): string {
    return createHash("sha256").update(value).digest("hex");
  }
  private inside(parent: string, child: string): boolean {
    if (!isAbsolute(child)) return false;
    const path = relative(parent, child);
    return !path || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
  }
  private exists(path: string): boolean {
    try {
      lstatSync(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  private real(path: string, kind: "file" | "directory"): void {
    if (!isAbsolute(path) || resolve(path) !== path)
      throw new Error("Paths must be normalized absolute paths.");
    for (let cursor = path; ; cursor = dirname(cursor)) {
      if (lstatSync(cursor).isSymbolicLink()) throw new Error("Symlink path substitution.");
      if (dirname(cursor) === cursor) break;
    }
    const stat = lstatSync(path);
    if (realpathSync(path) !== path || (kind === "file" ? !stat.isFile() : !stat.isDirectory()))
      throw new Error(`Expected real ${kind}: ${path}.`);
  }
  private read<T>(path: string): T | undefined {
    if (!this.exists(path)) return undefined;
    this.real(path, "file");
    return JSON.parse(readFileSync(path, "utf8")) as T;
  }
  private atomicBytes(path: string, bytes: string): void {
    this.real(dirname(path), "directory");
    if (this.exists(path)) this.real(path, "file");
    const temporary = `${path}.${randomUUID()}.tmp`;
    const descriptor = openSync(
      temporary,
      "wx",
      this.exists(path) ? lstatSync(path).mode & 0o777 : 0o600,
    );
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, path);
    const directory = openSync(dirname(path), "r");
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }
  private persist(path: string, value: Journal): void {
    this.atomicBytes(path, `${JSON.stringify(value, null, 2)}\n`);
  }
  private locked<T>(feature: string, action: (common: string, path: string) => T): T {
    if (!/^\d{4,}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature))
      throw new Error("Invalid feature identifier.");
    for (const name of [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_COMMON_DIR",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_NAMESPACE",
    ]) {
      if (process.env[name]) throw new Error(`Unset ${name} before finalization.`);
    }
    this.real(this.app.workspaceRoot, "directory");
    const common = this.run(this.app.workspaceRoot, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]);
    this.real(common, "directory");
    const directory = join(common, "spindle-feature-finalization");
    if (!this.exists(directory)) mkdirSync(directory, { mode: 0o700 });
    this.real(directory, "directory");
    const lock = join(directory, `${feature}.lock`);
    if (this.exists(lock)) {
      const owner = this.read<{ pid: number; host: string }>(lock);
      throw new Error(
        `Finalization lock exists; verify stopped owner ${owner?.pid} on ${owner?.host} and remove only ${lock} before resuming.`,
      );
    }
    const descriptor = openSync(lock, "wx", 0o600);
    try {
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, host: hostname() }));
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    const identity = lstatSync(lock);
    try {
      return action(common, join(directory, `${feature}.json`));
    } finally {
      if (this.exists(lock)) {
        const current = lstatSync(lock);
        if (
          !current.isSymbolicLink() &&
          identity.dev === current.dev &&
          identity.ino === current.ino
        )
          unlinkSync(lock);
      }
    }
  }
  private run(root: string, args: string[]): string {
    if (
      ["add", "commit", "merge", "worktree", "update-ref"].includes(args[0]!) &&
      !(args[0] === "worktree" && args[1] === "list")
    )
      this.noHooks(root);
    const result = this.git.run(
      [
        "-c",
        "merge.autoStash=false",
        "-c",
        "rerere.enabled=false",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "submodule.recurse=false",
        ...args,
      ],
      { cwd: root, encoding: "utf8" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(
        `git ${args[0]} failed; preserve journal and worktrees: ${result.stderr.trim()}`,
      );
    return result.stdout.includes("\0") ? result.stdout : result.stdout.trim();
  }
}
