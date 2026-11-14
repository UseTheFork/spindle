# Ticket Tracker: Local Markdown

Spindle SDD stores feature work in `.scratch/` workspaces. A workspace contains an approved `spec.md`, its `sdd.json` execution ledger, `tickets/`, and `reports/`. A design is optional; when present, complete and approve it before the spec. Derive tickets from the approved spec.

## Ticket format

- Each ticket is `tickets/T-0001.md`, with IDs starting at `T-0001` independently in each feature. IDs use at least four digits.
- `sdd.json` is authoritative for ticket metadata, status, dependencies, and execution state. Ticket Markdown contains only its ID in YAML front matter; requirements, acceptance criteria, and comments are the editable body.
- Ticket creation copies the shared template, including `[REQUIREMENTS]` and `[ACCEPTANCE CRITERIA]` placeholders. Fill both before implementation.
- Supported status values are `open`, `in-progress`, and `closed`. Dependencies must refer to existing tickets; cycles are rejected.
- There is no migration or compatibility support for `issues/`, `I-####`, or previous SDD ledger schemas. Create a fresh feature workspace when using this ticket format.

## Create and maintain tickets

When an agent supplies an SDD `--actor` value, use the configured name of the
agent executing that command (for example, `sdd-orchestrator` or
`sdd-implementer`). This attributes SDD records, not Git commits. Do not use a
model or session ID, name an intended recipient instead, impersonate an owner,
or override existing ownership checks.

Create each approved ticket in dependency order:

```sh
{{ computed.spindle_package_manager }} spindle sdd ticket create --feature <feature-workspace> --title "..." --reporter "..." --category enhancement --actor <acting-agent>
```

For machine-readable results, add `--json` and read the success envelope's
`data` field. Errors and notices use structured stderr in this mode.

The command returns the new ticket ID and path. Complete its template, then set dependencies with `ticket update`:

```sh
{{ computed.spindle_package_manager }} spindle sdd ticket update --feature <feature-workspace> --ticket T-0002 --blocked-by T-0001 --actor <acting-agent>
{{ computed.spindle_package_manager }} spindle sdd ticket comment --feature <feature-workspace> --ticket T-0001 --details "..." --actor <acting-agent>
{{ computed.spindle_package_manager }} spindle sdd ready --feature <feature-workspace>
```

Use `--clear-blocked-by` to remove dependencies. Ticket Markdown remains editable; attributed comments are appended under `## Comments`. Do not add an execution field to the ticket file: execution transitions are recorded in `sdd.json`.

## Delivery

Use `{{ computed.spindle_package_manager }} spindle sdd next --feature <feature-workspace>` to identify the next workflow step and exact command. Use `status` and `ready` for additional state details. Follow the `int-subagent-driven-dev` skill for dispatch, review, correction, integration, and feature completion.

Inspect feature records for sensitive content, then start a feature worktree in an existing external directory with `{{ computed.spindle_package_manager }} spindle sdd start --feature <feature-workspace> --workspace <absolute-directory> --confirm-records`. Use the returned feature workspace for subsequent commands.

Dispatch each ready ticket to a separate worktree with `{{ computed.spindle_package_manager }} spindle sdd implement --feature <feature-workspace> --ticket <id> --actor <acting-agent> --workspace <absolute-directory>`. Inspect changed canonical records and pass `--confirm-records` before automatic record commits. Submit the implementation report with `{{ computed.spindle_package_manager }} spindle sdd submit --feature <feature-workspace> --ticket <id> --assignment <assignment-id> --actor <acting-agent>`, obtain a passing review, and merge the reviewed ticket with `{{ computed.spindle_package_manager }} spindle sdd integrate --feature <feature-workspace> --ticket <id> --actor <acting-agent>`.

Declare the complete post-merge check list with `{{ computed.spindle_package_manager }} spindle sdd checks require --feature <feature-workspace> --ticket <id> --scope post-merge --command <command> --actor <acting-agent>`, repeating `--command` for each check. Run the checks and record each result with `{{ computed.spindle_package_manager }} spindle sdd checks record --feature <feature-workspace> --ticket <id> --scope post-merge --command <command> --result <result> --actor <acting-agent>`. Passing results close the ticket automatically unless a blocker or dependency prevents closure. Resolve it, then repeat `checks require` with the same complete list; rerun any stale checks.

If a post-merge check fails, keep other merges blocked. From the feature worktree, run `{{ computed.spindle_package_manager }} spindle sdd sync --feature <feature-workspace> --ticket <id> --actor <acting-agent>` before dispatching correction. Sync fast-forwards only a clean, non-divergent ticket worktree to the recorded failed merge. Then run `{{ computed.spindle_package_manager }} spindle sdd next --feature <feature-workspace>` and follow its exact correction command. Commit, check, and review the fix before merging it and rerunning the frozen post-merge check list.

If integration reports a conflict, rebase the ticket worktree onto the current feature branch, resolve and commit the conflict, then run `{{ computed.spindle_package_manager }} spindle sdd sync --feature <feature-workspace> --ticket <id> --actor <acting-agent>` from the feature worktree to adopt the updated comparison baseline. Use `{{ computed.spindle_package_manager }} spindle sdd next --feature <feature-workspace>` for exact fresh-check and focused-review commands before retrying integration. Preserve all uncommitted changes and stop if recovery is unsafe.

After aggregate checks and review pass, inspect records and run `{{ computed.spindle_package_manager }} spindle sdd finish --feature <feature-workspace> --actor <acting-agent> --confirm-records` from the feature worktree. Include `--report <absolute-report-path>` when a retrospective is required. In the original checkout, declare the complete final-check list with `checks require --feature <original-feature> --scope final --command <command> --actor <acting-agent>`, repeating `--command` for each check. Run and record every result with `checks record --feature <original-feature> --scope final --command <command> --result <result> --actor <acting-agent>`.

If a final check fails or is unavailable, fix it on the original branch, then run `{{ computed.spindle_package_manager }} spindle sdd checks revalidate --feature <original-feature> --scope final --actor <acting-agent>`. Rerun the complete declared list and record fresh results without a merge argument. Revalidation requires a clean original checkout and a fix commit descended from the feature merge; it invalidates prior results. Repeat `{{ computed.spindle_package_manager }} spindle sdd finish --feature <original-feature> --actor <acting-agent>` in the original checkout to preflight and clean up. A separate ledger-only relocation commit follows. Preserve work and inspect the journal if recovery or cleanup is blocked.
