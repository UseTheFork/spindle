import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Application } from "@/Foundation/Application";
import { Service } from "@/Foundation/Service";
import { GitEvidence } from "@/SubagentDrivenDevelopment/Evidence/GitEvidence";
import type {
  TicketChecks,
  CheckRecord,
  CommitIdentity,
} from "@/SubagentDrivenDevelopment/Models/Evidence";
import type {
  ChecksRequireOptions,
  ChecksRecordOptions,
} from "@/SubagentDrivenDevelopment/Models/Options";
import type {
  FeatureLedger,
  FeaturePaths,
  TicketProgress,
} from "@/SubagentDrivenDevelopment/Models/Workflow";
import { isSafeCoveragePath } from "@/SubagentDrivenDevelopment/Persistence/CheckSchema";
import { LedgerRepository } from "@/SubagentDrivenDevelopment/Persistence/LedgerRepository";
import { TicketRepository } from "@/SubagentDrivenDevelopment/Persistence/TicketRepository";
import { WorkspaceTransaction } from "@/SubagentDrivenDevelopment/Persistence/WorkspaceTransaction";
import {
  validateAuthor,
  validateTicketId,
} from "@/SubagentDrivenDevelopment/Policies/InputValidation";
import { ReadinessPolicy } from "@/SubagentDrivenDevelopment/Policies/ReadinessPolicy";
import { WorkflowPolicy } from "@/SubagentDrivenDevelopment/Policies/WorkflowPolicy";
import { FeatureInspectionService } from "@/SubagentDrivenDevelopment/Services/FeatureInspectionService";
import { Records } from "@/Support/Records";

type RequireOptions = Omit<ChecksRequireOptions, "command"> & { command: string | string[] };

export class ChecksService extends Service {
  public constructor(
    app: Application,
    private readonly gitEvidence: GitEvidence,
    private readonly ticketRepository: TicketRepository,
    private readonly ledgerRepository: LedgerRepository,
    private readonly workspaceTransaction: WorkspaceTransaction,
    private readonly workflowPolicy: WorkflowPolicy,
    private readonly featureInspectionService: FeatureInspectionService,
  ) {
    super(app);
  }

