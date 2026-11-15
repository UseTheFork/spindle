# Ticket Tracker: Local Markdown

Spindle SDD stores feature work in `.scratch/` workspaces. A workspace contains
an approved `spec.md`, its `sdd.json` execution ledger, `tickets/`, and
`reports/`. A design is optional; when present, complete and approve it before
the spec. Derive tickets from the approved spec.

## Ticket format

- Each ticket is `tickets/T-0001.md`, with IDs starting at `T-0001`
  independently in each feature. IDs use at least four digits.
- `sdd.json` is authoritative for ticket metadata, status, dependencies, and
  execution state. Ticket Markdown contains only its ID in YAML front matter;
  requirements, acceptance criteria, and comments are the editable body.
- Ticket creation copies the shared template, including `[REQUIREMENTS]` and
  `[ACCEPTANCE CRITERIA]` placeholders. Fill both before implementation.
- Ticket status is `open` or `closed`. The workflow closes a ticket after
  integration and passing post-merge checks; do not set status manually.
  Dependencies must refer to existing tickets; cycles are rejected.
- There is no migration or compatibility support for `issues/`, `I-####`, or
  previous SDD ledger schemas. Create a fresh feature workspace when using this
  ticket format.

## Create and maintain tickets

Use the configured actor name for the agent executing an SDD command. The actor
attributes SDD records, not Git commits. Do not use a model or session ID, name
an intended recipient instead, impersonate an owner, or override ownership
checks.

Create each approved ticket in dependency order:

```sh
pnpm spindle sdd ticket create --feature <feature-directory> --title "..." --reporter "..." --category enhancement --actor <acting-agent>
```

For machine-readable results, add `--json` and read the success envelope's
`data` field. Errors and notices use structured stderr in this mode.

Complete the new ticket's template, then record dependencies and comments:

```sh
pnpm spindle sdd ticket update --feature <feature-directory> --ticket T-0002 --blocked-by T-0001 --actor <acting-agent>
pnpm spindle sdd ticket comment --feature <feature-directory> --ticket T-0001 --details "..." --actor <acting-agent>
```

Use `--clear-blocked-by` to remove dependencies. Ticket Markdown remains
editable; attributed comments are appended under `## Comments`. Do not add an
execution field to the ticket file.

## Delivery

Use `sdd next` as the source of the next workflow step and exact command. Run it
at the start, after a handoff, and after each completed command or decision.
Use `status` and `ready` only for additional state details.

Use `--type` to select a specialist for `sdd review require`. Check records
apply to the recorded commit, not a caller-selected list of paths. Failed or
unavailable check and review results require `--details` with the evidence.

Inspect feature records for sensitive content before starting the feature
worktree. The start operation confirms those initial records may be committed.
After start, workflow commands commit canonical record changes in the feature
worktree. The implementer commits code on the ticket branch and returns its
assigned report; the controller submits reports and owns all workflow state
changes.

Integrate ticket work serially and record passing post-merge checks before
unblocking dependent tickets. After all tickets are complete, claim delivery
ownership, establish feature checks, and obtain the required feature review.
Declare the complete final-check list before finishing. Run and record those
checks in the original checkout after the feature merge.

If post-merge checks fail, synchronize the ticket worktree to the recorded
merge before correction. If final checks fail, revalidate the target on the
original branch and rerun the complete final-check list. Preserve the journal
and all work if recovery or cleanup is blocked.
