import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { Service } from "@spindle/Foundation/Service";
import { GitService } from "@spindle/Git/Services/GitService";
import type { DeliveryDetails } from "@spindle/SubagentDrivenDevelopment/Models/DeliveryDetails";
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
type NewDeliveryTask = NewTask &
  Pick<Task, "deliveryMerge"> & { deliveryMerge: NonNullable<Task["deliveryMerge"]> };
type TicketUpdate = Partial<
  Pick<Ticket, "title" | "requirements" | "acceptanceCriteria" | "dependencies">
>;
type TaskUpdate = Partial<Pick<Task, "instructions" | "writeScope" | "context" | "dependencies">>;
type ReviewFinding = Extract<Finding, { type: "review" }>;
type DeliverySnapshot = {
  originalBranch: string;
  featureBranch: string;
  featureCommit: string;
  originalCommit: string;
  requiredWriteScope: string[];
};
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
    const ledgerRepositoryRoot = await realpath(this.app.workspaceRoot);
    const ledger: FeatureLedger = {
      version: 1,
      ledgerRepositoryRoot,
      tickets: [],
      findings: [],
      reviewRounds: [],
    };
    const feature = featureSchema.parse({
      name: input.name,
      ledgerRepositoryRoot,
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
    const { name, workspace } = await this.workspaceLocation(reference);
    return this.assemble(name, workspace, await this.readLedger(workspace));
  }

  public async createTicket(reference: string, input: NewTicket) {
    this.assertApplicationBooted();
    return this.withLedger(reference, async (ledger, name, workspace) => {
      return this.createTicketRecord(ledger, name, workspace, input);
    });
  }

  public async updateTicket(reference: string, ticketId: string, input: TicketUpdate) {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new Error("Specify at least one ticket field to update.");
    }
    return this.withLedger(reference, async (ledger, name, workspace) => {
      const ticket = ledger.tickets.find(({ id }) => id === ticketId);
      if (!ticket) throw new Error(`Unknown ticket '${ticketId}'.`);
      if (ticket.merged) throw new Error(`Cannot update merged ticket '${ticketId}'.`);
      const requirementsPath = join(workspace, "tickets", `${ticketId}.md`);
      const markdown = await this.readRecord(requirementsPath);
      const current = this.ticketRequirements(markdown, requirementsPath);
      const title = input.title?.trim() ?? ticket.title;
      const requirements =
        input.requirements?.trim().replaceAll("\r\n", "\n") ?? current.requirements;
      const acceptanceCriteria =
        input.acceptanceCriteria?.trim().replaceAll("\r\n", "\n") ?? current.acceptanceCriteria;
      if (!title || /[\r\n]/.test(title)) {
        throw new Error("Ticket title must be a non-empty single line.");
      }
      const changesCriteria =
        input.requirements !== undefined || input.acceptanceCriteria !== undefined;
      if (
        changesCriteria &&
        ticket.tasks.some(({ state, attempt }) => state !== "Pending" || attempt > 0)
      ) {
        throw new Error(
          "Ticket requirements and acceptance criteria cannot change after a task is dispatched.",
        );
      }
      if (!requirements || !acceptanceCriteria) {
        throw new Error("Ticket requirements and acceptance criteria must not be empty.");
      }
      const nextMarkdown = this.updateTicketMarkdown(
        markdown,
        title,
        requirements,
        acceptanceCriteria,
        requirementsPath,
      );
      const dependencies = input.dependencies ?? ticket.dependencies;
      const next = featureLedgerSchema.parse({
        ...ledger,
        tickets: ledger.tickets.map((candidate) =>
          candidate.id === ticketId ? { ...candidate, title, dependencies } : candidate,
        ),
      });
      await this.assemble(name, workspace, next, { id: ticketId, markdown: nextMarkdown });
      await this.replaceRecord(requirementsPath, nextMarkdown);
      try {
        await this.replaceLedger(workspace, next);
      } catch (error) {
        try {
          await this.replaceRecord(requirementsPath, markdown);
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            `Ticket '${ticketId}' update failed and its Markdown rollback also failed.`,
          );
        }
        throw error;
      }
      return { ticket: ticketId, path: requirementsPath };
    });
  }

  public async addTicketComment(reference: string, ticketId: string, comment: string) {
    this.assertApplicationBooted();
    const normalizedComment = comment.trim().replaceAll("\r\n", "\n");
    if (!normalizedComment) throw new Error("Ticket comment must not be empty.");
    return this.withLedger(reference, async (ledger, name, workspace) => {
      const ticket = ledger.tickets.find(({ id }) => id === ticketId);
      if (!ticket) throw new Error(`Unknown ticket '${ticketId}'.`);
      if (ticket.merged) throw new Error(`Cannot comment on merged ticket '${ticketId}'.`);
      const path = join(workspace, "tickets", `${ticketId}.md`);
      const markdown = await this.readRecord(path);
      const updated = this.appendTicketComment(markdown, normalizedComment, path);
      await this.assemble(name, workspace, ledger, { id: ticketId, markdown: updated });
      await this.replaceRecord(path, updated);
      return { ticket: ticketId, path };
    });
  }

  public async createDeliveryTicket(
    reference: string,
    snapshot: DeliverySnapshot,
    input: { writeScope: string[] },
  ) {
    this.assertApplicationBooted();
    return this.withLedger(reference, async (ledger, name, workspace) => {
      if (ledger.pendingStart) throw new Error("Resume the pending start before delivery.");
      const feature = await this.assemble(name, workspace, ledger);
      if (
        feature.completed ||
        !feature.originalBranch ||
        !feature.featureBranch ||
        !feature.featureWorktree
      ) {
        throw new Error(`Feature '${feature.name}' is not active.`);
      }
      if (
        feature.originalBranch !== snapshot.originalBranch ||
        feature.featureBranch !== snapshot.featureBranch
      ) {
        throw new Error("The feature branches changed while preparing the delivery ticket.");
      }
      if (!feature.tickets.length || feature.tickets.some(({ merged }) => !merged)) {
        throw new Error("Integrate all feature tickets before creating a delivery ticket.");
      }
      if (feature.findings.some((finding) => finding.decision.status === "open")) {
        throw new Error("Resolve all findings before creating a delivery ticket.");
      }
      const reviews = await this.app.make(SddReviewService);
      if (!reviews.hasPassedFeatureReview(feature)) {
        throw new Error("A feature review round must pass before creating a delivery ticket.");
      }
      const reviewStatus = await reviews.featureStatus(feature);
      if ("blocker" in reviewStatus) throw new Error(reviewStatus.blocker);
      if (reviewStatus.state !== "Accepted") {
        throw new Error("The current feature revision must pass feature review before delivery.");
      }
      const git = await this.app.make(GitService);
      await git.requireWorktreeBranch(feature.featureWorktree, feature.featureBranch);
      const featureHead = this.git(git, feature.featureWorktree, ["rev-parse", "--verify", "HEAD"]);
      const featureBranchHead = this.git(git, this.app.workspaceRoot, [
        "rev-parse",
        "--verify",
        `refs/heads/${feature.featureBranch}`,
      ]);
      const originalHead = this.git(git, this.app.workspaceRoot, [
        "rev-parse",
        "--verify",
        `refs/heads/${feature.originalBranch}`,
      ]);
      if (
        featureHead !== snapshot.featureCommit ||
        featureBranchHead !== snapshot.featureCommit ||
        originalHead !== snapshot.originalCommit
      ) {
        throw new Error("A branch moved while preparing the delivery ticket. Run sdd next again.");
      }
      const missing = snapshot.requiredWriteScope.filter(
        (path) => !input.writeScope.includes(path),
      );
      if (missing.length > 0) {
        throw new Error(
          `Delivery task scope must cover all incoming paths: ${JSON.stringify(missing)}`,
        );
      }
      const task: NewDeliveryTask = {
        instructions: `Merge the assigned ${feature.originalBranch} commit into this ticket branch with a no-fast-forward merge. Resolve conflicts only within the assigned write scope, create the merge commit, run focused checks, and summarize the outcome when submitting the task.`,
        writeScope: input.writeScope,
        dependencies: [],
        deliveryMerge: { originalBranch: feature.originalBranch },
      };
      return this.createTicketRecord(
        ledger,
        name,
        workspace,
        {
          title: "Integrate the original branch",
          requirements: `Include the latest ${feature.originalBranch} branch tip in the feature before final delivery.`,
          acceptanceCriteria: `The delivery task creates a verified merge of ${feature.originalBranch} within its assigned write scope.`,
          dependencies: [],
        },
        {
          delivery: {
            originalBranch: feature.originalBranch,
            baseCommit: snapshot.featureCommit,
            sourceCommit: snapshot.originalCommit,
          },
          task,
        },
      );
    });
  }

  private async createTicketRecord(
    ledger: FeatureLedger,
    name: string,
    workspace: string,
    input: NewTicket,
    options: { delivery?: DeliveryDetails; task?: NewDeliveryTask } = {},
  ) {
    const title = input.title.trim();
    const requirements = input.requirements.trim().replaceAll("\r\n", "\n");
    const acceptanceCriteria = input.acceptanceCriteria.trim().replaceAll("\r\n", "\n");
    if (!title || /[\r\n]/.test(title))
      throw new Error("Ticket title must be a non-empty single line.");
    if (!requirements || !acceptanceCriteria) {
      throw new Error("Ticket requirements and acceptance criteria must not be empty.");
    }
    if ((options.delivery === undefined) !== (options.task === undefined)) {
      throw new Error("A delivery ticket requires delivery details and one merge task.");
    }

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
    if (parsed.requirements !== requirements || parsed.acceptanceCriteria !== acceptanceCriteria) {
      throw new Error(
        "Ticket requirements and acceptance criteria must not contain level 1 or 2 headings outside code fences.",
      );
    }
    const ticket: FeatureLedger["tickets"][number] = {
      id,
      title,
      dependencies: input.dependencies,
      tasks: [],
      workRoundCommits: [],
      merged: false,
      ...(options.delivery === undefined ? {} : { delivery: options.delivery }),
    };
    const task = options.task === undefined ? undefined : this.appendTask(ticket, options.task);
    const next = featureLedgerSchema.parse({ ...ledger, tickets: [...ledger.tickets, ticket] });
    await this.assemble(name, workspace, next, { id, markdown });
    await writeFile(path, markdown, { flag: "wx", flush: true });
    await this.replaceLedger(workspace, next);
    return { ticket: id, path, ...(task === undefined ? {} : { task }) };
  }

  public async createTask(reference: string, ticketId: string, input: NewTask) {
    if (!input.instructions.trim()) throw new Error("Task instructions must not be empty.");
    let taskId = "";
    await this.updateLedger(reference, async (ledger) => {
      const ticket = ledger.tickets.find(({ id }) => id === ticketId);
      if (!ticket) throw new Error(`Unknown ticket '${ticketId}'.`);
      if (ticket.merged) throw new Error(`Cannot add a task to merged ticket '${ticketId}'.`);
      if (
        ticket.delivery &&
        ticket.tasks.some(({ deliveryMerge, state }) => deliveryMerge && state !== "Done")
      ) {
        throw new Error(
          "Wait for the delivery merge task to finish before adding ticket fix work.",
        );
      }
      await (await this.app.make(SddReviewService)).assertOrdinaryTaskAllowed(ledger, ticket);
      taskId = this.appendTask(ticket, input);
      return ledger;
    });
    return { ticket: ticketId, task: taskId };
  }

  public async updateTask(reference: string, ticketId: string, taskId: string, input: TaskUpdate) {
    if (Object.values(input).every((value) => value === undefined)) {
      throw new Error("Specify at least one task field to update.");
    }
    let updated = false;
    await this.updateLedger(reference, async (ledger) => {
      const ticket = ledger.tickets.find(({ id }) => id === ticketId);
      if (!ticket) throw new Error(`Unknown ticket '${ticketId}'.`);
      if (ticket.merged) throw new Error(`Cannot update a task on merged ticket '${ticketId}'.`);
      const task = ticket.tasks.find(({ id }) => id === taskId);
      if (!task) throw new Error(`Unknown task '${taskId}' in ticket '${ticketId}'.`);
      if (task.state !== "Pending" || task.attempt > 0) {
        throw new Error(`Task '${taskId}' can only be updated before it is dispatched.`);
      }
      const instructions = input.instructions?.trim();
      if (instructions !== undefined && !instructions) {
        throw new Error("Task instructions must not be empty.");
      }
      if (input.writeScope !== undefined) {
        if (!task.deliveryMerge && input.writeScope.length === 0) {
          throw new Error("Ordinary tasks must retain at least one writable path.");
        }
        const requiredPaths: string[] = [];
        if (task.deliveryMerge) {
          if (!ticket.delivery) {
            throw new Error(`Delivery task '${taskId}' has no delivery ticket metadata.`);
          }
          const git = await this.app.make(GitService);
          const mergeBase = this.git(git, this.app.workspaceRoot, [
            "merge-base",
            ticket.delivery.baseCommit,
            ticket.delivery.sourceCommit,
          ]);
          requiredPaths.push(
            ...this.git(git, this.app.workspaceRoot, [
              "diff",
              "--no-renames",
              "--name-only",
              "-z",
              mergeBase,
              ticket.delivery.sourceCommit,
            ])
              .split("\0")
              .filter(Boolean),
          );
        }
        if (task.discoveredFrom) {
          const finding = ledger.findings.find(({ id }) => id === task.discoveredFrom);
          if (!finding)
            throw new Error(`Originating finding '${task.discoveredFrom}' was not found.`);
        }
        const uncovered = this.uncoveredPaths(requiredPaths, input.writeScope);
        if (uncovered.length > 0) {
          throw new Error(`Task scope must cover all required paths: ${JSON.stringify(uncovered)}`);
        }
      }
      Object.assign(task, {
        ...(instructions === undefined ? {} : { instructions }),
        ...(input.writeScope === undefined ? {} : { writeScope: input.writeScope }),
        ...(input.dependencies === undefined ? {} : { dependencies: input.dependencies }),
      });
      if (input.context !== undefined) {
        if (input.context.length === 0) delete task.context;
        else task.context = input.context;
      }
      updated = true;
      return ledger;
    });
    if (!updated) throw new Error(`Task '${taskId}' was not updated.`);
    return { ticket: ticketId, task: taskId };
  }

  public async removeTask(reference: string, ticketId: string, taskId: string) {
    let removed = false;
    await this.updateLedger(reference, (ledger) => {
      const ticket = ledger.tickets.find(({ id }) => id === ticketId);
      if (!ticket) throw new Error(`Unknown ticket '${ticketId}'.`);
      if (ticket.merged) throw new Error(`Cannot remove a task from merged ticket '${ticketId}'.`);
      const index = ticket.tasks.findIndex(({ id }) => id === taskId);
      if (index < 0) throw new Error(`Unknown task '${taskId}' in ticket '${ticketId}'.`);
      const task = ticket.tasks[index];
      if (task.state !== "Pending" || task.attempt > 0) {
        throw new Error(`Task '${taskId}' can only be removed before it is dispatched.`);
      }
      if (task.deliveryMerge) {
        throw new Error("The delivery merge task cannot be removed.");
      }
      if (ticket.tasks.some(({ dependencies }) => dependencies.includes(taskId))) {
        throw new Error(`Cannot remove task '${taskId}' while another task depends on it.`);
      }
      ticket.tasks.splice(index, 1);
      for (const finding of ledger.findings) {
        if (finding.fixWork?.type === "task" && finding.fixWork.taskId === taskId) {
          delete finding.fixWork;
        }
      }
      removed = true;
      return ledger;
    });
    if (!removed) throw new Error(`Task '${taskId}' was not removed.`);
    return { ticket: ticketId, task: taskId, removed: true };
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
      if (finding.decision.status !== "open" || finding.fixWork) {
        throw new Error(`Finding '${findingId}' must be open and have no existing fix work.`);
      }
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
        result = await this.createFeatureFindingFixTicket(ledger, workspace, name, finding, input);
        return;
      }
      const ticketId = round.target.ticketId;
      const ticket = ledger.tickets.find(({ id }) => id === ticketId);
      if (!ticket?.worktree || ticket.merged)
        throw new Error(`Ticket '${ticketId}' has no active worktree.`);
      if (
        ledger.reviewRounds.some(
          ({ target, reviews }) =>
            target.type === "ticket" &&
            target.ticketId === ticketId &&
            reviews.some(({ result }) => result === undefined),
        )
      )
        throw new Error(`Wait for all reviews on '${ticketId}' before creating fix work.`);
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
    input: NewTask & Pick<Task, "deliveryMerge" | "discoveredFrom">,
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

  private uncoveredPaths(paths: string[], writeScope: string[]): string[] {
    const scope = new Set(writeScope);
    return [...new Set(paths)].filter((path) => !scope.has(path));
  }

  private async workspaceLocation(reference: string): Promise<{ name: string; workspace: string }> {
    const name = basename(reference);
    const expectedWorkspace = this.app.featuresPath(name);
    if (reference !== name && resolve(this.app.workspaceRoot, reference) !== expectedWorkspace) {
      if (!isAbsolute(reference)) {
        throw new Error(
          "Feature directory must be under .spindle/features in the original checkout.",
        );
      }

      if (name !== name.trim() || !numberedWorkspace.test(name)) {
        throw new Error(`Invalid numbered feature workspace name: '${name}'.`);
      }
      const workspace = resolve(reference);
      const repositoryRoot = resolve(workspace, "..", "..", "..");
      if (resolve(repositoryRoot, ".spindle", "features", name) !== workspace) {
        throw new Error(
          "Feature directory must be under .spindle/features in the original checkout.",
        );
      }
      const ledger = await this.readLedger(
        workspace,
        `Feature ledger was not found at '${join(workspace, "sdd.json")}'.`,
      );
      const currentRoot = await realpath(this.app.workspaceRoot);
      const canonicalWorkspace = resolve(currentRoot, ".spindle", "features", name);
      if (
        (await realpath(repositoryRoot)) !== ledger.ledgerRepositoryRoot ||
        (await realpath(workspace)) !== canonicalWorkspace
      ) {
        throw new Error(
          "Feature directory must be under .spindle/features in the original checkout.",
        );
      }
      return { name, workspace };
    }

    try {
      return { name, workspace: await this.workspacePath(name) };
    } catch (error) {
      if (FeatureWorkspaceService.hasCode(error, "ENOENT")) {
        throw new Error(`Feature '${name}' was not found in this checkout.`, { cause: error });
      }
      throw error;
    }
  }

  private async readLedger(
    workspace: string,
    missingMessage = `Feature '${basename(workspace)}' was not found in this checkout.`,
  ): Promise<FeatureLedger> {
    const path = join(workspace, "sdd.json");
    let content: string;
    try {
      content = await this.readRecord(path);
    } catch (error) {
      if (FeatureWorkspaceService.hasCode(error, "ENOENT")) {
        throw new Error(missingMessage, { cause: error });
      }
      throw error;
    }
    let ledger: FeatureLedger;
    try {
      ledger = featureLedgerSchema.parse(JSON.parse(content));
    } catch (error) {
      throw new Error(`Invalid feature ledger at ${path}: ${String(error)}`, { cause: error });
    }
    const currentRoot = await realpath(this.app.workspaceRoot);
    if (ledger.ledgerRepositoryRoot !== currentRoot) {
      throw new Error(
        `Feature ledger belongs to repository '${ledger.ledgerRepositoryRoot}'. ` +
          `Run this command from '${ledger.ledgerRepositoryRoot}'.`,
      );
    }
    return ledger;
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
    options: {
      resumeTicketCommit?: boolean;
      resumeMergeOperation?: boolean;
    } = {},
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
    options: {
      resumeTicketCommit?: boolean;
      resumeMergeOperation?: boolean;
    } = {},
  ): Promise<T> {
    this.assertApplicationBooted();
    const { name, workspace } = await this.workspaceLocation(reference);
    return this.withLock(join(workspace, ".ledger-lock"), async () => {
      const ledger = await this.readLedger(workspace);
      if (ledger.completed) throw new Error(`Feature '${name}' is already complete.`);
      if (ledger.pendingTicketCommit && !options.resumeTicketCommit) {
        throw new Error(
          "Resume the pending ticket commit first. Run sdd next for the resume command.",
        );
      }
      if (ledger.pendingMergeOperation && !options.resumeMergeOperation) {
        throw new Error(
          "Resume the pending merge operation first. Run sdd next for the resume command.",
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
    const features = this.app.featuresPath();
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

  private async replaceRecord(path: string, content: string): Promise<void> {
    const temporary = await mkdtemp(join(dirname(path), ".ticket-"));
    try {
      const pending = join(temporary, "record.md");
      await writeFile(pending, content, { flag: "wx", flush: true });
      await rename(pending, path);
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

  private updateTicketMarkdown(
    markdown: string,
    title: string,
    requirements: string,
    acceptanceCriteria: string,
    path: string,
  ): string {
    const lines = markdown.split(/\r?\n/);
    if (!/^#\s+/.test(lines[0] ?? "")) {
      throw new Error(`Expected a level 1 ticket title in ${path}.`);
    }
    const headings: number[] = [];
    const targetHeadings = new Map<string, number>();
    let fence: string | undefined;
    for (let index = 0; index < lines.length; index++) {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[index]);
      if (fence) {
        if (marker && marker[1].startsWith(fence) && marker[2].trim() === "") fence = undefined;
      } else if (marker) {
        fence = marker[1];
      } else {
        const heading = /^ {0,3}#{1,2}[ \t]+(.+?)\s*$/.exec(lines[index]);
        if (!heading) continue;
        headings.push(index);
        if (heading[1] === "Requirements" || heading[1] === "Acceptance Criteria") {
          if (targetHeadings.has(heading[1])) {
            throw new Error(`Duplicate '${heading[1]}' heading in ${path}.`);
          }
          targetHeadings.set(heading[1], index);
        }
      }
    }
    const sections = [
      { label: "Requirements", content: requirements },
      { label: "Acceptance Criteria", content: acceptanceCriteria },
    ]
      .map((section) => ({ ...section, index: targetHeadings.get(section.label) }))
      .sort((left, right) => (right.index ?? -1) - (left.index ?? -1));
    for (const section of sections) {
      const sectionIndex = section.index;
      if (sectionIndex === undefined) {
        throw new Error(`Missing '${section.label}' heading in ${path}.`);
      }
      const end = headings.find((headingIndex) => headingIndex > sectionIndex) ?? lines.length;
      lines.splice(
        sectionIndex + 1,
        end - sectionIndex - 1,
        "",
        ...section.content.split("\n"),
        "",
      );
    }
    lines[0] = `# ${title}`;
    const updated = lines.join("\n");
    const parsed = this.ticketRequirements(updated, path);
    if (parsed.requirements !== requirements || parsed.acceptanceCriteria !== acceptanceCriteria) {
      throw new Error(
        "Ticket requirements and acceptance criteria must not contain level 1 or 2 headings outside code fences.",
      );
    }
    return updated;
  }

  private appendTicketComment(markdown: string, comment: string, path: string): string {
    const commentLines = comment.split("\n");
    let commentFence: string | undefined;
    for (const line of commentLines) {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (commentFence) {
        if (marker && marker[1].startsWith(commentFence) && marker[2].trim() === "") {
          commentFence = undefined;
        }
      } else if (marker) {
        commentFence = marker[1];
      } else if (/^ {0,3}#{1,2}[ \t]+/.test(line)) {
        throw new Error(
          "Ticket comments must not contain level 1 or 2 headings outside code fences.",
        );
      }
    }
    if (commentFence !== undefined) throw new Error("Ticket comments must close code fences.");

    const lines = markdown.split(/\r?\n/);
    const headings: number[] = [];
    let commentHeading: number | undefined;
    let fence: string | undefined;
    for (let index = 0; index < lines.length; index++) {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[index]);
      if (fence) {
        if (marker && marker[1].startsWith(fence) && marker[2].trim() === "") fence = undefined;
      } else if (marker) {
        fence = marker[1];
      } else {
        const heading = /^ {0,3}#{1,2}[ \t]+(.+?)\s*$/.exec(lines[index]);
        if (!heading) continue;
        headings.push(index);
        if (heading[1] === "Comments") {
          if (commentHeading !== undefined)
            throw new Error(`Duplicate 'Comments' heading in ${path}.`);
          commentHeading = index;
        }
      }
    }
    if (fence !== undefined) throw new Error(`Unclosed code fence in ${path}.`);
    if (commentHeading === undefined) {
      return `${markdown.trimEnd()}\n\n## Comments\n\n${comment}\n`;
    }

    const end = headings.find((heading) => heading > commentHeading) ?? lines.length;
    const existing = lines.slice(commentHeading + 1, end);
    while (existing.at(-1)?.trim() === "") existing.pop();
    return [
      ...lines.slice(0, commentHeading + 1),
      ...existing,
      "",
      ...commentLines,
      "",
      ...lines.slice(end),
    ].join("\n");
  }

  private static hasCode(error: unknown, code: string): boolean {
    return error instanceof Error && "code" in error && error.code === code;
  }
}
