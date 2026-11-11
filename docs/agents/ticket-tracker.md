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
pnpm spindle sdd ticket create --spec <absolute-spec-path> --title "..." --reporter "..." --category enhancement --author maintainer
```

The command returns the new ticket ID and path. Complete its template, then set dependencies with `ticket update`:

```sh
pnpm spindle sdd ticket update --spec <absolute-spec-path> --ticket T-0002 --blocked-by T-0001 --author maintainer
pnpm spindle sdd ticket comment --spec <absolute-spec-path> --ticket T-0001 --details "..." --author maintainer
pnpm spindle sdd ready --spec <absolute-spec-path>
```

Use `--clear-blocked-by` to remove dependencies. Use `ticket update --status` to change status. Ticket Markdown remains editable; attributed comments are appended under `## Comments`. Do not add an execution field to the ticket file: execution transitions are recorded in `sdd.json`.

## Delivery

Use `pnpm spindle sdd status` and `pnpm spindle sdd ready` to inspect work. Claim and dispatch ready tickets with `pnpm spindle sdd claim` and `pnpm spindle sdd implement`, submit the assigned report with `pnpm spindle sdd submit`, and close completed tickets with `pnpm spindle sdd ticket update --status closed`. Follow the `int-subagent-driven-dev` skill for review, correction, and feature completion.

`pnpm spindle sdd start --spec <absolute-spec-path> --workspace <absolute-directory> --confirm-records`
prepares a feature branch and worktree in an existing external directory. Inspect
the feature records for sensitive content before confirming them. Startup stops
if unrelated changes are present; resolve them before retrying. If startup is
interrupted, inspect the reported state file, branch, and worktree before any
manual recovery.

Use the returned feature worktree's spec path for subsequent commands.
`pnpm spindle sdd implement --spec <feature-spec-path> --ticket <id> --author <name> --workspace <absolute-directory>`
creates a separate ticket worktree in the supplied existing directory and
returns its assignment. The feature worktree remains the source of canonical
records and reports.

After a committed ticket passes its checks and reviews, `pnpm spindle sdd accept`
and `pnpm spindle sdd integrate` can merge it into the feature branch. Integration
leaves post-merge validation pending.

Post-merge validation, dependent-ticket unblocking, final feature merging, and
cleanup are not yet implemented. Workflow records currently require manual
commits, and interrupted worktree creation may require manual recovery.