  public checksRequire(options: RequireOptions): {
    ticket?: string;
    scope?: "delivery" | "post-merge";
    checks: TicketChecks;
    idempotent?: boolean;
    closed?: boolean;
    closureBlocked?: string[];
    retry?: string;
    headSha: string;
  } {
    if (options.rebaseBaseline && options.scope !== undefined)
      throw new Error("--rebase-baseline requires ticket review scope.");
    if (options.rebaseBaseline && (options.remove || options.details !== undefined))
      throw new Error("--rebase-baseline cannot change check requirements.");
    if (options.scope === "post-merge") return this.postMergeRequire(options);
    if (typeof options.command !== "string") throw new Error("Exactly one command is required.");
    const single = { ...options, command: options.command };
    if (options.scope === "delivery") {
      if (options.ticket) throw new Error("--ticket and --scope delivery are mutually exclusive.");
      return this.deliveryChecksRequire(single);
    }
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.ticket) throw new Error("checks require needs --ticket or --scope delivery.");
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    const command = options.command.trim();
    if (!command) throw new Error("Check command must not be empty.");
    if (options.remove && !options.details?.trim()) {
      throw new Error("Removing a required check requires non-empty --details rationale.");
    }
    if (!options.remove && options.details !== undefined) {
      throw new Error("--details is only valid when removing a required check.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const progress = this.workflowPolicy.requireProgress(ledger, options.ticket);
      if (progress.execution === "integrated")
        throw new Error("Integrated tickets use --scope post-merge for validation.");
      const rebased = options.rebaseBaseline
        ? this.adoptRebasedTicket(feature, ledger, progress, options.author, command)
        : false;
      if (
        !rebased &&
        progress.execution === "reviewing" &&
        (progress.reviewAssignments?.length ?? 0) > 0
      ) {
        throw new Error(
          "The reviewed commit is frozen; required checks cannot change while review assignments are active.",
        );
      }
      const checks = (progress.checks ??= { required: [], records: [] });
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
          const identity = this.gitEvidence.commitIdentity(
            feature,
            this.ticketRepository.requireTicket(
              this.ticketRepository.readTickets(feature.workspace),
              options.ticket,
            ),
            progress.baseSha,
            rebased ? progress.worktree?.workspace : undefined,
          );
          if (rebased) this.workspaceTransaction.writeLedger(feature, ledger);
          return {
            ticket: options.ticket,
            checks,
            idempotent: true,
            ...identity,
          };
        }

        checks.required.push({
          command,
          addedAt: new Date().toISOString(),
          addedBy: options.author.trim(),
        });
      }
      const currentTicket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const identity = this.gitEvidence.commitIdentity(feature, currentTicket, progress.baseSha);
      this.workspaceTransaction.writeLedger(feature, ledger);
      return {
        ticket: options.ticket,
        checks,
        ...identity,
      };
    });
  }

  private adoptRebasedTicket(
    feature: FeaturePaths,
    ledger: FeatureLedger,
    progress: TicketProgress,
    author: string,
    command: string,
  ): boolean {
    if (progress.owner !== author.trim())
      throw new Error("Only the ticket controller may adopt a rebased baseline.");
    if (
      progress.execution !== "reviewing" ||
      progress.assignment?.status !== "submitted" ||
      !progress.worktree
    )
      throw new Error("Rebasing requires a submitted ticket in review with an isolated worktree.");
    if (!progress.checks?.required.some((item) => item.command === command && !item.removedAt))
      throw new Error("--rebase-baseline requires an existing required command.");
    for (const variable of [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_COMMON_DIR",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_NAMESPACE",
    ]) {
      if (process.env[variable])
        throw new Error(`Unset ${variable} before adopting a rebased ticket.`);
    }
    const root = realpathSync(this.app.workspaceRoot);
    const git = (args: string[], cwd = root) =>
      this.gitEvidence.gitBuffer(args, cwd).toString("utf8").trim();
    if (
      git(["symbolic-ref", "--quiet", "--short", "HEAD"]) !== `features/${feature.feature}` ||
      realpathSync(feature.workspace) !== realpathSync(join(root, ".scratch", feature.feature))
    )
      throw new Error("The canonical feature worktree and branch are required.");
    const workspace = this.gitEvidence.ticketWorkspace(progress);
    if (!workspace) throw new Error("Ticket worktree is missing.");
    for (const cwd of [root, workspace]) {
      for (const operation of [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
        "sequencer",
      ]) {
        if (existsSync(resolve(cwd, git(["rev-parse", "--git-path", operation], cwd))))
          throw new Error(`Resolve Git operation ${operation} before adopting the baseline.`);
      }
    }
    const status = git(
      ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none"],
      workspace,
    );
    if (status) throw new Error("Ticket worktree must be clean; user changes were preserved.");
    const allowed = this.gitEvidence.workflowDeliveryRecordPaths(feature, ledger);
    const lock = `.scratch/${feature.feature}/.sdd-tickets.lock`;
    const dirty = this.gitEvidence
      .allGitChangePaths()
      .filter((path) => path !== lock && !allowed.has(path));
    if (dirty.length) throw new Error(`Feature code must be clean: ${dirty.join(", ")}.`);
    const base = this.gitEvidence.headSha(root);
    const head = this.gitEvidence.headSha(workspace);
    if (head === base) throw new Error("Ticket must contain a distinct reviewed code commit.");
    git(["merge-base", "--is-ancestor", base, head], workspace);
    if (!progress.baseSha) throw new Error("Ticket baseline is missing.");
    git(["merge-base", "--is-ancestor", progress.baseSha, base], root);
    this.assertPrerequisiteBaseline(ledger, progress, base);
    if (git(["diff", "--name-only", base, head, "--", ".scratch"], workspace))
      throw new Error("Rebased ticket commits must not change canonical workflow records.");
    if (progress.baseSha === base) return false;
    const attempt =
      progress.assignment.action === "correct"
        ? progress.correctionAttempts?.find((item) => item.number === progress.assignment?.attempt)
        : undefined;
    if (progress.assignment.action === "correct" && !attempt)
      throw new Error("Correction attempt is missing.");
    const previous = attempt
      ? (attempt.reviewAssignments ?? [])
      : (progress.reviewAssignments ?? []);
    if (previous.some((item) => item.status !== "submitted"))
      throw new Error("Pending reviews must finish before rebasing; assignments were preserved.");
    if (previous.length) {
      (progress.reviewHistory ??= []).push(...previous);
      if (attempt) delete attempt.reviewAssignments;
      else delete progress.reviewAssignments;
    }
    (progress.baselineHistory ??= []).push({
      from: progress.baseSha,
      to: base,
      ticketHead: head,
      at: new Date().toISOString(),
      author: author.trim(),
    });
    progress.baseSha = base;
    progress.worktree.baseSha = base;
    if (this.gitEvidence.headSha(root) !== base || this.gitEvidence.headSha(workspace) !== head)
      throw new Error("A Git HEAD changed while adopting the baseline; retry.");
    return true;
  }

  public assertPrerequisiteBaseline(
    ledger: FeatureLedger,
    progress: TicketProgress,
    baseline: string,
  ): void {
    for (const id of progress.blockedBy) {
      const dependency = this.workflowPolicy.requireProgress(ledger, id);
      const mergeSha = dependency.integration?.mergeSha;
      if (
        dependency.status !== "closed" ||
        dependency.blocker ||
        dependency.execution !== "integrated" ||
        dependency.integration?.postMerge?.status !== "passed" ||
        !mergeSha
      ) {
        throw new Error(`Ticket ${id} is not closed and post-merge validated.`);
      }
      try {
        this.gitEvidence.gitBuffer(["merge-base", "--is-ancestor", mergeSha, baseline]);
      } catch {
        throw new Error(`Ticket baseline does not include validated prerequisite ${id}.`);
      }
    }
  }

  public checksRecord(options: ChecksRecordOptions): {
    ticket?: string;
    scope?: "delivery" | "post-merge";
    record: CheckRecord;
    idempotent?: boolean;
    closed?: boolean;
    closureBlocked?: string[];
    retry?: string;
  } & CommitIdentity {
    if (options.scope === "post-merge") return this.postMergeRecord(options);
    if (options.scope === "delivery") {
      if (options.ticket) throw new Error("--ticket and --scope delivery are mutually exclusive.");
      return this.deliveryChecksRecord(options);
    }
    return this.ticketChecksRecord(options);
  }

  private postMergeRequire(options: RequireOptions): {
    ticket: string;
    scope: "post-merge";
    checks: TicketChecks;
    idempotent?: boolean;
    closed?: boolean;
    closureBlocked?: string[];
    retry?: string;
  } & CommitIdentity {
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    if (options.remove || options.details !== undefined)
      throw new Error("Post-merge checks must be declared as a complete list.");
    const commands = (Array.isArray(options.command) ? options.command : [options.command]).map(
      (command) => command.trim(),
    );
    if (
      !commands.length ||
      commands.some((command) => !command) ||
      new Set(commands).size !== commands.length
    )
      throw new Error("Declare a non-empty list of unique post-merge commands.");
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const { progress, postMerge } = this.postMergeProgress(
        ledger,
        options.ticket,
        options.author,
      );
      const previous = progress.integrationHistory?.at(-1)?.postMerge?.checks;
      if (
        previous &&
        JSON.stringify(previous.required.map((item) => item.command)) !== JSON.stringify(commands)
      )
        throw new Error("Post-merge correction must retain the entire prior required check list.");
      const prior = postMerge.checks;
      const same =
        prior &&
        JSON.stringify(prior.required.map((item) => item.command)) === JSON.stringify(commands);
      if (prior?.records.length && !same)
        throw new Error("Post-merge check list is frozen after the first result.");
      const checks =
        same && prior
          ? prior
          : {
              required: commands.map((command) => ({
                command,
                addedAt: new Date().toISOString(),
                addedBy: options.author.trim(),
              })),
              records: [],
            };
      if (!same) postMerge.checks = checks;
      const identity = this.postMergeIdentity(feature, ledger, progress);
      if (!same) this.workspaceTransaction.writeLedger(feature, ledger);
      const closure =
        same && checks.records.length
          ? this.closePostMergeIfReady(feature, ledger, progress, checks, identity, options.author)
          : {};
      return {
        ticket: options.ticket,
        scope: "post-merge",
        checks,
        ...(same ? { idempotent: true } : {}),
        ...closure,
        ...identity,
      };
    });
  }

  private postMergeRecord(options: ChecksRecordOptions): {
    ticket: string;
    scope: "post-merge";
    record: CheckRecord;
    closed?: boolean;
    closureBlocked?: string[];
    retry?: string;
  } & CommitIdentity {
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    if (options.paths !== undefined)
      throw new Error("--paths is not supported for post-merge checks.");
    const command = options.command.trim();
    const result = options.result;
    if (result !== "passed" && result !== "failed" && result !== "unavailable")
      throw new Error(`Invalid check result: ${result}.`);
    if (result !== "passed" && !options.details?.trim())
      throw new Error("--details is required for failed or unavailable checks.");
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const { progress, postMerge } = this.postMergeProgress(
        ledger,
        options.ticket,
        options.author,
      );
      const checks = postMerge.checks;
      if (!checks?.required.length)
        throw new Error("Declare the entire non-empty post-merge check list first.");
      if (!checks.required.some((item) => item.command === command))
        throw new Error(`Check command is not required: ${command}.`);
      const identity = this.postMergeIdentity(feature, ledger, progress);
      const record: CheckRecord = {
        command,
        result,
        author: options.author.trim(),
        ...identity,
        recordedAt: new Date().toISOString(),
        ...(options.details?.trim() ? { details: options.details.trim() } : {}),
      };
      checks.records.push(record);
      const confirmed = this.postMergeIdentity(feature, ledger, progress);
      if (confirmed.headSha !== identity.headSha)
        throw new Error("Feature commit changed while recording the check; retry.");
      const closure = this.closePostMergeIfReady(
        feature,
        ledger,
        progress,
        checks,
        identity,
        options.author,
      );
      if (!closure.closed) this.workspaceTransaction.writeLedger(feature, ledger);
      return { ticket: options.ticket, scope: "post-merge", record, ...closure, ...identity };
    });
  }

  private closePostMergeIfReady(
    feature: FeaturePaths,
    ledger: FeatureLedger,
    progress: TicketProgress,
    checks: TicketChecks,
    identity: CommitIdentity,
    author: string,
  ): { closed?: boolean; closureBlocked?: string[]; retry?: string } {
    const latest = checks.required.map((item) =>
      [...checks.records].reverse().find((candidate) => candidate.command === item.command),
    );
    if (!latest.length || latest.some((record) => record?.result !== "passed")) return {};
    const tickets = this.ticketRepository.readTickets(feature.workspace);
    const ticket = this.ticketRepository.requireTicket(tickets, progress.id);
    if (
      latest.some(
        (record) =>
          !record ||
          (record.headSha !== identity.headSha &&
            !this.gitEvidence.commitPreservesInputs(
              feature,
              ticket,
              record.headSha,
              identity.headSha,
              this.app.workspaceRoot,
            )),
      )
    ) {
      return {
        closed: false,
        closureBlocked: ["Post-merge check evidence is stale for the current committed inputs."],
        retry:
          "Run and record each stale check against the current committed inputs before closure.",
      };
    }
    this.ticketRepository.validateDependencyGraph(tickets);
    const unmet = ReadinessPolicy.unmetDependencies(ticket, tickets, ledger);
    const closureBlocked = [
      ...(ticket.blocker ? [`Ticket blocker: ${ticket.blocker}`] : []),
      ...(unmet.length ? [`Unmet or unvalidated dependencies: ${unmet.join(", ")}`] : []),
    ];
    if (closureBlocked.length) {
      return {
        closed: false,
        closureBlocked,
        retry:
          "Resolve the blockers, then repeat checks require with the same complete post-merge command list to retry closure.",
      };
    }
    const postMerge = progress.integration?.postMerge;
    if (!postMerge || postMerge.status !== "pending")
      throw new Error("Post-merge integration is no longer pending.");
    postMerge.status = "passed";
    progress.status = "closed";
    const body = this.ticketRepository.appendAudit(
      ticket.body,
      author,
      `Post-merge checks passed at ${identity.headSha}; ticket closed.`,
    );
    this.workspaceTransaction.writeWorkflowState(
      feature,
      ticket,
      this.ticketRepository.serializeTicket(ticket, body),
      ledger,
    );
    return { closed: true };
  }

  private postMergeProgress(ledger: FeatureLedger, ticket: string, author: string) {
    const progress = this.workflowPolicy.requireProgress(ledger, ticket);
    const integration = progress.integration;
    const postMerge = integration?.postMerge;
    if (progress.owner !== author.trim())
      throw new Error("Only the ticket controller may manage post-merge checks.");
    if (
      progress.execution !== "integrated" ||
      progress.status === "closed" ||
      !integration?.mergeSha ||
      postMerge?.status !== "pending" ||
      postMerge.mergeSha !== integration.mergeSha
    )
      throw new Error("Ticket must have a pending post-merge integration.");
    return { progress, postMerge };
  }

  public postMergeIdentity(
    feature: FeaturePaths,
    ledger: FeatureLedger,
    progress: TicketProgress,
  ): CommitIdentity {
    for (const variable of [
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_COMMON_DIR",
      "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_NAMESPACE",
    ]) {
      if (process.env[variable]) throw new Error(`Unset ${variable} before post-merge validation.`);
    }
    const root = realpathSync(this.app.workspaceRoot);
    const git = (args: string[]) => this.gitEvidence.gitBuffer(args, root).toString("utf8").trim();
    const common = realpathSync(git(["rev-parse", "--path-format=absolute", "--git-common-dir"]));
    const statePath = join(common, "spindle-feature-start", `${feature.feature}.json`);
    const entry = lstatSync(statePath);
    if (!entry.isFile() || entry.isSymbolicLink())
      throw new Error("Canonical feature startup state is unsafe.");
    const state: unknown = JSON.parse(readFileSync(statePath, "utf8"));
    if (
      !Records.isRecord(state) ||
      state.version !== 1 ||
      state.phase !== "created" ||
      state.feature !== feature.feature ||
      state.featureWorkspace !== root ||
      state.featureBranch !== `features/${feature.feature}` ||
      git(["symbolic-ref", "--quiet", "--short", "HEAD"]) !== state.featureBranch
    )
      throw new Error("Post-merge checks require the canonical feature worktree and branch.");
    const currentHead = git(["rev-parse", "--verify", "HEAD"]);
    const mergeSha = progress.integration?.mergeSha;
    if (!mergeSha) throw new Error("The recorded merge commit is missing.");
    const allowed = this.gitEvidence.workflowDeliveryRecordPaths(feature, ledger);
    if (currentHead !== mergeSha) {
      git(["merge-base", "--is-ancestor", mergeSha, currentHead]);
      const changed = this.gitEvidence
        .gitBuffer(
          ["diff", "--name-only", "-z", "--no-renames", mergeSha, currentHead, "--", "."],
          root,
        )
        .toString("utf8")
        .split("\0")
        .filter(Boolean);
      if (changed.some((path) => !allowed.has(path))) {
        throw new Error(
          "Feature code changed after the recorded merge; post-merge checks are stale.",
        );
      }
    }
    const headSha = currentHead;
    for (const operation of [
      "MERGE_HEAD",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
      "rebase-merge",
      "rebase-apply",
      "sequencer",
    ]) {
      if (existsSync(resolve(root, git(["rev-parse", "--git-path", operation]))))
        throw new Error(`Post-merge checks cannot run during Git operation ${operation}.`);
    }
    const lock = `.scratch/${feature.feature}/.sdd-tickets.lock`;
    const dirty = this.gitEvidence
      .allGitChangePaths()
      .filter((path) => path !== lock && !allowed.has(path));
    if (dirty.length) throw new Error(`Post-merge checks require clean code: ${dirty.join(", ")}`);
    this.gitEvidence.assertCommittedCode(root);
    const tickets = this.ticketRepository.readTickets(feature.workspace);
    const ticket = this.ticketRepository.requireTicket(tickets, progress.id);
    this.gitEvidence.assertCommittedRequirements(feature, [ticket], currentHead);
    return { headSha };
  }
  private ticketChecksRecord(options: ChecksRecordOptions): {
    ticket?: string;
    record: CheckRecord;
    idempotent?: boolean;
  } & CommitIdentity {
    if (options.scope !== undefined) throw new Error("--scope must be 'delivery'.");
    if (!options.ticket) throw new Error("checks record needs --ticket or --scope delivery.");
    validateTicketId(options.ticket);
    validateAuthor(options.author);
    const command = options.command.trim();
    if (!command) throw new Error("Check command must not be empty.");
    if (!["passed", "failed", "unavailable"].includes(options.result)) {
      throw new Error(`Invalid check result: ${options.result}.`);
    }
    if (options.result !== "passed" && !options.details?.trim()) {
      throw new Error("--details is required for failed or unavailable checks.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const progress = this.workflowPolicy.requireProgress(ledger, options.ticket);
      if (progress.integration?.postMerge)
        throw new Error("Integrated tickets use --scope post-merge for validation.");
      const checks = progress.checks;
      if (!checks) throw new Error("No required checks are declared for this ticket.");
      const requirement = checks.required.find(
        (item) => item.command === command && !item.removedAt,
      );
      if (!requirement) throw new Error(`Check command is not currently required: ${command}.`);
      const coveredPaths =
        options.paths === undefined
          ? undefined
          : [...new Set(options.paths.map((path) => path.trim()))].sort();
      if (
        coveredPaths &&
        (coveredPaths.length === 0 || coveredPaths.some((path) => !isSafeCoveragePath(path)))
      ) {
        throw new Error("--paths must contain unique safe checkout-relative file paths.");
      }
      const ticket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const identity = this.gitEvidence.commitIdentity(feature, ticket, progress.baseSha);
      this.gitEvidence.assertTicketCodeCommitted(progress);
      this.gitEvidence.assertCommittedRequirements(
        feature,
        [ticket],
        this.gitEvidence.headSha(feature.workspace),
      );
      if (progress.worktree)
        this.gitEvidence.assertTicketRequirementsCurrent(
          feature,
          ticket,
          identity.headSha,
          this.gitEvidence.ticketWorkspace(progress)!,
        );
      const latestForCommand = [...checks.records]
        .reverse()
        .find((record) => record.command === command);
      const repeat =
        latestForCommand &&
        latestForCommand.result === options.result &&
        latestForCommand.author === options.author.trim() &&
        latestForCommand.headSha === identity.headSha &&
        (!progress.worktree || latestForCommand.headSha === identity.headSha) &&
        latestForCommand.details === options.details?.trim() &&
        JSON.stringify(latestForCommand.coveredPaths) === JSON.stringify(coveredPaths)
          ? latestForCommand
          : undefined;
      if (repeat) return { ticket: options.ticket, record: repeat, idempotent: true, ...identity };
      const record: CheckRecord = {
        command,
        result: options.result as CheckRecord["result"],
        author: options.author.trim(),
        headSha: identity.headSha,
        recordedAt: new Date().toISOString(),
        ...(coveredPaths ? { coveredPaths } : {}),
        ...(options.details?.trim() ? { details: options.details.trim() } : {}),
      };
      checks.records.push(record);
      let correctionCheckHistory: CheckRecord[] | undefined;
      if (progress.assignment?.action === "correct") {
        const attempt = progress.correctionAttempts?.find(
          (candidate) => candidate.number === progress.assignment?.attempt,
        );
        if (attempt) {
          const recorded = (attempt.checks ??= []);
          correctionCheckHistory = recorded;
          if (!recorded.some((candidate) => candidate.recordedAt === record.recordedAt)) {
            recorded.push(record);
          }
        }
      }
      const confirmedTicket = this.ticketRepository.requireTicket(
        this.ticketRepository.readTickets(feature.workspace),
        options.ticket,
      );
      const confirmedIdentity = this.gitEvidence.commitIdentity(
        feature,
        confirmedTicket,
        progress.baseSha,
      );
      if (confirmedIdentity.headSha !== identity.headSha) {
        checks.records.pop();
        correctionCheckHistory?.pop();
        throw new Error("Commit changed while recording the check; retry.");
      }
      this.workspaceTransaction.writeLedger(feature, ledger);
      return { ticket: options.ticket, record, ...identity };
    });
  }

  public deliveryChecksRequire(options: ChecksRequireOptions): {
    scope: "delivery";
    checks: TicketChecks;
    idempotent?: boolean;
    headSha: string;
  } {
    validateAuthor(options.author);
    const command = options.command.trim();
    if (!command) throw new Error("Check command must not be empty.");
    if (options.remove && !options.details?.trim()) {
      throw new Error("Removing a required check requires non-empty --details rationale.");
    }
    if (!options.remove && options.details !== undefined) {
      throw new Error("--details is only valid when removing a required check.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const delivery = ledger.delivery;
      this.workflowPolicy.assertDeliveryOpen(delivery);
      if (delivery.owner && delivery.owner !== options.author.trim()) {
        throw new Error("Only the recorded delivery controller may change required checks.");
      }
      if (delivery.execution === "reviewing" && (delivery.reviewAssignments?.length ?? 0) > 0) {
        throw new Error("Aggregate review is frozen; required delivery checks cannot change.");
      }
      delivery.owner = options.author.trim();
      const checks = (delivery.checks ??= { required: [], records: [] });
      const active = checks.required.find(
        (requirement) => requirement.command === command && !requirement.removedAt,
      );
      if (options.remove) {
        if (!active) throw new Error(`Required delivery check is not declared: ${command}.`);
        active.removedAt = new Date().toISOString();
        active.removedBy = options.author.trim();
        active.removalDetails = options.details!.trim();
      } else {
        if (active) {
          const identity = this.gitEvidence.deliveryCommitIdentity(
            feature,
            ledger,
            this.ticketRepository.readTickets(feature.workspace),
          );
          return { scope: "delivery", checks, idempotent: true, ...identity };
        }
        checks.required.push({
          command,
          addedAt: new Date().toISOString(),
          addedBy: options.author.trim(),
        });
      }
      const identity = this.gitEvidence.deliveryCommitIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      delivery.history.push({
        at: new Date().toISOString(),
        author: options.author.trim(),
        action: `${options.remove ? "delivery-check-removed" : "delivery-check-required"}:${command}`,
      });
      this.workspaceTransaction.writeLedger(feature, ledger);
      return { scope: "delivery", checks, ...identity };
    });
  }

  public deliveryChecksRecord(options: ChecksRecordOptions): {
    scope: "delivery";
    record: CheckRecord;
    idempotent?: boolean;
  } & CommitIdentity {
    validateAuthor(options.author);
    const command = options.command.trim();
    if (!command) throw new Error("Check command must not be empty.");
    if (!["passed", "failed", "unavailable"].includes(options.result)) {
      throw new Error(`Invalid check result: ${options.result}.`);
    }
    if (options.result !== "passed" && !options.details?.trim()) {
      throw new Error("--details is required for failed or unavailable checks.");
    }
    const feature = this.featureInspectionService.resolveFeature(options.spec);
    return this.workspaceTransaction.run(feature.workspace, () => {
      const ledger = this.ledgerRepository.readLedger(feature);
      const delivery = ledger.delivery;
      this.workflowPolicy.assertDeliveryOpen(delivery);
      if (!delivery.checks) throw new Error("No required checks are declared for delivery.");
      if (delivery.owner !== options.author.trim()) {
        throw new Error("Only the recorded delivery controller may record final checks.");
      }
      const requirement = delivery.checks.required.find(
        (item) => item.command === command && !item.removedAt,
      );
      if (!requirement)
        throw new Error(`Check command is not currently required for delivery: ${command}.`);
      const identity = this.gitEvidence.deliveryCommitIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      const prior = [...delivery.checks.records]
        .reverse()
        .find((record) => record.command === command);
      if (
        prior &&
        prior.result === options.result &&
        prior.author === options.author.trim() &&
        prior.headSha === identity.headSha &&
        prior.details === options.details?.trim()
      ) {
        return { scope: "delivery", record: prior, idempotent: true, ...identity };
      }
      const record: CheckRecord = {
        command,
        result: options.result as CheckRecord["result"],
        author: options.author.trim(),
        headSha: identity.headSha,
        recordedAt: new Date().toISOString(),
        ...(options.details?.trim() ? { details: options.details.trim() } : {}),
      };
      delivery.checks.records.push(record);
      if (record.result !== "passed") delivery.execution = "changes-requested";
      delivery.history.push({
        at: record.recordedAt,
        author: record.author,
        action: `delivery-check-recorded:${command}:${record.result}`,
      });
      const confirmed = this.gitEvidence.deliveryCommitIdentity(
        feature,
        ledger,
        this.ticketRepository.readTickets(feature.workspace),
      );
      if (confirmed.headSha !== identity.headSha) {
        delivery.checks.records.pop();
        delivery.history.pop();
        throw new Error("Commit changed while recording the delivery check; retry.");
      }
      this.workspaceTransaction.writeLedger(feature, ledger);
      return { scope: "delivery", record, ...identity };
    });
  }
}
