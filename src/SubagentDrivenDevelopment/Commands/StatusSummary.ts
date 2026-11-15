import { latestCheckRecords } from "@/SubagentDrivenDevelopment/Models/Evidence";

type SummaryRecord = Record<string, unknown>;

export function statusSummary(data: unknown, spec: string, heading: string): string[] {
  const status = asRecord(data);
  if (!status) return [`${heading} for ${spec}: no structured status details were returned.`];

  const feature = asText(status.feature) ?? spec;
  const lines = [`${heading} for feature ${feature}.`];
  addValue(lines, "Spec", status.spec ?? status.originalSpec);
  addValue(lines, "Workspace", status.workspace ?? status.originalWorkspace);
  addValue(lines, "Ledger", status.ledger);
  addValue(lines, "Finalization phase", status.phase);
  addValue(lines, "Final validation", status.finalValidation);
  addValue(lines, "Cleanup", status.cleanup);
  addValue(lines, "Merge commit", status.mergeCommit);
  if (status.phase === "validation") {
    addValue(lines, "Validation target", status.headSha);
    addValue(lines, "Revalidation candidate", status.revalidationCandidateSha);
  }
  addValue(lines, "Journal", status.journal);

  const delivery = asRecord(status.delivery);
  if (delivery) {
    const state = [delivery.status, delivery.execution]
      .map(asText)
      .filter((value): value is string => value !== undefined);
    if (state.length > 0) lines.push(`Delivery: ${state.join("; ")}.`);
    addValue(lines, "Delivery assignment", formatAssignment(delivery.assignment));
    addTextList(lines, "Delivery blockers", delivery.blockers);
  }

  addRecordList(lines, "Pending assignments", status.pendingAssignments, (item) =>
    [
      [item.ticket, item.action, item.id]
        .map(asText)
        .filter((value): value is string => value !== undefined)
        .join(" "),
      item.status ? `status ${String(item.status)}` : undefined,
      item.agent ? `agent ${String(item.agent)}` : undefined,
      item.scope ? `scope ${String(item.scope)}` : undefined,
      item.report ? `report ${String(item.report)}` : undefined,
    ]
      .filter((value): value is string => value !== undefined)
      .join("; "),
  );
  addRecordList(lines, "Blockers", status.blockers, (item) => {
    const ticket = asText(item.ticket);
    const reason = asText(item.reason);
    return ticket && reason ? `${ticket}: ${reason}` : (reason ?? ticket ?? "");
  });
  addRecordList(
    lines,
    "Required final checks",
    status.required,
    (item) => asText(item.command) ?? "",
  );
  addRecordList(lines, "Recorded final checks", status.records, (item) => {
    const command = asText(item.command);
    const result = asText(item.result);
    return command && result ? `${command}: ${result}` : (command ?? result ?? "");
  });

  return [...lines, ...nextSummary(data)];
}

export function finishSummary(data: unknown): string[] {
  const result = asRecord(data);
  if (!result) throw new Error("Finish returned no structured workflow result.");
  const feature = asText(result.feature);
  if (!feature) throw new Error("Finish result is missing its feature identifier.");
  if (result.finished === true) return [`Finished feature delivery for ${feature}.`];
  if (result.phase !== "validation" || result.finalValidation !== "pending") {
    throw new Error("Finish returned an unrecognized incomplete workflow result.");
  }
  const mergeCommit = asText(result.mergeCommit);
  if (!mergeCommit) throw new Error("Pending final validation is missing its merge commit.");
  return [`Final validation is pending for feature merge ${mergeCommit}.`, ...nextSummary(data)];
}

