import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { Service } from "@spindle/Foundation/Service";
import { GitService } from "@spindle/Git/Services/GitService";
import { featureSchema, type Feature } from "@spindle/SubagentDrivenDevelopment/Models/Feature";
import {
  featureLedgerSchema,
  type FeatureLedger,
} from "@spindle/SubagentDrivenDevelopment/Models/FeatureLedger";
import type { Finding } from "@spindle/SubagentDrivenDevelopment/Models/Finding";
import type { Task } from "@spindle/SubagentDrivenDevelopment/Models/Task";
import type { Ticket } from "@spindle/SubagentDrivenDevelopment/Models/Ticket";
import { SddReviewService } from "@spindle/SubagentDrivenDevelopment/Services/SddReviewService";
import { WorkGraphService } from "@spindle/SubagentDrivenDevelopment/Services/WorkGraphService";

type NewWorkspace = Pick<Feature, "name" | "specification" | "design">;
type NewTicket = Pick<Ticket, "title" | "requirements" | "acceptanceCriteria" | "dependencies">;
type NewTask = Pick<Task, "instructions" | "writeScope" | "context" | "dependencies">;
type ReviewFinding = Extract<Finding, { type: "review" }>;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const numberedWorkspace = /^([0-9]{4,})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export class FeatureWorkspaceService extends Service {
  public async createNumbered(slug: string, records: Omit<NewWorkspace, "name">) {
    this.assertApplicationBooted();
    if (slug !== slug.trim() || !slugPattern.test(slug)) {
      throw new Error("Feature slug must be lowercase kebab-case.");
    }

    const features = await this.featuresDirectory(true);
    return this.withLock(join(features, ".allocation-lock"), async () => {
      let highest = 0n;
      for (const entry of await readdir(features)) {
        const match = numberedWorkspace.exec(entry);
        if (match && entry === entry.trim()) {
          const number = BigInt(match[1]);
          if (number > highest) highest = number;
        }
      }
      const name = `${String(highest + 1n).padStart(4, "0")}-${slug}`;
      await this.create({ ...records, name });
      return { name, workspace: join(features, name) };
    });
  }

  public async create(input: NewWorkspace): Promise<Feature> {
    this.assertApplicationBooted();
    const ledger: FeatureLedger = { version: 1, tickets: [], findings: [], reviewRounds: [] };
    const feature = featureSchema.parse({
      name: input.name,
      specification: input.specification,
      design: input.design,
      tickets: [],
      findings: [],
      reviewRounds: [],
    });

    const workspace = await this.workspacePath(input.name, true);
    await mkdir(workspace, { mode: 0o700 });
    try {
      await this.withLock(join(workspace, ".ledger-lock"), async () => {
        await mkdir(join(workspace, "tickets"));
        await mkdir(join(workspace, "reports"));
        await writeFile(join(workspace, "spec.md"), feature.specification, { flag: "wx" });
        if (feature.design !== undefined) {
          await writeFile(join(workspace, "design.md"), feature.design, { flag: "wx" });
        }
        await this.replaceLedger(workspace, ledger);
      });
      return feature;
    } catch (error) {
      throw new Error(`Could not initialize feature workspace at ${workspace}.`, { cause: error });
    }
  }

  public async load(reference: string): Promise<Feature> {
    this.assertApplicationBooted();
    const name = this.workspaceName(reference);
    const workspace = await this.workspacePath(name);
    return this.assemble(name, workspace, await this.readLedger(workspace));
  }

  public async createTicket(reference: string, input: NewTicket) {
    this.assertApplicationBooted();
    const title = input.title.trim();
    const requirements = input.requirements.trim().replaceAll("\r\n", "\n");
    const acceptanceCriteria = input.acceptanceCriteria.trim().replaceAll("\r\n", "\n");
    if (!title || /[\r\n]/.test(title))
      throw new Error("Ticket title must be a non-empty single line.");
    if (!requirements || !acceptanceCriteria) {
      throw new Error("Ticket requirements and acceptance criteria must not be empty.");
    }

    return this.withLedger(reference, async (ledger, name, workspace) => {
      const directory = join(workspace, "tickets");
      await this.requireDirectory(directory);
      const ids = [
        ...ledger.tickets.map(({ id }) => id),
        ...(await readdir(directory))
          .filter((entry) => /^T-\d{4,}\.md$/.test(entry))
          .map((entry) => basename(entry, ".md")),
      ];
      const number = FeatureWorkspaceService.nextNumber(ids.map((id) => id.slice(2)));
      const id = `T-${number.padStart(4, "0")}`;
      const path = join(directory, `${id}.md`);
      const markdown = `# ${title}\n\n## Requirements\n\n${requirements}\n\n## Acceptance Criteria\n\n${acceptanceCriteria}\n\n## Comments\n`;
      const parsed = this.ticketRequirements(markdown, path);
      if (
        parsed.requirements !== requirements ||
        parsed.acceptanceCriteria !== acceptanceCriteria
      ) {
        throw new Error(
          "Ticket requirements and acceptance criteria must not contain level 1 or 2 headings outside code fences.",
        );
      }

      const next = featureLedgerSchema.parse({
        ...ledger,
        tickets: [
          ...ledger.tickets,
          {
            id,
            title,
            dependencies: input.dependencies,
            tasks: [],
            workRoundCommits: [],
            merged: false,
          },
        ],
      });
      await this.assemble(name, workspace, next, { id, markdown });
      await writeFile(path, markdown, { flag: "wx", flush: true });
      await this.replaceLedger(workspace, next);
      return { ticket: id, path };
    });
  }

  public async createTask(reference: string, ticketId: string, input: NewTask) {
    if (!input.instructions.trim()) throw new Error("Task instructions must not be empty.");
    let taskId = "";
    await this.updateLedger(reference, async (ledger) => {
      const ticket = ledger.tickets.find(({ id }) => id === ticketId);
      if (!ticket) throw new Error(`Unknown ticket '${ticketId}'.`);
      if (ticket.merged) throw new Error(`Cannot add a task to merged ticket '${ticketId}'.`);
      await (await this.app.make(SddReviewService)).assertOrdinaryTaskAllowed(ledger, ticket);
      taskId = this.appendTask(ticket, input);
      return ledger;
    });
    return { ticket: ticketId, task: taskId };
  }

  public async createFindingFixTask(reference: string, findingId: string, input: NewTask) {
    if (!input.instructions.trim()) throw new Error("Task instructions must not be empty.");
    let result:
      | { finding: string; ticket: string; task: string; ticketCreated: boolean }
      | undefined;
    await this.withLedger(reference, async (ledger, name, workspace) => {
      if (ledger.pendingStart)
        throw new Error("Resume the pending start before creating fix work.");
      const finding = ledger.findings.find(({ id }) => id === findingId);
      if (!finding) throw new Error(`Unknown finding '${findingId}'.`);
      if (
        (finding.type === "review"
          ? finding.decision.status !== "open"
          : finding.decision !== "open") ||
        finding.fixWork
      ) {
        throw new Error(`Finding '${findingId}' must be open and have no existing fix work.`);
      }
      let ticketId: string;
      if (finding.type === "review") {
        const round = ledger.reviewRounds.find(({ reviews }) =>
          reviews.some(({ id }) => id === finding.reviewId),
        );
        if (!round) throw new Error(`Finding '${findingId}' has no review round.`);
        if (round.target.type === "feature") {
          if (!ledger.featureBranch || !ledger.featureWorktree) {
            throw new Error("Start the feature before creating feature finding fix work.");
          }
          if (ledger.tickets.some(({ merged }) => !merged)) {
            throw new Error(
              "Integrate all feature tickets before creating feature finding fix work.",
            );
          }
          if (
            ledger.reviewRounds.some(
              ({ target, reviews }) =>
                target.type === "feature" && reviews.some(({ result }) => result === undefined),
            )
          ) {
            throw new Error("Wait for all feature reviews before creating fix work.");
          }
          if (input.dependencies.length > 0) {
            throw new Error(
              "Feature finding fix work starts in a new ticket and has no task dependencies.",
            );
          }
          result = await this.createFeatureFindingFixTicket(
            ledger,
            workspace,
            name,
            finding,
            input,
          );
          return;
        }
        ticketId = round.target.ticketId;
      } else {
        ticketId = finding.ticketId;
      }
      const ticket = ledger.tickets.find(({ id }) => id === ticketId);
      if (!ticket?.worktree || ticket.merged)
        throw new Error(`Ticket '${ticketId}' has no active worktree.`);
      if (
        finding.type === "review" &&
        ledger.reviewRounds.some(
          ({ target, reviews }) =>
            target.type === "ticket" &&
            target.ticketId === ticketId &&
            reviews.some(({ result }) => result === undefined),
        )
      )
        throw new Error(`Wait for all reviews on '${ticketId}' before creating fix work.`);
      if (finding.type === "conflict") {
        if (!finding.sourceCommit || !finding.targetCommit) {
          throw new Error(`Conflict finding '${findingId}' has no integration commit details.`);
        }
        const git = await this.app.make(GitService);
        const incoming = this.git(git, ticket.worktree, [
          "diff",
          "--no-renames",
          "--name-only",
          "-z",
          finding.targetCommit,
          finding.sourceCommit,
        ])
          .split("\0")
          .filter(Boolean);
        const scope = new Set(input.writeScope);
        const uncovered = [...new Set([...finding.conflictedPaths, ...incoming])].filter(
          (path) => !scope.has(path),
        );
        if (uncovered.length > 0) {
          throw new Error(
            `Merge task scope must cover all incoming and conflicted paths: ${JSON.stringify(uncovered)}`,
          );
        }
      }
      const task = this.appendTask(ticket, { ...input, discoveredFrom: findingId });
      finding.fixWork = { type: "task", taskId: task };
      const next = featureLedgerSchema.parse(ledger);
      await this.assemble(name, workspace, next);
      await this.replaceLedger(workspace, next);
      result = { finding: findingId, ticket: ticketId, task, ticketCreated: false };
    });
    if (!result) throw new Error("Fix task was not created.");
    return result;
  }

  private async createFeatureFindingFixTicket(
    ledger: FeatureLedger,
    workspace: string,
    name: string,
    finding: ReviewFinding,
    input: NewTask,
  ) {
    const directory = join(workspace, "tickets");
    const ids = [
      ...ledger.tickets.map(({ id }) => id),
      ...(await readdir(directory))
        .filter((entry) => /^T-\d{4,}\.md$/.test(entry))
        .map((entry) => basename(entry, ".md")),
    ];
    const number = FeatureWorkspaceService.nextNumber(ids.map((ticketId) => ticketId.slice(2)));
    const id = `T-${number.padStart(4, "0")}`;
    const plain = (value: string) => value.replace(/\s+/g, " ").trim();
    const title = `Resolve feature finding: ${plain(finding.title)}`;
    const requirements = [
      `Resolve feature review finding ${finding.id}.`,
      `Criterion: ${plain(finding.criterion)}`,
      `Evidence: ${plain(finding.evidence)}`,
      `Suggested fix: ${plain(finding.suggestedFix)}`,
    ].join("\n\n");
    const acceptanceCriteria = `The finding criterion is satisfied: ${plain(finding.criterion)}`;
    const path = join(directory, `${id}.md`);
    const markdown = `# ${title}\n\n## Requirements\n\n${requirements}\n\n## Acceptance Criteria\n\n${acceptanceCriteria}\n\n## Comments\n`;
    const parsed = this.ticketRequirements(markdown, path);
    if (parsed.requirements !== requirements || parsed.acceptanceCriteria !== acceptanceCriteria) {
      throw new Error(`Could not create ticket requirements for finding '${finding.id}'.`);
    }
    const ticket: FeatureLedger["tickets"][number] = {
      id,
      title,
      dependencies: [],
      tasks: [],
      workRoundCommits: [],
      merged: false,
    };
    const task = this.appendTask(ticket, {
      instructions: input.instructions,
      writeScope: input.writeScope,
      context: input.context,
      dependencies: [],
      discoveredFrom: finding.id,
    });
    ledger.tickets.push(ticket);
    finding.fixWork = { type: "ticket", ticketId: id };
    const next = featureLedgerSchema.parse(ledger);
    await this.assemble(name, workspace, next, { id, markdown });
    await writeFile(path, markdown, { flag: "wx", flush: true });
    await this.replaceLedger(workspace, next);
    return { finding: finding.id, ticket: id, task, ticketCreated: true };
  }

  private appendTask(
    ticket: Pick<Ticket, "id" | "tasks">,
    input: NewTask & Pick<Task, "discoveredFrom">,
  ): string {
    const number = FeatureWorkspaceService.nextNumber(
      ticket.tasks.map(({ id }) => id.slice(ticket.id.length + 1)),
    );
    const id = `${ticket.id}.${number}`;
    ticket.tasks.push({ ...input, id, state: "Pending", attempt: 0 });
    return id;
  }

  private git(git: GitService, cwd: string, args: string[]): string {
    const result = git.run(args, { cwd, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
    return result.stdout.replace(/\r?\n$/, "");
  }

  private workspaceName(reference: string): string {
    const name = basename(reference);
    if (
      reference !== name &&
      resolve(this.app.workspaceRoot, reference) !==
        this.app.workspacePath(join(".spindle", "features", name))
    ) {
      throw new Error(
        "Feature directory must be under .spindle/features in the original checkout.",
      );
    }
    return name;
  }

  public async updateLedger(
    reference: string,
    update: (ledger: FeatureLedger) => FeatureLedger | Promise<FeatureLedger>,
  ): Promise<Feature> {
    return this.withLedger(reference, async (current, name, workspace) => {
      const next = featureLedgerSchema.parse(await update(current));
      const feature = await this.assemble(name, workspace, next);
      await this.replaceLedger(workspace, next);
      return feature;
    });
  }

  public async withLedgerTransaction<T>(
    reference: string,
    operation: (
      feature: Feature,
      ledger: FeatureLedger,
      publish: (ledger: FeatureLedger) => Promise<void>,
    ) => Promise<T>,
    options: { resumeTicketCommit?: boolean; resumeIntegration?: boolean } = {},
  ): Promise<T> {
    return this.withLedger(
      reference,
      async (ledger, name, workspace) => {
        const feature = await this.assemble(name, workspace, ledger);
        return operation(feature, ledger, async (next) => {
          await this.replaceLedger(workspace, featureLedgerSchema.parse(next));
        });
      },
      options,
    );
  }

  private async withLedger<T>(
    reference: string,
    operation: (ledger: FeatureLedger, name: string, workspace: string) => Promise<T>,
    options: { resumeTicketCommit?: boolean; resumeIntegration?: boolean } = {},
  ): Promise<T> {
    this.assertApplicationBooted();
    const name = this.workspaceName(reference);
    const workspace = await this.workspacePath(name);
    return this.withLock(join(workspace, ".ledger-lock"), async () => {
      const ledger = await this.readLedger(workspace);
      if (ledger.pendingTicketCommit && !options.resumeTicketCommit) {
        throw new Error(
          "Resume the pending ticket commit first. Run sdd next for the resume command.",
        );
      }
      if (ledger.pendingIntegration && !options.resumeIntegration) {
        throw new Error(
          "Resume the pending ticket integration first. Run sdd next for the resume command.",
        );
      }
      return operation(ledger, name, workspace);
    });
  }

  private static nextNumber(numbers: string[]): string {
    let highest = 0n;
    for (const number of numbers) {
      const value = BigInt(number);
      if (value > highest) highest = value;
    }
    return String(highest + 1n);
  }

  private async withLock<T>(lock: string, operation: () => Promise<T>): Promise<T> {
    try {
      await mkdir(lock, { mode: 0o700 });
    } catch (error) {
      if (!FeatureWorkspaceService.hasCode(error, "EEXIST")) throw error;
      throw new Error(`Feature storage is locked: ${lock}`, { cause: error });
    }

    try {
      return await operation();
    } finally {
      await rmdir(lock);
    }
  }

  private async workspacePath(name: string, createParents = false): Promise<string> {
    if (name !== name.trim() || !numberedWorkspace.test(name)) {
      throw new Error(`Invalid numbered feature workspace name: '${name}'.`);
    }

    const workspace = join(await this.featuresDirectory(createParents), name);
    if (!createParents) await this.requireDirectory(workspace);
    return workspace;
  }

  private async featuresDirectory(createParents: boolean): Promise<string> {
    const state = this.app.workspacePath(".spindle");
    const features = join(state, "features");
    for (const directory of [state, features]) {
      if (createParents) {
        try {
          await mkdir(directory);
        } catch (error) {
          if (!FeatureWorkspaceService.hasCode(error, "EEXIST")) throw error;
        }
      }
      await this.requireDirectory(directory);
    }
    return features;
  }

  private async requireDirectory(path: string): Promise<void> {
    if (!(await lstat(path)).isDirectory()) throw new Error(`Expected a directory: ${path}`);
  }

  private async readRecord(path: string): Promise<string> {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      if (!(await file.stat()).isFile()) throw new Error(`Expected a regular file: ${path}`);
      return await file.readFile("utf8");
    } finally {
      await file.close();
    }
  }

  private async readLedger(workspace: string): Promise<FeatureLedger> {
    const path = join(workspace, "sdd.json");
    const content = await this.readRecord(path);
    try {
      return featureLedgerSchema.parse(JSON.parse(content));
    } catch (error) {
      throw new Error(`Invalid feature ledger at ${path}: ${String(error)}`, { cause: error });
    }
  }

  private async replaceLedger(workspace: string, ledger: FeatureLedger): Promise<void> {
    const temporary = await mkdtemp(join(workspace, ".ledger-"));
    try {
      const pending = join(temporary, "sdd.json");
      await writeFile(pending, `${JSON.stringify(ledger, null, 2)}\n`, { flag: "wx", flush: true });
      await rename(pending, join(workspace, "sdd.json"));
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  private async assemble(
    name: string,
    workspace: string,
    ledger: FeatureLedger,
    pending?: { id: string; markdown: string },
  ): Promise<Feature> {
    const design = await this.readRecord(join(workspace, "design.md")).catch((error: unknown) => {
      if (!FeatureWorkspaceService.hasCode(error, "ENOENT")) throw error;
      return undefined;
    });
    const ticketsDirectory = join(workspace, "tickets");
    await this.requireDirectory(ticketsDirectory);
    const tickets = await Promise.all(
      ledger.tickets.map(async (ticket) => {
        const path = join(ticketsDirectory, `${ticket.id}.md`);
        const markdown = pending?.id === ticket.id ? pending.markdown : await this.readRecord(path);
        return { ...ticket, ...this.ticketRequirements(markdown, path) };
      }),
    );
    const { version: _version, ...facts } = ledger;
    const feature = featureSchema.parse({
      ...facts,
      name,
      specification: await this.readRecord(join(workspace, "spec.md")),
      design,
      tickets,
    });
    const graph = await this.app.make(WorkGraphService);
    const issues = graph.validate(feature);
    if (issues.length > 0) {
      throw new Error(`Invalid work graph for '${name}': ${JSON.stringify(issues)}`);
    }
    return feature;
  }

  private ticketRequirements(
    markdown: string,
    path: string,
  ): Pick<Feature["tickets"][number], "requirements" | "acceptanceCriteria"> {
    const sections = new Map<string, string[]>();
    let active: string[] | undefined;
    let fence: string | undefined;
    for (const line of markdown.split(/\r?\n/)) {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (marker && marker[1].startsWith(fence) && marker[2].trim() === "") fence = undefined;
      } else if (marker) {
        fence = marker[1];
      } else {
        const heading = /^ {0,3}#{1,2}[ \t]+(.+?)\s*$/.exec(line);
        if (heading) {
          const label = heading[1];
          active = undefined;
          if (label === "Requirements" || label === "Acceptance Criteria") {
            if (sections.has(label)) throw new Error(`Duplicate '${label}' heading in ${path}.`);
            active = [];
            sections.set(label, active);
          }
          continue;
        }
      }
      active?.push(line);
    }
    const requirements = sections.get("Requirements")?.join("\n").trim();
    const acceptanceCriteria = sections.get("Acceptance Criteria")?.join("\n").trim();
    if (!requirements || !acceptanceCriteria) {
      throw new Error(
        `Expected non-empty Requirements and Acceptance Criteria sections in ${path}.`,
      );
    }
    return { requirements, acceptanceCriteria };
  }

  private static hasCode(error: unknown, code: string): boolean {
    return error instanceof Error && "code" in error && error.code === code;
  }
}
