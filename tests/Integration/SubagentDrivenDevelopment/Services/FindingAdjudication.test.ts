import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  commitTicketWorkspace,
  execute,
  prepareReviewAssignment,
  recordReviewCheck,
} from "@test/Helpers/SubagentDrivenDevelopment/helpers";
import type { WorkflowServices } from "@test/Helpers/SubagentDrivenDevelopment/WorkflowServices";
import { expect, test } from "vitest";

test("finding rulings persist, require evidence or rationale, and keep deferral from clearing blockers", async () => {
  const { repo, spec, command, assignment, ticketWorkspace } = await prepareReviewAssignment();
  writeFileSync(assignment.report, "# Review report\n\nRulings need explicit evidence.\n");
  const create = async (blocking: boolean, summary: string) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        ticket: "T-0001",
        assignment: assignment.id,
        blocking,
        nonBlocking: !blocking,
        summary,
        details: "Finding details.",
        author: "controller",
      }),
    );
  const blocking = await create(true, "Blocking finding");
  expect(blocking.status, blocking.stderr).toBe(0);
  const dismissible = await create(false, "Nonblocking finding");
  expect(dismissible.status, dismissible.stderr).toBe(0);
  const update = async (
    finding: string,
    status: string,
    extra: Partial<Parameters<WorkflowServices["findingService"]["findingUpdate"]>[0]> = {},
  ) =>
    await execute(repo, (service) =>
      service.findingService.findingUpdate({
        spec,
        ticket: "T-0001",
        finding,
        status,
        ...extra,
        author: "controller",
      }),
    );

  const confirmed = await update("F-0001", "confirmed", { details: "Confirmed as valid." });
  expect(confirmed.status, confirmed.stderr).toBe(0);
  expect(JSON.parse(confirmed.stdout).finding.status).toBe("confirmed");
  expect(
    JSON.stringify(
      JSON.parse(
        (await execute(repo, (service) => service.featureInspectionService.status({ spec })))
          .stdout,
      ).blockers,
    ),
  ).toMatch(/F-0001/);

  const beforeInvalidFix = readFileSync(
    join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"),
    "utf8",
  );
  const prematureFix = await update("F-0001", "fixed");
  expect(prematureFix.status).not.toBe(0);
  expect(prematureFix.stderr).toMatch(/committed change since every finding observation/i);
  expect(
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
  ).toBe(beforeInvalidFix);

  writeFileSync(join(ticketWorkspace, "feature.ts"), "export const feature = false;\n");
  commitTicketWorkspace(ticketWorkspace, "change finding evidence");
  const changedStatus = await execute(repo, (service) =>
    service.featureInspectionService.status({ spec }),
  );
  expect(changedStatus.status, changedStatus.stderr).toBe(0);
  const correctedHeadSha = JSON.parse(changedStatus.stdout).commits[0].headSha as string;
  expect(correctedHeadSha).not.toBe(assignment.headSha);
  const correctedCheck = await recordReviewCheck(repo, spec, command, "passed");
  expect(correctedCheck.status, correctedCheck.stderr).toBe(0);

  const fixed = await update("F-0001", "fixed");
  expect(fixed.status, fixed.stderr).toBe(0);
  expect(JSON.parse(fixed.stdout).finding.status).toBe("fixed");
  expect(JSON.parse(fixed.stdout).finding.verification.headSha).toBe(correctedHeadSha);

  const missingDismissal = await update("F-0001", "dismissed");
  expect(missingDismissal.status).not.toBe(0);
  expect(missingDismissal.stderr).toMatch(/--details/);
  const dismissed = await update("F-0001", "dismissed", {
    details: "The report's claim is incorrect because empty input is rejected.",
  });
  expect(dismissed.status, dismissed.stderr).toBe(0);
  expect(JSON.parse(dismissed.stdout).finding.status).toBe("dismissed");

  const prohibitedDeferral = await update("F-0001", "deferred", {
    details: "Postponed.",
    followUp: "T-0002",
  });
  expect(prohibitedDeferral.status).not.toBe(0);
  expect(prohibitedDeferral.stderr).toMatch(
    /blocking finding.*cannot be deferred|approved requirements decision/i,
  );

  const missingFollowUp = await update("F-0002", "deferred", { details: "Postponed for later." });
  expect(missingFollowUp.status).not.toBe(0);
  expect(missingFollowUp.stderr).toMatch(/--follow-up/);
  const deferred = await update("F-0002", "deferred", {
    details: "Postponed for later.",
    followUp: "T-0002",
  });
  expect(deferred.status, deferred.stderr).toBe(0);
  expect(JSON.parse(deferred.stdout).finding.status).toBe("deferred");
  expect(JSON.parse(deferred.stdout).finding.followUp).toBe("T-0002");

  const prohibitedStatus = await update("F-0002", "wontfix", { details: "Not doing this." });
  expect(prohibitedStatus.status).not.toBe(0);
  expect(prohibitedStatus.stderr).toMatch(/Invalid finding status/);

  const repeated = await update("F-0002", "deferred", {
    details: "Postponed for later.",
    followUp: "T-0002",
  });
  expect(repeated.status, repeated.stderr).toBe(0);
  expect(JSON.parse(repeated.stdout).idempotent).toBe(true);
  const persisted = JSON.parse(
    readFileSync(join(repo, ".spindle/features", "0001-ticket-flow", "sdd.json"), "utf8"),
  );
  expect(persisted.tickets[0].findings[0].status).toBe("dismissed");
  expect(persisted.tickets[0].findings[1].status).toBe("deferred");
  expect(persisted.tickets[0].findings[1].history.at(-1).author).toBe("controller");
});