export function nextSummary(data: unknown): string[] {
  const status = asRecord(data);
  if (!status) return ["No structured workflow state was returned."];

  const feature = asText(status.feature);
  if (!feature) throw new Error("Workflow status is missing its feature identifier.");
  const featureDirectory = `.scratch/${feature}`;
  const delivery = asRecord(status.delivery);
  const phase = asText(status.phase);
  const step = deliveryStep(delivery, phase, status.finished === true);
  const lines = [`Feature ${feature}: step ${step}`];
  addTextList(lines, "Delivery blocker", delivery?.blockers);

  const actions = records(status.actions);
  const guidedTickets = new Set<string>();
  const renderedSteps = new Set<string>();
  for (const action of actions) {
    const ticket = asText(action.ticket);
    const name = asText(action.action);
    if (!ticket || !name) continue;
    const ticketStep = ticketActionStep(name);
    const state = ticketActionState(name);
    const stepKey = `${ticket}:${ticketStep}`;
    if (!renderedSteps.has(stepKey)) {
      lines.push(`${ticket}: step ${ticketStep} (${state})`);
      renderedSteps.add(stepKey);
    }
    if (name === "review")
      addUnavailableReviewLines(lines, records(action.unavailableReviewAssignments), "  ");
    const command = ticketActionCommand(name, featureDirectory, ticket);
    if (command) lines.push(`  Next: ${command}`);
    if (name === "checks") addTicketCheckCommand(lines, action, featureDirectory, ticket, "ticket");
    if (name === "post-merge-checks")
      addTicketCheckCommand(lines, action, featureDirectory, ticket, "post-merge");
    if (
      !guidedTickets.has(ticket) &&
      [
        "adjudicate",
        "adjudicate-findings",
        "controller-correction-decision",
        "correct",
        "post-merge-correct",
        "resolve-findings",
      ].includes(name)
    ) {
      guidedTickets.add(ticket);
      addTicketCorrectionGuidance(lines, status, actions, featureDirectory, ticket);
    }
  }

  const assignments = records(status.pendingAssignments);
  for (const assignment of assignments) {
    const ticket = asText(assignment.ticket);
    const id = asText(assignment.id);
    const role = asText(assignment.role);
    const requestedAt = asText(assignment.requestedAt);
    const report = asText(assignment.report);
    if (!ticket || !id || !role || !requestedAt || !report) {
      throw new Error("Pending assignment is missing its identity, dispatch time, or report path.");
    }
    const age = elapsedSince(requestedAt);
    const reportState = assignment.reportPresent === true ? "present, not submitted" : "missing";
    const assignmentState = assignment.status === "unavailable" ? "  assignment: unavailable" : "";
    lines.push(
      `${ticket} ${role} ${id}  dispatched ${age}  report: ${reportState}${assignmentState}`,
    );
    if (assignment.reportPresent === true) {
      if (assignment.submissionBlocker === "commit-required") {
        const workspace = asText(assignment.workspace);
        lines.push(
          `Commit the implementation${workspace ? ` in ${workspace}` : " in the assigned worktree"} before submitting the report.`,
        );
      } else if (assignment.submissionBlocker === "baseline-required") {
        if (assignment.action === "correct") {
          const objective = asText(assignment.objective);
          const findings = Array.isArray(assignment.findingIds)
            ? assignment.findingIds.map(asText).filter((value): value is string => !!value)
            : [];
          const checkFailure = asText(assignment.checkFailure);
          if (!objective || (findings.length === 0 && !checkFailure)) {
            throw new Error("Existing correction is missing its objective or selection.");
          }
          const selection = findings.length > 0 ? ` --findings ${findings.join(" ")}` : "";
          const check = checkFailure ? ` --check-failure ${quoteShellArgument(checkFailure)}` : "";
          lines.push("Record the starting commit for this older correction, then commit its work:");
          lines.push(
            `  pnpm spindle sdd correct --feature ${featureDirectory} --ticket ${ticket}${selection}${check} --details ${quoteShellArgument(objective)} --actor <acting-agent>`,
          );
        } else {
          lines.push("Inspect the ticket ledger and worktree; the assignment baseline is missing.");
        }
      } else if (role === "review") {
        addPendingReviewGuidance(lines, status, assignment, featureDirectory);
        addReviewResultCommands(
          lines,
          assignmentSubmitCommand(assignment, featureDirectory),
          registeredFindingsForAssignment(status, assignment).length > 0,
        );
      } else {
        lines.push(
          `  Next: ${assignmentSubmitCommand(assignment, featureDirectory)} --actor <acting-agent>`,
        );
      }
    }
  }

  const readyActions = actions.filter((action) => !asText(action.action)?.startsWith("await-"));
  const deliveryHasReadyActions = [
    "record-final-checks",
    "require-final-checks",
    "correct",
    "adjudicate",
    "adjudicate-findings",
    "controller-correction-decision",
  ].includes(asText(delivery?.action) ?? "");
  if (readyActions.length === 0 && assignments.length > 0 && !deliveryHasReadyActions) {
    const reportsReady = assignments.some(
      (assignment) => assignment.reportPresent === true && !assignment.submissionBlocker,
    );
    const reportsBlocked = assignments.some(
      (assignment) => assignment.reportPresent === true && !!assignment.submissionBlocker,
    );
    const waiting = step.startsWith("delivery:") ? "delivery actions" : "tickets";
    lines.push(
      reportsReady
        ? `No ready ${waiting}. Submit available reports or wait for the remaining assignments.`
        : reportsBlocked
          ? `No ready ${waiting}. Resolve the implementation submission blockers above.`
          : `No ready ${waiting}. Wait for the open assignments.`,
    );
  } else if (readyActions.length === 0 && assignments.length === 0) {
    addRecordList(lines, "Blocker", status.blockers, (item) => {
      const ticket = asText(item.ticket);
      const reason = asText(item.reason);
      return ticket && reason ? `${ticket}: ${reason}` : (reason ?? ticket ?? "");
    });
  }

  if (phase === "validation") addFinalValidationCommands(lines, status, featureDirectory);
  if (step === "delivery:claim") {
    lines.push(
      `Next: pnpm spindle sdd claim --scope delivery --feature ${featureDirectory} --actor <acting-agent>`,
    );
  } else if (step === "delivery:review" && delivery?.action === "review") {
    addUnavailableReviewLines(
      lines,
      records(delivery.reviewAssignments).filter(
        (assignment) => assignment.status === "submitted" && assignment.result === "unavailable",
      ),
    );
    lines.push(
      `Next: pnpm spindle sdd review --feature ${featureDirectory} --scope delivery --actor <acting-agent>`,
    );
  } else if (step === "delivery:finish") {
    lines.push(
      `Next: pnpm spindle sdd finish --feature ${featureDirectory} --actor <acting-agent>`,
    );
  } else if (step === "delivery:cleanup") {
    lines.push(
      `Next: pnpm spindle sdd finish --feature ${featureDirectory} --actor <acting-agent>`,
    );
  }
  if (step === "delivery:checks") {
    if (delivery?.action === "require-final-checks") {
      addFinalCheckDeclarationCommand(lines, featureDirectory);
    } else {
      addDeliveryCheckCommands(lines, delivery, featureDirectory);
    }
  }
  if (
    step === "delivery:adjudicate" &&
    ["correct", "adjudicate", "adjudicate-findings", "controller-correction-decision"].includes(
      asText(delivery?.action) ?? "",
    )
  ) {
    addDeliveryCorrectionGuidance(lines, delivery, featureDirectory);
    addDeliveryCheckCommands(lines, delivery, featureDirectory, true);
  }

  return lines;
}

