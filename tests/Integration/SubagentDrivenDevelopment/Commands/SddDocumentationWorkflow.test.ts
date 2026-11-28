import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { projectSettingsSchema } from "@spindle/Settings/Models/ProjectSettings";
import { SddNextCommand } from "@spindle/SubagentDrivenDevelopment/Commands/SddNextCommand";
import { FeatureWorkspaceService } from "@spindle/SubagentDrivenDevelopment/Services/FeatureWorkspaceService";
import { MergeOperationService } from "@spindle/SubagentDrivenDevelopment/Services/MergeOperationService";
import { SddReviewService } from "@spindle/SubagentDrivenDevelopment/Services/SddReviewService";
import { TaskDispatchService } from "@spindle/SubagentDrivenDevelopment/Services/TaskDispatchService";
import { TicketCommitService } from "@spindle/SubagentDrivenDevelopment/Services/TicketCommitService";
import { WorktreeStartService } from "@spindle/SubagentDrivenDevelopment/Services/WorktreeStartService";
import { applicationFixture } from "@test/Helpers/ApplicationFixture";
import { runCliRaw } from "@test/Helpers/Cli";
import { fixture } from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import { repoRoot } from "@test/Helpers/TemporaryDirectories";
import { expect, test } from "vitest";

const name = "0001-documentation";
const ticketInput = {
  title: "Finalize documentation",
  requirements: "Check the combined feature with public-ref-domain-modeling.",
  acceptanceCriteria: "Update its domain documentation or explain why no changes are needed.",
  dependencies: [],
};

async function documentationFixture() {
  const { repo, git } = fixture();
  await writeFile(join(repo, "GLOSSARY.md"), "**Feature**:\nA planned change.\n");
  git("add", "GLOSSARY.md");
  git("commit", "-qm", "Add the domain glossary");
  const app = applicationFixture(repo, join(repoRoot, "assets/Blueprints"), {
    status: "valid",
    data: projectSettingsSchema.parse({
      stacks: ["python"],
      sdd: { worktree_directory: "../worktrees", setup_command: [] },
    }),
  });
  await app.boot();
  const workspace = await app.make(FeatureWorkspaceService);
  const start = await app.make(WorktreeStartService);
  const dispatch = await app.make(TaskDispatchService);
  const commits = await app.make(TicketCommitService);
  const reviews = await app.make(SddReviewService);
  const merges = await app.make(MergeOperationService);
  const next = await app.make(SddNextCommand);
  await workspace.create({
    name,
    specification: "Implement the feature and document its domain.",
    design: "Use the existing implementation.",
  });
  const featurePath = app.featuresPath(name);
  const ledgerPath = join(featurePath, "sdd.json");
  const implementation = await workspace.createTicket(name, {
    ...ticketInput,
    title: "Implementation",
  });
  const initial = await workspace.createTask(name, implementation.ticket, {
    instructions: "Implement the feature.",
    writeScope: ["first.ts"],
    dependencies: [],
  });
  const feature = await start.start(name);
  const implementationWorktree = (await start.start(name, implementation.ticket)).worktree;

  const passTicket = async (ticketId: string) => {
    const review = await reviews.start(name, { type: "ticket", ticketId }, "Acceptance");
    await reviews.submit(name, review.review, "pass", []);
  };
  const beginIntegration = async (ticketId: string) => {
    const operation = await merges.integrate(name, ticketId);
    const assignment = await merges.assignment(featurePath, operation.operationId);
    git(
      "-C",
      assignment.target.worktree,
      "merge",
      "--no-ff",
      "--no-edit",
      assignment.source.branch,
    );
    await merges.record(name, operation.operationId);
    return { operation, assignment };
  };
  const finishIntegration = async ({
    operation,
    assignment,
  }: Awaited<ReturnType<typeof beginIntegration>>) => {
    git("worktree", "remove", "--", assignment.source.worktree);
    git("-C", assignment.target.worktree, "branch", "-d", "--", assignment.source.branch);
    await merges.record(name, operation.operationId);
  };
  const integrate = async (ticketId: string) => finishIntegration(await beginIntegration(ticketId));
  const submitAndCommit = async (ticket: string, task: string, attempt = 1) => {
    await dispatch.submit(
      name,
      task,
      attempt,
      "Checked domain documentation; no further updates are needed.",
    );
    await commits.commit(name, ticket, "Finalize ticket work");
  };
  const completeImplementation = async () => {
    await dispatch.dispatch(name, initial.task);
    await writeFile(join(implementationWorktree, "first.ts"), "implemented\n");
    await submitAndCommit(implementation.ticket, initial.task);
    await passTicket(implementation.ticket);
    await integrate(implementation.ticket);
  };
  const prepareDocumentation = async () => {
    const { ticket } = await workspace.createTicket(name, { ...ticketInput, documentation: true });
    const { task } = await workspace.createTask(name, ticket, {
      instructions:
        "Load public-ref-domain-modeling. Check and update the combined feature documentation.",
      writeScope: ["GLOSSARY.md"],
      dependencies: [],
    });
    const { worktree } = await start.start(name, ticket);
    const dispatched = await dispatch.dispatch(name, task);
    const assignment = await dispatch.assignment(featurePath, task, dispatched.attempt);
    return { ticket, task, worktree, dispatched, assignment };
  };
  const completeDocumentation = async () => {
    const documentation = await prepareDocumentation();
    await submitAndCommit(documentation.ticket, documentation.task);
    await passTicket(documentation.ticket);
    await integrate(documentation.ticket);
    return documentation;
  };
  return {
    repo,
    git,
    workspace,
    start,
    dispatch,
    reviews,
    merges,
    next,
    featurePath,
    ledgerPath,
    featureWorktree: feature.worktree,
    completeImplementation,
    prepareDocumentation,
    completeDocumentation,
    submitAndCommit,
    passTicket,
    beginIntegration,
    finishIntegration,
    integrate,
  };
}

