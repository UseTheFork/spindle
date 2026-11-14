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
  for (const action of actions) {
    const ticket = asText(action.ticket);
    const name = asText(action.action);
    if (!ticket || !name) continue;
    const ticketStep = ticketActionStep(name);
    const state = ticketActionState(name);
    lines.push(`${ticket}: step ${ticketStep} (${state})`);
    const command = ticketActionCommand(name, featureDirectory, ticket);
    if (command) lines.push(`  Next: ${command}`);
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
    lines.push(`${ticket} ${role} ${id}  dispatched ${age}  report: ${reportState}`);
    if (assignment.reportPresent === true) {
      lines.push(`  Next: ${assignmentSubmitCommand(assignment, featureDirectory)}`);
    }
  }

  const readyActions = actions.filter((action) => !asText(action.action)?.startsWith("await-"));
  if (readyActions.length === 0 && assignments.length > 0) {
    const reportsReady = assignments.some((assignment) => assignment.reportPresent === true);
    lines.push(
      reportsReady
        ? "No ready tickets. Submit available reports or wait for the remaining assignments."
        : "No ready tickets. Wait for the open assignments.",
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
  } else if (step === "delivery:checks") {
    lines.push(
      `Next: pnpm spindle sdd checks require --feature ${featureDirectory} --scope delivery --command <check> --actor <acting-agent>`,
    );
  } else if (step === "delivery:review") {
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
      return "delivery:checks";
    case "review":
    case "await-review-report":
      return "delivery:review";
    case "correct":
    case "adjudicate":
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
    case "adjudicate":
    case "adjudicate-findings":
    case "controller-correction-decision":
    case "correct":
    case "resolve-findings":
      return "ticket:adjudicate";
    default:
      throw new Error(`Unknown ticket workflow action: ${action}.`);
  }
}

function ticketActionState(action: string): string {
  if (action.startsWith("await-")) return "awaiting report";
  if (["adjudicate", "adjudicate-findings", "controller-correction-decision"].includes(action)) {
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
    case "post-merge-checks":
      return `pnpm spindle sdd checks require --feature ${feature} --ticket ${ticket} --scope post-merge --command <check> --actor <acting-agent>`;
    case "correct":
    case "resolve-findings":
      return `pnpm spindle sdd correct --feature ${feature} --ticket ${ticket} --findings <finding-id> --details <correction-objective> --actor <acting-agent>`;
    default:
      return undefined;
  }
}

function assignmentSubmitCommand(assignment: SummaryRecord, feature: string): string {
  const ticket = asText(assignment.ticket);
  const id = asText(assignment.id);
  const role = asText(assignment.role);
  const scope = asText(assignment.scope);
  if (!id || !role) throw new Error("Pending assignment is missing its identity or role.");
  const selection =
    scope === "delivery" || ticket === "delivery"
      ? "--scope delivery"
      : ticket
        ? `--ticket ${ticket}`
        : "";
  const result = role === "review" ? " --result <passed|failed|unavailable>" : "";
  return `pnpm spindle sdd submit --feature ${feature} ${selection} --assignment ${id}${result} --actor <acting-agent>`
    .replace(/\s+/g, " ")
    .trim();
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
    lines.push(
      `Next: pnpm spindle sdd checks record --feature ${feature} --scope final --command "${command}" --result <passed|failed|unavailable> --actor <acting-agent>`,
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