function deliveryStep(
  delivery: SummaryRecord | undefined,
  phase: string | undefined,
  finished: boolean,
): string {
  if (finished) return "delivery:complete";
  if (phase === "validation") return "delivery:final-validation";
  if (phase) return "delivery:cleanup";
  const action = asText(delivery?.action);
  switch (action) {
    case "claim":
      return "delivery:claim";
    case "record-final-checks":
    case "require-final-checks":
      return "delivery:checks";
    case "review":
      return "delivery:review";
    case "await-review-report":
      return "delivery:review";
    case "await-implementation-report":
      return "delivery:adjudicate";
    case "correct":
    case "adjudicate":
    case "adjudicate-findings":
    case "controller-correction-decision":
      return "delivery:adjudicate";
    case "finish":
      return "delivery:finish";
    case "finished":
      return "delivery:complete";
    default:
      return "tickets-in-progress";
  }
}

function ticketActionStep(action: string): string {
  switch (action) {
    case "implement":
    case "await-implementation-report":
      return "ticket:implement";
    case "review":
    case "await-review-report":
      return "ticket:review";
    case "integrate":
      return "ticket:integrate";
    case "post-merge-checks":
      return "ticket:post-merge";
    case "post-merge-sync":
      return "ticket:sync";
    case "post-merge-correct":
    case "correct":
      return "ticket:correct";
    case "checks":
      return "ticket:checks";
    case "adjudicate":
    case "adjudicate-findings":
    case "controller-correction-decision":
    case "resolve-findings":
      return "ticket:adjudicate";
    default:
      throw new Error(`Unknown ticket workflow action: ${action}.`);
  }
}