test("guides read-only documentation creation and blocks direct feature review and finish without coverage", async () => {
  const f = await documentationFixture();
  const args = [
    "sdd",
    "ticket",
    "create",
    "--feature",
    name,
    "--documentation",
    "--title",
    ticketInput.title,
    "--requirements",
    ticketInput.requirements,
    "--acceptance-criteria",
    ticketInput.acceptanceCriteria,
    "--json",
  ];
  const before = await readFile(f.ledgerPath, "utf8");
  const early = runCliRaw(f.repo, args, process.env.PATH ?? "");
  expect(early.status).toBe(1);
  expect(early.stderr).toContain("Integrate all existing tickets");
  expect(await readFile(f.ledgerPath, "utf8")).toBe(before);
  await f.completeImplementation();
  const readyLedger = await readFile(f.ledgerPath, "utf8");
  const ready = await f.next.run(name);
  expect(ready.documentation?.state).toBe("Missing");
  expect(ready.actions.join("\n")).toContain(
    "ticket create --feature 0001-documentation --documentation",
  );
  expect(ready.actions).not.toContain(`spindle sdd review --feature ${name} --target feature`);
  expect(await readFile(f.ledgerPath, "utf8")).toBe(readyLedger);
  await expect(f.reviews.start(name, { type: "feature" }, "Feature")).rejects.toThrow(
    "final documentation ticket",
  );
  await expect(f.merges.finish(name)).rejects.toThrow("final documentation ticket");

  const created = runCliRaw(f.repo, args, process.env.PATH ?? "");
  expect(created.status, created.stderr).toBe(0);
  const feature = await f.workspace.load(name);
  const ticket = feature.tickets.at(-1);
  expect(ticket).toMatchObject({ id: "T-0002", documentation: {}, tasks: [] });
  expect((await f.next.run(name)).notices.join("\n")).toContain("--write-scope");
  await expect(f.workspace.createTicket(name, ticketInput)).rejects.toThrow(
    "active documentation ticket",
  );
  await expect(
    f.workspace.createTicket(name, { ...ticketInput, documentation: true }),
  ).rejects.toThrow("Integrate all existing tickets");
  await f.workspace.createTask(name, "T-0002", {
    instructions: "Check documentation.",
    writeScope: ["GLOSSARY.md"],
    dependencies: [],
  });
  await expect(
    f.workspace.createTask(name, "T-0002", {
      instructions: "Duplicate documentation work.",
      writeScope: ["other.md"],
      dependencies: [],
    }),
  ).rejects.toThrow("one initial task");
});

test("accepts no-change documentation and invalidates it even when later commits keep the same code", async () => {
  const f = await documentationFixture();
  await f.completeImplementation();
  const tree = f.git("-C", f.featureWorktree, "rev-parse", "HEAD^{tree}");
  const documentation = await f.completeDocumentation();
  const current = await f.next.run(name);
  expect(current.documentation).toMatchObject({
    state: "Current",
    ticket: documentation.ticket,
    coveredCommit: f.git("-C", f.featureWorktree, "rev-parse", "HEAD"),
  });
  expect(f.git("-C", f.featureWorktree, "rev-parse", "HEAD^{tree}")).toBe(tree);
  expect(current.actions.join("\n")).not.toContain("--documentation");
  expect(current.actions).toContain(`spindle sdd review --feature ${name} --target feature`);
  await expect(
    f.workspace.createTicket(name, { ...ticketInput, documentation: true }),
  ).rejects.toThrow("already covers");
  const review = await f.reviews.start(name, { type: "feature" }, "Feature");
  await f.reviews.submit(name, review.review, "pass", []);
  expect((await f.next.run(name)).actions).toContain(`spindle sdd finish --feature ${name}`);

  f.git("-C", f.featureWorktree, "commit", "--allow-empty", "-m", "Later feature change");
  const stale = await f.next.run(name);
  expect(stale.documentation?.state).toBe("Stale");
  expect(stale.featureReview?.state).toBe("Accepted");
  expect(stale.actions.join("\n")).toContain("--documentation");
  expect(stale.actions).not.toContain(`spindle sdd finish --feature ${name}`);
  await expect(f.merges.finish(name)).rejects.toThrow("final documentation ticket");
  await expect(f.reviews.start(name, { type: "feature" }, "Feature")).rejects.toThrow(
    "final documentation ticket",
  );
  await f.completeDocumentation();
  expect((await f.next.run(name)).documentation?.state).toBe("Current");
  const finish = await f.merges.finish(name);
  expect(finish.type).toBe("feature-finish");
  expect((await f.next.run(name)).actions.join("\n")).toContain(`--merge ${finish.operationId}`);
});

