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
  return { ...fixture, worktree, complete, initialTask: task };
}