function ticketActionState(action: string): string {
  if (action.startsWith("await-")) return "awaiting report";
  if (
    [
      "adjudicate",
      "adjudicate-findings",
      "controller-correction-decision",
      "correct",
      "post-merge-correct",
      "resolve-findings",
    ].includes(action)
  ) {
    return "judgment required";
  }
  return "ready";
}

function ticketActionCommand(action: string, feature: string, ticket: string): string | undefined {
  switch (action) {
    case "implement":
      return `pnpm spindle sdd implement --feature ${feature} --ticket ${ticket} --workspace <absolute-authorized-directory> --actor <acting-agent>`;
    case "review":
      return `pnpm spindle sdd review --feature ${feature} --ticket ${ticket} --actor <acting-agent>`;
    case "integrate":
      return `pnpm spindle sdd integrate --feature ${feature} --ticket ${ticket} --actor <acting-agent>`;
    case "post-merge-sync":
      return `pnpm spindle sdd sync --feature ${feature} --ticket ${ticket} --actor <acting-agent>`;
    default:
      return undefined;
  }
}

function addTicketCheckCommand(
  lines: string[],
  action: SummaryRecord,
  feature: string,
  ticket: string,
  scope: "ticket" | "post-merge",
): void {
  const command = asText(action.checkCommand);
  const checkScope = scope === "post-merge" ? " --scope post-merge" : "";
  const label = scope === "post-merge" ? "post-merge" : "ticket";
  if (!command) {
    lines.push(
      `  Next: pnpm spindle sdd checks require --feature ${feature} --ticket ${ticket}${checkScope} --command <check> --actor <acting-agent>`,
    );
    return;
  }
  lines.push(`  Run ${label} check: ${command}`);
  addResultCommands(
    lines,
    `pnpm spindle sdd checks record --feature ${feature} --ticket ${ticket}${checkScope} --command ${quoteShellArgument(command)}`,
    "  ",
  );
}