test("a fresh linked observation reopens resolved findings and blocks integration until reverified", async () => {
  const { repo, spec, assignment } = await prepareReviewAssignment();
  const initialProvenance: unknown[] = [];
  writeFileSync(assignment.report, "# Initial review\n\nTwo findings require correction.\n");
  const createFinding = async (blocking: boolean, summary: string) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        ticket: "T-0001",
        assignment: assignment.id,
        blocking,
        nonBlocking: !blocking,
        summary,
        details: `${summary} was observed in the initial review.`,
        author: "controller",
      }),
    );

  const blocking = await createFinding(true, "Blocking recurrence");
  expect(blocking.status, blocking.stderr).toBe(0);
  const nonBlocking = await createFinding(false, "Nonblocking recurrence");
  expect(nonBlocking.status, nonBlocking.stderr).toBe(0);
  const firstCanonical = JSON.parse(blocking.stdout).finding;
  const secondCanonical = JSON.parse(nonBlocking.stdout).finding;
  initialProvenance.push(firstCanonical.provenance[0], secondCanonical.provenance[0]);

  const initialSubmission = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: assignment.id,
      result: "failed",
      details: "The blocking defect requires correction.",
      author: "controller",
    }),
  );
  expect(initialSubmission.status, initialSubmission.stderr).toBe(0);
  expect(JSON.parse(initialSubmission.stdout).execution).toBe("changes-requested");

  const update = async (
    finding: string,
    status: string,
    extra: Partial<Parameters<WorkflowServices["findingService"]["findingUpdate"]>[0]> = {},
  ) =>
    await execute(repo, (service) =>
      service.findingService.findingUpdate({
        spec,
        ticket: "T-0001",
        finding,
        status,
        ...extra,
        author: "controller",
      }),
    );
  const dismissedBlocking = await update("F-0001", "dismissed", {
    details: "The initial observation was invalid.",
  });
  expect(dismissedBlocking.status, dismissedBlocking.stderr).toBe(0);
  expect(JSON.parse(dismissedBlocking.stdout).finding.status).toBe("dismissed");
  const dismissed = await update("F-0002", "dismissed", {
    details: "The original nonblocking observation was not valid.",
  });
  expect(dismissed.status, dismissed.stderr).toBe(0);
  expect(JSON.parse(dismissed.stdout).finding.status).toBe("dismissed");

  const freshReview = await execute(repo, (service) =>
    service.reviewService.review({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(freshReview.status, freshReview.stderr).toBe(0);
  const freshAssignment = JSON.parse(freshReview.stdout).assignments[0] as {
    id: string;
    headSha: string;
    report: string;
  };
  expect(freshAssignment.id).not.toBe(assignment.id);
  expect(freshAssignment.headSha).toBe(assignment.headSha);
  writeFileSync(freshAssignment.report, "# Fresh review\n\nBoth observations recur.\n");

  const link = async (finding: string, blocking: boolean, summary: string) =>
    await execute(repo, (service) =>
      service.findingService.findingCreate({
        spec,
        ticket: "T-0001",
        assignment: freshAssignment.id,
        blocking,
        nonBlocking: !blocking,
        summary,
        details: `${summary} was independently observed in the fresh review.`,
        link: finding,
        author: "controller",
      }),
    );
  const relinkedBlocking = await link("F-0001", true, "Blocking recurrence");
  expect(relinkedBlocking.status, relinkedBlocking.stderr).toBe(0);
  const relinkedNonBlocking = await link("F-0002", false, "Nonblocking recurrence");
  expect(relinkedNonBlocking.status, relinkedNonBlocking.stderr).toBe(0);

  const blockingAfterLink = JSON.parse(relinkedBlocking.stdout).finding;
  const nonBlockingAfterLink = JSON.parse(relinkedNonBlocking.stdout).finding;
  expect(blockingAfterLink.status).toBe("open");
  expect(blockingAfterLink.blocking).toBe(true);
  expect(blockingAfterLink.verification).toBe(undefined);
  expect(nonBlockingAfterLink.status).toBe("open");
  expect(nonBlockingAfterLink.blocking).toBe(false);
  expect(nonBlockingAfterLink.rulingDetails).toBe(undefined);
  expect(blockingAfterLink.provenance[0]).toEqual(initialProvenance[0]);
  expect(nonBlockingAfterLink.provenance[0]).toEqual(initialProvenance[1]);
  expect(blockingAfterLink.provenance[1].report).toBe(freshAssignment.report);
  expect(nonBlockingAfterLink.provenance[1].report).toBe(freshAssignment.report);

  const resubmitted = await execute(repo, (service) =>
    service.submissionService.submit({
      spec,
      ticket: "T-0001",
      assignment: freshAssignment.id,
      result: "passed",
      author: "controller",
    }),
  );
  expect(resubmitted.status, resubmitted.stderr).toBe(0);
  expect(JSON.parse(resubmitted.stdout).execution).toBe("changes-requested");

  const beforeFreshVerification = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(beforeFreshVerification.status).not.toBe(0);
  expect(beforeFreshVerification.stderr).toMatch(/F-0001.*blocking|blocking.*F-0001/i);

  const repeatedCommitFix = await update("F-0001", "fixed", {});
  expect(repeatedCommitFix.status).not.toBe(0);
  expect(repeatedCommitFix.stderr).toMatch(/observation|changed content|different commit/i);
  const blockedAccept = await execute(repo, (service) =>
    service.ticketIntegrationService.integrate({
      spec,
      ticket: "T-0001",
      author: "controller",
    }),
  );
  expect(blockedAccept.status).not.toBe(0);
  expect(blockedAccept.stderr).toMatch(/F-0001.*blocking|blocking.*F-0001/i);
});
