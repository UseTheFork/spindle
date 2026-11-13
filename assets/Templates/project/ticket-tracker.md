# Ticket Tracker: Local Markdown

Spindle SDD stores feature work in `.scratch/` workspaces. A workspace contains an approved `spec.md`, its `sdd.json` execution ledger, `tickets/`, and `reports/`. A design is optional; when present, complete and approve it before the spec. Derive tickets from the approved spec.

## Ticket format

- Each ticket is `tickets/T-0001.md`, with IDs starting at `T-0001` independently in each feature. IDs use at least four digits.
- `sdd.json` is authoritative for ticket metadata, status, dependencies, and execution state. Ticket Markdown contains only its ID in YAML front matter; requirements, acceptance criteria, and comments are the editable body.
- Ticket creation copies the shared template, including `[REQUIREMENTS]` and `[ACCEPTANCE CRITERIA]` placeholders. Fill both before implementation.
- Supported status values are `open`, `in-progress`, and `closed`. Dependencies must refer to existing tickets; cycles are rejected.
- There is no migration or compatibility support for `issues/`, `I-####`, or previous SDD ledger schemas. Create a fresh feature workspace when using this ticket format.

## Create and maintain tickets

Create each approved ticket in dependency order:

```sh
{{ computed.spindle_package_manager }} spindle sdd ticket create --spec <absolute-spec-path> --title "..." --reporter "..." --category enhancement --author maintainer
```

For machine-readable results, add `--json` and read the success envelope's
`data` field. Errors and notices use structured stderr in this mode.

The command returns the new ticket ID and path. Complete its template, then set dependencies with `ticket update`:

```sh
{{ computed.spindle_package_manager }} spindle sdd ticket update --spec <absolute-spec-path> --ticket T-0002 --blocked-by T-0001 --author maintainer
{{ computed.spindle_package_manager }} spindle sdd ticket comment --spec <absolute-spec-path> --ticket T-0001 --details "..." --author maintainer
{{ computed.spindle_package_manager }} spindle sdd ready --spec <absolute-spec-path>
```

Use `--clear-blocked-by` to remove dependencies. Ticket Markdown remains editable; attributed comments are appended under `## Comments`. Do not add an execution field to the ticket file: execution transitions are recorded in `sdd.json`.

## Delivery

Use `{{ computed.spindle_package_manager }} spindle sdd status` and `{{ computed.spindle_package_manager }} spindle sdd ready` to inspect work. Follow the `int-subagent-driven-dev` skill for dispatch, review, correction, integration, and feature completion.

Inspect feature records for sensitive content, then start a feature worktree in an existing external directory with `{{ computed.spindle_package_manager }} spindle sdd start --spec <absolute-spec-path> --workspace <absolute-directory> --confirm-records`. Use its returned spec path for subsequent commands.

Dispatch each ready ticket to a separate worktree with `{{ computed.spindle_package_manager }} spindle sdd implement --spec <feature-spec-path> --ticket <id> --author <name> --workspace <absolute-directory>`. Inspect changed canonical records and pass `--confirm-records` before automatic record commits. Submit the implementation report and review the committed ticket before merging it with `{{ computed.spindle_package_manager }} spindle sdd integrate`.

Declare the complete post-merge check list with `checks require --scope post-merge --ticket <id>`, run the checks, and record each result with `checks record --scope post-merge --ticket <id>`. Passing results close the ticket automatically unless a blocker or dependency prevents closure. Resolve it, then repeat `checks require` with the same complete list; rerun any stale checks. Failed checks block other merges until a reviewed correction passes. Resolve conflicts in the ticket worktree, adopt the rebased baseline with `checks require --rebase-baseline`, and obtain fresh checks and review.

After aggregate checks and review pass, inspect records and run `{{ computed.spindle_package_manager }} spindle sdd finish --spec <feature-spec-path> --author <name> --confirm-records` from the feature worktree. Include `--report <absolute-report-path>` when a retrospective is required. In the original checkout, declare the complete list with `checks require --scope final`, run the checks, and record each result with `checks record --scope final --merge <merge-sha>`. Final checks bind to the committed merge inputs; ledger-only changes do not invalidate them. Repeat `finish` there to preflight and clean up. A separate ledger-only relocation commit follows. Preserve work and inspect the journal if recovery or cleanup is blocked.