function addTicketCorrectionGuidance(
  lines: string[],
  status: SummaryRecord,
  actions: SummaryRecord[],
  feature: string,
  ticket: string,
): void {
  const ticketFindings = records(status.findings)
    .filter((entry) => entry.ticket === ticket)
    .map((entry) => asRecord(entry.finding))
    .filter((finding): finding is SummaryRecord => finding !== undefined);
  const actionable = ticketFindings.filter((finding) => finding.status === "confirmed");
  const unresolved = ticketFindings.filter(
    (finding) =>
      finding.blocking === true &&
      !["confirmed", "fixed", "dismissed"].includes(String(finding.status)),
  );
  const checkFailures = actions
    .filter((action) => action.ticket === ticket)
    .map((action) => asText(action.checkFailure))
    .filter((command): command is string => command !== undefined);
  const failedReviewAssignments = actions
    .filter((action) => action.ticket === ticket)
    .flatMap((action) => records(action.failedReviewAssignments));
  const uniqueFailedReviews = failedReviewAssignments.filter(
    (assignment, index, all) => all.findIndex((other) => other.id === assignment.id) === index,
  );
  const adjudication = asRecord(
    actions.find((action) => action.ticket === ticket && asRecord(action.adjudication))
      ?.adjudication,
  );
  const continuationRequired = actions.some(
    (action) => action.ticket === ticket && action.continuationRequired === true,
  );
  const continuation = continuationRequired
    ? " --decision continue --assessment <progress-assessment>"
    : "";
  const hasCandidates = actionable.length > 0 || checkFailures.length > 0;

  if (adjudication?.status === "pending") {
    const reason = asText(adjudication.reason) ?? "reason not recorded";
    const details = asText(adjudication.details);
    lines.push(
      `Correction is paused for adjudication (${reason})${details ? `: ${details}` : ""}.`,
    );
  }
  if (hasCandidates) {
    lines.push(`Eligible for correction on ${ticket}:`);
    for (const finding of actionable) lines.push(`  ${describeFinding(finding)}`);
    for (const checkFailure of new Set(checkFailures)) {
      lines.push(`  check: ${checkFailure} (failed)`);
    }
    lines.push("Choose which to correct in this attempt:");
    if (actionable.length > 0) {
      const findingIds = actionable
        .map((finding) => asText(finding.id))
        .filter((id): id is string => id !== undefined);
      lines.push(
        `  pnpm spindle sdd correct --feature ${feature} --ticket ${ticket} --findings <one or more of: ${findingIds.join(" ")}> --details <correction-objective>${continuation} --actor <acting-agent>`,
      );
    }
    for (const checkFailure of new Set(checkFailures)) {
      lines.push(
        `  pnpm spindle sdd correct --feature ${feature} --ticket ${ticket} --check-failure ${quoteShellArgument(checkFailure)} --details <correction-objective>${continuation} --actor <acting-agent>`,
      );
    }
  }
  if (unresolved.length > 0) addFindingDispositionCommands(lines, unresolved, feature, ticket);
  if (uniqueFailedReviews.length > 0) {
    lines.push(`Failed review reports on ${ticket}:`);
    for (const assignment of uniqueFailedReviews) {
      const id = asText(assignment.id);
      const report = asText(assignment.report);
      if (!id || !report) continue;
      lines.push(`  ${id}: ${report}`);
    }
  }
  if (!hasCandidates && unresolved.length === 0 && uniqueFailedReviews.length === 0) {
    lines.push(
      `Judgment required for ${ticket}: inspect the failed review evidence and choose an available correction or adjudication action.`,
    );
  }
}

function addUnavailableReviewLines(
  lines: string[],
  assignments: SummaryRecord[],
  indent = "",
): void {
  for (const assignment of assignments) {
    const id = asText(assignment.id);
    const agent = asText(assignment.agent);
    if (!id) continue;
    lines.push(
      `${indent}Review ${id}${agent ? ` (${agent})` : ""} was unavailable; dispatch a new review round for that reviewer.`,
    );
  }
}

function addFindingDispositionCommands(
  lines: string[],
  findings: SummaryRecord[],
  feature: string,
  ticket: string,
  scope?: "delivery",
): void {
  lines.push(`Unresolved findings need a disposition on ${ticket}:`);
  for (const finding of findings) lines.push(`  ${describeFinding(finding)}`);
  lines.push("Choose a finding disposition:");
  const selection = scope === "delivery" ? "--scope delivery" : `--ticket ${ticket}`;
  for (const finding of findings) {
    const id = asText(finding.id);
    if (!id) continue;
    lines.push(
      `  pnpm spindle sdd finding update --feature ${feature} ${selection} --finding ${id} --status confirmed --actor <acting-agent>`,
    );
    lines.push(
      `  pnpm spindle sdd finding update --feature ${feature} ${selection} --finding ${id} --status dismissed --details <ruling-rationale> --actor <acting-agent>`,
    );
    lines.push(
      `To defer ${id}, first commit the approved requirements change, record its approval if needed, and obtain fresh passing review coverage for the current requirements.`,
    );
    lines.push(
      `  After committing a requirements change, if approval is not already recorded: pnpm spindle sdd requirements decide --feature ${feature} ${selection} --finding ${id} --decision approved --details <requirements-rationale> --actor <acting-agent>`,
    );
    lines.push(
      `  After approval and fresh passing review: pnpm spindle sdd finding update --feature ${feature} ${selection} --finding ${id} --status deferred --details <deferral-rationale> --follow-up <follow-up-reference> --requirements-decision <approved-decision-id> --actor <acting-agent>`,
    );
  }
}

