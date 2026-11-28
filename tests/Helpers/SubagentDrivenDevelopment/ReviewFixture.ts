import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { dispatchFixture } from "@test/Helpers/SubagentDrivenDevelopment/DispatchFixture";

export async function reviewFixture() {
  const fixture = await dispatchFixture();
  const { featureFlag, git, invoke } = fixture;
  const task = fixture.task("first.ts", "--write-scope", ".spindle/review-notes.md");
  const { worktree }: { worktree: string } = fixture.startTicket();
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  const complete = async (id: string, file: string) => {
    invoke("dispatch", ...featureFlag, "--task", id);
    await writeFile(join(worktree, file), `${file}\n`);
    invoke("task", "submit", ...featureFlag, "--task", id, "--attempt", "1");
    invoke("ticket", "commit", ...featureFlag, "--ticket", "T-0001", "--message", `Add ${file}`);
  };
  const startReview = () => invoke("review", ...featureFlag, "--ticket", "T-0001").review as string;
  const submitReview = (review: string, recommendation: string, ...args: string[]) =>
    invoke(
      "review",
      "submit",
      ...featureFlag,
      "--review",
      review,
      "--recommendation",
      recommendation,
      ...args,
    );
  const reportFinding = (review: string) =>
    submitReview(
      review,
      "changes-required",
      "--finding",
      "Missing assertion",
      "major",
      "first.ts",
      "Done",
      "No assertion ran",
      "Add an assertion",
    ).findings[0] as string;
  const integrateTicket = (ticketId: string) => {
    const started = invoke("integrate", ...featureFlag, "--ticket", ticketId);
    const assignment = invoke(
      "assignment",
      "--feature",
      fixture.workspace,
      "--merge",
      started.operationId,
    );
    git(
      "-C",
      assignment.target.worktree,
      "merge",
      "--no-ff",
      "--no-edit",
      assignment.source.branch,
    );
    invoke("merge", "record", ...featureFlag, "--merge", started.operationId);
    git("worktree", "remove", "--", assignment.source.worktree);
    git("-C", assignment.target.worktree, "branch", "-d", "--", assignment.source.branch);
    invoke("merge", "record", ...featureFlag, "--merge", started.operationId);
  };
  const completeDocumentation = async () => {
    const { ticket } = invoke(
      "ticket",
      "create",
      ...featureFlag,
      "--documentation",
      "--title",
      "Finalize domain documentation",
      "--requirements",
      "Check the combined feature domain documentation.",
      "--acceptance-criteria",
      "Update the documentation or explain why no changes are needed.",
    );
    const { task } = invoke(
      "task",
      "create",
      ...featureFlag,
      "--ticket",
      ticket,
      "--instructions",
      "Load public-ref-domain-modeling and check the combined feature.",
      "--write-scope",
      "GLOSSARY.md",
    );
    invoke("ticket", "start", ...featureFlag, "--ticket", ticket);
    invoke("dispatch", ...featureFlag, "--task", task);
    invoke(
      "task",
      "submit",
      ...featureFlag,
      "--task",
      task,
      "--attempt",
      "1",
      "--comment",
      "The domain documentation needs no changes.",
    );
    invoke(
      "ticket",
      "commit",
      ...featureFlag,
      "--ticket",
      ticket,
      "--message",
      "Check domain docs",
    );
    const { review } = invoke("review", ...featureFlag, "--ticket", ticket);
    submitReview(review, "pass");
    integrateTicket(ticket);
    return { ticket, task };
  };
  return {
    ...fixture,
    worktree,
    complete,
    initialTask: task,
    startReview,
    submitReview,
    reportFinding,
    integrateTicket,
    completeDocumentation,
  };
}
