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
  addValue(lines, "Journal", status.journal);

  const delivery = asRecord(status.delivery);
  if (delivery) {
    const state = [delivery.status, delivery.execution, delivery.action]
      .map(asText)
      .filter((value): value is string => value !== undefined);
    if (state.length > 0) lines.push(`Delivery: ${state.join("; ")}.`);
    addValue(lines, "Delivery assignment", formatAssignment(delivery.assignment));
    addTextList(lines, "Delivery blockers", delivery.blockers);
  }

  addRecordList(lines, "Permitted actions", status.actions, (item) =>
    [item.ticket, item.action]
      .map(asText)
      .filter((value): value is string => value !== undefined)
      .join(": "),
  );
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

  return lines;
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