function addDeliveryCheckCommands(
  lines: string[],
  delivery: SummaryRecord | undefined,
  feature: string,
  unavailableOnly = false,
): void {
  const required = records(delivery?.requiredChecks);
  if (required.length === 0) {
    if (!unavailableOnly) {
      lines.push(
        `Next: pnpm spindle sdd checks require --feature ${feature} --scope delivery --command <check> --actor <acting-agent>`,
      );
    }
    return;
  }
  const headSha = asText(delivery?.headSha);
  const checkRecords = records(delivery?.checkRecords);
  for (const requirement of required) {
    const command = asText(requirement.command);
    if (!command) continue;
    const latest = checkRecords
      .filter((record) => record.command === command && record.headSha === headSha)
      .at(-1);
    if (unavailableOnly && latest?.result !== "unavailable") continue;
    if (latest?.result === "passed") continue;
    lines.push(`Run delivery check: ${command}`);
    addResultCommands(
      lines,
      `pnpm spindle sdd checks record --feature ${feature} --scope delivery --command ${quoteShellArgument(command)}`,
    );
  }
}

function addFinalCheckDeclarationCommand(lines: string[], feature: string): void {
  lines.push(
    "Declare the complete final-check list before finishing; repeat --command for each check.",
  );
  lines.push(
    `Next: pnpm spindle sdd checks require --feature ${feature} --scope final --command <check> [--command <check> ...] --actor <acting-agent>`,
  );
}

function addPendingReviewGuidance(
  lines: string[],
  status: SummaryRecord,
  assignment: SummaryRecord,
  feature: string,
): void {
  const id = asText(assignment.id);
  const report = asText(assignment.report);
  if (!id || !report) return;

  lines.push(
    "Inspect the report and register each accepted finding against this assignment before submission. A failed result requires at least one registered finding. If none are accepted, submit passed, or unavailable when the report has no usable verdict.",
  );
  const registered = registeredFindingsForAssignment(status, assignment);
  lines.push(
    registered.length > 0
      ? `Findings already registered from this report: ${registered
          .map((finding) => asText(finding.id))
          .filter((value): value is string => value !== undefined)
          .join(", ")}.`
      : "Findings already registered from this report: none.",
  );
  addFindingCreateCommands(lines, feature, assignmentSelection(assignment), id);
}

function registeredFindingsForAssignment(
  status: SummaryRecord,
  assignment: SummaryRecord,
): SummaryRecord[] {
  const report = asText(assignment.report);
  if (!report) return [];
  const delivery = asRecord(status.delivery);
  const findings = [
    ...records(status.findings).map((entry) => asRecord(entry.finding)),
    ...records(delivery?.findings),
  ].filter((finding): finding is SummaryRecord => finding !== undefined);
  return findings.filter((finding) =>
    records(finding.provenance).some((source) => source.report === report),
  );
}

