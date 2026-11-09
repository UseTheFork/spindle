# Ticket Tracker: Local Markdown

Spindle SDD stores feature work in `.scratch/` workspaces. A workspace contains
an approved `spec.md`, its `sdd.json` execution ledger, `tickets/`, and
`reports/`. A design is optional; when present, complete and approve it before
the spec. Derive tickets from the approved spec.

## Ticket format

- Each ticket is `tickets/T-0001.md`, with IDs starting at `T-0001` independently
  in each feature. IDs use at least four digits.
- `sdd.json` is authoritative for ticket metadata, status, dependencies, and
  execution state. Ticket Markdown contains only its ID in YAML front matter;
  requirements, acceptance criteria, and comments are the editable body.
- Ticket creation copies the shared template, including `[REQUIREMENTS]` and
  `[ACCEPTANCE CRITERIA]` placeholders. Fill both before implementation.
- Supported status values are `open`, `in-progress`, and `closed`. Dependencies
  must refer to existing tickets; cycles are rejected.
- There is no migration or compatibility support for `issues/`, `I-####`, or
  previous SDD ledger schemas. Create a fresh feature workspace when using this
  ticket format.

## Create and maintain tickets

Create each approved ticket in dependency order:

```sh
just tool pnpm run spindle sdd ticket create \
  --spec <absolute-spec-path> \
  --title "..." \
  --reporter "..." \
  --category enhancement \
  --author maintainer
```

The command returns the new ticket ID and path. Complete its template, then set
dependencies with `ticket update`:

```sh
just tool pnpm run spindle sdd ticket update \
  --spec <absolute-spec-path> \
  --ticket T-0002 \
  --blocked-by T-0001 \
  --author maintainer
just tool pnpm run spindle sdd ticket comment \
  --spec <absolute-spec-path> \
  --ticket T-0001 \
  --details "..." \
  --author maintainer
just tool pnpm run spindle sdd ready --spec <absolute-spec-path>
```

Use `--clear-blocked-by` to remove dependencies. Use `ticket update --status`
to change status. Ticket Markdown remains editable; attributed comments are
appended under `## Comments`. Do not add an execution field to the ticket file:
execution transitions are recorded in `sdd.json`.

## Delivery

Use `spindle sdd status` and `spindle sdd ready` to inspect work. Claim and
dispatch ready tickets with `spindle sdd claim` and `spindle sdd implement`,
submit the assigned report with `spindle sdd submit`, and close completed tickets
with `spindle sdd ticket update --status closed`. Follow the
[SDD workflow skill](../../src/Assets/Blueprints/skills/int-subagent-driven-dev/SKILL.md)
for review, correction, and feature completion.
