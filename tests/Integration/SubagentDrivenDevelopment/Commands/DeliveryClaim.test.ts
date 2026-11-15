import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

import { runCli } from "../../../Helpers/Cli";
import {
  prepareIntegratedTicket,
  prepareReviewedTicket,
} from "../../../Helpers/SubagentDrivenDevelopment/helpers";

vi.setConfig({ testTimeout: 60_000 });

function sdd(repo: string, ...args: string[]) {
  return runCli(repo, ["sdd", ...args], process.env.PATH ?? "");
}

test("next identifies unclaimed delivery as the next step", async () => {
  const { repo, spec } = await prepareIntegratedTicket();
  const feature = spec.replace(/\/spec\.md$/, "");
  const settingsPath = join(repo, ".spindle", "config.json");
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  settings.spindle_package_manager = "npm run";
  writeFileSync(settingsPath, JSON.stringify(settings));
  const next = sdd(repo, "next", "--feature", feature);
  expect(next.status, next.stderr).toBe(0);
  expect(next.stdout).toContain("delivery:claim");
  expect(next.stdout).toContain("Next: npm run spindle sdd claim");
  const status = sdd(repo, "status", "--feature", feature);
  expect(status.status, status.stderr).toBe(0);
  expect(status.stdout).toContain("Next: npm run spindle sdd claim");
});

test.each([
  ["checks", "require", "--command", "test"],
  ["review", "require", "--type", "sdd-code-reviewer", "--details", "Review compatibility"],
  ["review"],
  ["resume", "--confirm-handoff"],
])("delivery command %s does not claim ownership implicitly", async (...command) => {
  const { repo, spec } = await prepareIntegratedTicket();
  const feature = spec.replace(/\/spec\.md$/, "");
  const result = sdd(
    repo,
    ...command,
    "--feature",
    feature,
    "--scope",
    "delivery",
    "--actor",
    "controller",
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/claim.*delivery|delivery.*claim/i);
  const ledger = JSON.parse(readFileSync(join(feature, "sdd.json"), "utf8"));
  expect(ledger.delivery.owner).toBeUndefined();
});

test("claim records delivery ownership and requires an explicit confirmed handoff", async () => {
  const { repo, spec, git } = await prepareIntegratedTicket();
  const feature = spec.replace(/\/spec\.md$/, "");
  const claim = () =>
    sdd(repo, "claim", "--feature", feature, "--scope", "delivery", "--actor", "controller");
  const first = claim();
  expect(first.status, first.stderr).toBe(0);
  expect(first.stdout).toMatch(/delivery ownership recorded.*controller/i);
  const repeated = claim();
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(repeated.stdout).toMatch(/ownership already recorded/i);

  const conflict = sdd(
    repo,
    "claim",
    "--feature",
    feature,
    "--scope",
    "delivery",
    "--actor",
    "other",
  );
  expect(conflict.status).not.toBe(0);
  expect(conflict.stderr).toMatch(/controller/);
  expect(conflict.stderr).toMatch(/other/);
  expect(conflict.stderr).toMatch(/resume.*--confirm-handoff/s);

  const review = sdd(
    repo,
    "review",
    "--feature",
    feature,
    "--scope",
    "delivery",
    "--actor",
    "other",
  );
  expect(review.status).not.toBe(0);
  expect(review.stderr).toMatch(/controller/);
  expect(review.stderr).toMatch(/other/);
  expect(review.stderr).toMatch(/resume.*--confirm-handoff/s);
  const ledger = JSON.parse(readFileSync(join(feature, "sdd.json"), "utf8"));
  expect(ledger.delivery.owner).toBe("controller");
  expect(
    ledger.delivery.history.filter(
      (item: { action: string }) => item.action === "controller-claimed",
    ),
  ).toHaveLength(1);
  const settingsPath = join(repo, ".spindle", "config.json");
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  settings.spindle_package_manager = "npm run";
  writeFileSync(settingsPath, JSON.stringify(settings));
  git("add", ".spindle/config.json");
  git("commit", "-qm", "configure package manager");
  const handoff = sdd(
    repo,
    "resume",
    "--feature",
    feature,
    "--scope",
    "delivery",
    "--actor",
    "other",
    "--confirm-handoff",
  );
  expect(handoff.status, handoff.stderr).toBe(0);
  expect(handoff.stdout).toContain("npm run spindle sdd checks require");
  const updated = JSON.parse(readFileSync(join(feature, "sdd.json"), "utf8"));
  expect(updated.delivery.owner).toBe("other");
});

test("delivery cannot be claimed while a ticket remains incomplete", async () => {
  const { repo, spec } = await prepareReviewedTicket();
  const feature = spec.replace(/\/spec\.md$/, "");
  const result = sdd(
    repo,
    "claim",
    "--feature",
    feature,
    "--scope",
    "delivery",
    "--actor",
    "controller",
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/ticket.*(closed|integrated|complete)/i);
  const ledger = JSON.parse(readFileSync(join(feature, "sdd.json"), "utf8"));
  expect(ledger.delivery.owner).toBeUndefined();
});