function addDeliveryCorrectionGuidance(
  lines: string[],
  delivery: SummaryRecord | undefined,
  feature: string,
): void {
  if (!delivery) return;
  const findings = records(delivery.findings);
  const actionable = findings.filter((finding) => finding.status === "confirmed");
  const unresolved = findings.filter(
    (finding) =>
      finding.blocking === true &&
      !["confirmed", "fixed", "dismissed"].includes(String(finding.status)),
  );
  const headSha = asText(delivery.headSha);
  const checkRecords = records(delivery.checkRecords).filter(
    (record): record is SummaryRecord & { command: string; headSha: string } =>
      typeof record.command === "string" && typeof record.headSha === "string",
  );
  const failedChecks = new Set(
    headSha
      ? latestCheckRecords(checkRecords, headSha)
          .filter((record) => record.result === "failed")
          .map((record) => record.command)
      : [],
  );
  const attempts = records(delivery.correctionAttempts);
  const adjudication = asRecord(delivery.adjudication);
  const continuation = attempts.length > 0 || adjudication?.status === "pending";
  const decision = continuation ? " --decision continue --assessment <progress-assessment>" : "";
  const hasCandidates = actionable.length > 0 || failedChecks.size > 0;

  if (adjudication?.status === "pending") {
    lines.push(
      `Correction is paused for adjudication (${asText(adjudication.reason) ?? "reason not recorded"}).`,
    );
  }
  if (hasCandidates) {
    lines.push("Eligible for correction on delivery:");
    for (const finding of actionable) lines.push(`  ${describeFinding(finding)}`);
    for (const command of failedChecks) lines.push(`  check: ${command} (failed)`);
    lines.push("Choose which to correct in this attempt:");
    if (actionable.length > 0) {
      const ids = actionable
        .map((finding) => asText(finding.id))
        .filter((id): id is string => id !== undefined);
      lines.push(
        `  pnpm spindle sdd correct --feature ${feature} --scope delivery --findings <one or more of: ${ids.join(" ")}> --details <correction-objective>${decision} --actor <acting-agent>`,
      );
    }
    for (const command of failedChecks) {
      lines.push(
        `  pnpm spindle sdd correct --feature ${feature} --scope delivery --check-failure ${quoteShellArgument(command)} --details <correction-objective>${decision} --actor <acting-agent>`,
      );
    }
  }
  if (unresolved.length > 0)
    addFindingDispositionCommands(lines, unresolved, feature, "delivery", "delivery");
  const failedReviews = records(delivery.reviewAssignments).filter(
    (assignment) => assignment.status === "submitted" && assignment.result === "failed",
  );
  if (failedReviews.length > 0) {
    lines.push("Failed feature-review reports:");
    for (const assignment of failedReviews) {
      const id = asText(assignment.id);
      const report = asText(assignment.report);
      if (!id || !report) continue;
      lines.push(`  ${id}: ${report}`);
    }
  }
  if (!hasCandidates && unresolved.length === 0 && failedReviews.length === 0)
    lines.push(
      "Judgment required: inspect failed feature-review reports and choose an available correction or adjudication action.",
    );
}

function addFindingCreateCommands(
  lines: string[],
  feature: string,
  selection: string,
  assignment: string,
): void {
  lines.push("Register accepted findings with the selected impact:");
  for (const impact of ["blocking", "non-blocking"]) {
    lines.push(
      `  pnpm spindle sdd finding create --feature ${feature} ${selection} --assignment ${assignment} --${impact} --summary <summary> --details <impact> --actor <acting-agent>`,
    );
  }
}

function describeFinding(finding: SummaryRecord): string {
  const id = asText(finding.id) ?? "finding";
  const blocking = finding.blocking === true ? "blocking" : "non-blocking";
  const summary = asText(finding.summary) ?? asText(finding.details) ?? "No summary recorded";
  return `${id} (${blocking}) ${summary}`;
}

function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function assignmentSubmitCommand(assignment: SummaryRecord, feature: string): string {
  const id = asText(assignment.id);
  const role = asText(assignment.role);
  if (!id || !role) throw new Error("Pending assignment is missing its identity or role.");
  const selection = assignmentSelection(assignment);
  return `pnpm spindle sdd submit --feature ${feature} ${selection} --assignment ${id}`
    .replace(/\s+/g, " ")
    .trim();
}

function addResultCommands(lines: string[], command: string, indent = ""): void {
  lines.push(`${indent}Next (passed): ${command} --result passed --actor <acting-agent>`);
  lines.push(
    `${indent}Next (failed or unavailable): ${command} --result <failed|unavailable> --details <failure-or-unavailability-details> --actor <acting-agent>`,
  );
}

