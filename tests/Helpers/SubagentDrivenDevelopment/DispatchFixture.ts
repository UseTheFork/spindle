import { startFixture } from "@test/Helpers/SubagentDrivenDevelopment/StartFixture";
import { expect } from "vitest";

export async function dispatchFixture() {
  const fixture = await startFixture("repo with spaces");
  const invoke = (...args: string[]) => {
    const result = fixture.run(...args);
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout).data;
  };
  const ticket = "T-0001";
  const featureFlag = ["--feature", fixture.name];
  fixture.createTicket();
  invoke("start", ...featureFlag);
  const task = (path: string, ...args: string[]) =>
    invoke(
      "task",
      "create",
      ...featureFlag,
      "--ticket",
      ticket,
      "--instructions",
      "Edit the schema.",
      "--write-scope",
      path,
      ...args,
    ).task as string;
  return {
    ...fixture,
    invoke,
    featureFlag,
    task,
    startTicket: () => invoke("ticket", "start", ...featureFlag, "--ticket", ticket),
  };
}