test("routes documentation updates with a pinned feature context and preserves retry and merge recovery contracts", async () => {
  const f = await documentationFixture();
  await f.completeImplementation();
  const featureCommit = f.git("-C", f.featureWorktree, "rev-parse", "HEAD");
  const documentation = await f.prepareDocumentation();
  expect(documentation.dispatched).toMatchObject({ agent: "sdd-documentation-agent", attempt: 1 });
  expect(documentation.assignment).toMatchObject({
    role: "worker",
    agent: "sdd-documentation-agent",
    worktree: documentation.worktree,
    specification: "Implement the feature and document its domain.",
    design: "Use the existing implementation.",
    documentation: {
      requiredSkill: "public-ref-domain-modeling",
      featureCommit,
      changedFiles: ["first.ts"],
      domainContext: ["GLOSSARY.md"],
    },
  });
  expect((await f.next.run(name)).tickets.at(-1)?.tasks[0].agent).toBe("sdd-documentation-agent");
  await f.dispatch.checkpoint(name, documentation.task, 1, {
    phase: "checking",
    summary: "The glossary needs an update.",
    next: "Update the feature term.",
  });
  await f.dispatch.dispatch(name, documentation.task, 1);
  await expect(f.dispatch.assignment(f.featurePath, documentation.task, 1)).rejects.toThrow(
    "Attempt",
  );
  const retry = await f.dispatch.assignment(f.featurePath, documentation.task, 2);
  expect(retry.documentation?.featureCommit).toBe(featureCommit);
  await writeFile(
    join(documentation.worktree, "GLOSSARY.md"),
    "**Feature**:\nAn approved implementation and its documentation.\n",
  );
  await expect(f.dispatch.submit(name, documentation.task, 1)).rejects.toThrow("Attempt");
  await f.submitAndCommit(documentation.ticket, documentation.task, 2);
  const review = await f.reviews.start(
    name,
    { type: "ticket", ticketId: documentation.ticket },
    "Domain documentation",
  );
  const result = await f.reviews.submit(name, review.review, "changes-required", [
    {
      title: "Missing scope",
      severity: "major",
      location: "GLOSSARY.md",
      criterion: ticketInput.acceptanceCriteria,
      evidence: "The definition omits the combined feature scope.",
      suggestedFix: "Include the combined feature scope.",
    },
  ]);
  const fix = await f.workspace.createFindingFixTask(name, result.findings[0], {
    instructions: "Include the combined feature scope.",
    writeScope: ["GLOSSARY.md"],
    dependencies: [documentation.task],
  });
  await f.dispatch.dispatch(name, fix.task);
  expect((await f.dispatch.assignment(f.featurePath, fix.task, 1)).agent).toBe(
    "sdd-documentation-agent",
  );
  await writeFile(
    join(documentation.worktree, "GLOSSARY.md"),
    "**Feature**:\nAn approved implementation and its documentation for the combined change.\n",
  );
  await f.submitAndCommit(documentation.ticket, fix.task);
  await f.passTicket(documentation.ticket);
  const operation = await f.beginIntegration(documentation.ticket);
  expect((await f.next.run(name)).actions.join("\n")).toContain(
    `--merge ${operation.operation.operationId}`,
  );
  expect((await f.merges.integrate(name, documentation.ticket)).operationId).toBe(
    operation.operation.operationId,
  );
  await f.finishIntegration(operation);
  expect((await f.next.run(name)).documentation?.state).toBe("Current");
  expect(await readFile(join(f.featureWorktree, "GLOSSARY.md"), "utf8")).toContain(
    "approved implementation",
  );
});

test("does not count documentation based on an older feature tip and allows a fresh final task", async () => {
  const f = await documentationFixture();
  await f.completeImplementation();
  const documentation = await f.prepareDocumentation();
  const originalBase = documentation.assignment.documentation?.featureCommit;
  f.git("-C", f.featureWorktree, "commit", "--allow-empty", "-m", "Unexpected feature change");
  expect(
    (await f.dispatch.assignment(f.featurePath, documentation.task, 1)).documentation
      ?.featureCommit,
  ).toBe(originalBase);
  await f.submitAndCommit(documentation.ticket, documentation.task);
  await f.passTicket(documentation.ticket);
  await f.integrate(documentation.ticket);
  expect((await f.next.run(name)).documentation?.state).toBe("Stale");
  await expect(f.reviews.start(name, { type: "feature" }, "Feature")).rejects.toThrow(
    "final documentation ticket",
  );
  await f.completeDocumentation();
  expect((await f.next.run(name)).documentation?.state).toBe("Current");
});