function addReviewResultCommands(lines: string[], command: string, hasFindings: boolean): void {
  if (hasFindings) {
    addResultCommands(lines, command, "  ");
    return;
  }
  lines.push(`  Next (passed): ${command} --result passed --actor <acting-agent>`);
  lines.push(
    `  Next (unavailable): ${command} --result unavailable --details <unavailability-details> --actor <acting-agent>`,
  );
}

function assignmentSelection(assignment: SummaryRecord): string {
  const ticket = asText(assignment.ticket);
  const scope = asText(assignment.scope);
  if (scope === "delivery" || ticket === "delivery") return "--scope delivery";
  if (ticket) return `--ticket ${ticket}`;
  throw new Error("Pending assignment is missing its ticket or delivery scope.");
}

function addFinalValidationCommands(lines: string[], status: SummaryRecord, feature: string): void {
  const required = records(status.required);
  const recorded = records(status.records);
  const headSha = asText(status.headSha);
  const failed = required.find((check) => {
    const command = asText(check.command);
    if (!command || !headSha) return false;
    const latest = recorded.filter((item) => item.command === command).at(-1);
    return latest?.result === "failed" && latest.headSha === headSha;
  });
  if (failed) {
    const command = asText(failed.command)!;
    lines.push(`Final check failed on ${headSha}: ${command}.`);
    lines.push("Fix the failure on the original branch and commit the fix.");
    lines.push(
      `Next: pnpm spindle sdd checks revalidate --feature ${feature} --scope final --actor <acting-agent>`,
    );
    return;
  }

  for (const check of required) {
    const command = asText(check.command);
    if (!command || !headSha) continue;
    const latest = recorded.filter((item) => item.command === command).at(-1);
    if (latest?.result === "passed" && latest.headSha === headSha) continue;
    lines.push(`Run final check: ${command}`);
    addResultCommands(
      lines,
      `pnpm spindle sdd checks record --feature ${feature} --scope final --command ${quoteShellArgument(command)}`,
    );
  }
}

function elapsedSince(timestamp: string): string {
  const dispatchedAt = Date.parse(timestamp);
  if (!Number.isFinite(dispatchedAt)) {
    throw new Error(`Pending assignment has an invalid dispatch time: ${timestamp}.`);
  }
  const minutes = Math.max(0, Math.floor((Date.now() - dispatchedAt) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h ago` : `${hours}h ${remainingMinutes}m ago`;
}

function records(value: unknown): SummaryRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SummaryRecord => asRecord(item) !== undefined);
}

function formatAssignment(value: unknown): string | undefined {
  const assignment = asRecord(value);
  if (!assignment) return undefined;
  const parts = [
    assignment.id,
    assignment.role,
    assignment.action,
    assignment.status,
    assignment.report ? `report ${String(assignment.report)}` : undefined,
    assignment.workspace ? `workspace ${String(assignment.workspace)}` : undefined,
    assignment.branch ? `branch ${String(assignment.branch)}` : undefined,
  ]
    .map(asText)
    .filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join("; ") : undefined;
}

function addValue(lines: string[], label: string, value: unknown): void {
  const text = asText(value);
  if (text) lines.push(`${label}: ${text}`);
}

function addTextList(lines: string[], label: string, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const text = asText(item);
    if (text) lines.push(`${label}: ${text}`);
  }
}

function addRecordList(
  lines: string[],
  label: string,
  value: unknown,
  describe: (item: SummaryRecord) => string,
): void {
  if (!Array.isArray(value)) return;
  if (value.length === 0) {
    lines.push(`${label}: none.`);
    return;
  }
  for (const itemValue of value) {
    const item = asRecord(itemValue);
    if (!item) continue;
    const description = describe(item);
    if (description) lines.push(`${label}: ${description}`);
  }
}

function asRecord(value: unknown): SummaryRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as SummaryRecord)
    : undefined;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
