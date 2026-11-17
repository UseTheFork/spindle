# Ticket Tracker: Local Markdown

Spindle SDD stores feature work in `.spindle/features/` workspaces. A workspace contains an approved `spec.md`, its `sdd.json` execution ledger, `tickets/`, and `reports/`. A design is optional; when present, complete and approve it before the spec. Derive tickets from the approved spec.

## Ticket format

- Each ticket is `tickets/T-0001.md`, with IDs starting at `T-0001` independently in each feature. IDs use at least four digits.
- `sdd.json` is authoritative for ticket metadata, status, dependencies, and execution state. Ticket Markdown contains only its ID in YAML front matter; requirements, acceptance criteria, and comments are the editable body.
- Task definitions are stored in the ledger under their parent ticket, not duplicated in ticket Markdown. Use SDD task commands to create and update them.
- Ticket creation copies the shared template, including `[REQUIREMENTS]` and `[ACCEPTANCE CRITERIA]` placeholders. Fill both before implementation.
- Ticket status is `open` or `closed`. The workflow closes a ticket after integration and passing post-merge checks; do not set status manually. Dependencies must refer to existing tickets; cycles are rejected.
- Task status is `unassigned`, `assigned`, `submitted`, `accepted`, or `changes-requested`. The controller owns task state changes; workers return reports and do not edit the ledger.
- There is no general migration or compatibility support for `issues/`, `I-####`, or previous SDD ledger schemas. The active `0001-ticket-task-dispatch` workspace receives a one-time schema-version-3 to schema-version-4 conversion when it starts; all other previous ledger schemas remain unsupported.

## Create and maintain tickets

Use the configured actor name for the agent executing an SDD command. The actor attributes SDD records, not Git commits. Do not use a model or session ID, name an intended recipient instead, impersonate an owner, or override ownership checks.

Create each approved ticket in dependency order:

```sh
pnpm spindle sdd ticket create --feature <feature-workspace> --title "..." --reporter "..." --category enhancement --actor <acting-agent>
```

For machine-readable results, add `--json` and read the success envelope's
`data` field. Errors and notices use structured stderr in this mode.

Complete the new ticket's template, then record dependencies and comments:

```sh
pnpm spindle sdd ticket update --feature <feature-workspace> --ticket T-0002 --blocked-by T-0001 --actor <acting-agent>
pnpm spindle sdd ticket comment --feature <feature-workspace> --ticket T-0001 --details "..." --actor <acting-agent>
```

Use `--clear-blocked-by` to remove dependencies. Ticket Markdown remains editable; attributed comments are appended under `## Comments`. Do not add an execution field to the ticket file.

## Create and maintain task plans

Define the task plan before starting ticket implementation. Unless the project has a documented, approved exception, each ticket must have at least one task. Use one task when the ticket does not need meaningful decomposition; do not split work artificially.

Each task has a title, self-contained instructions, non-empty acceptance criteria, explicit repository-relative paths to edit, create, and reference, optional dependencies on other tasks in the same ticket, and tracked workflow state. Do not use globs. List only paths relevant to that task. Edit/create paths reserve exclusive write ownership while a task is assigned, submitted, or changes-requested; accepted tasks release those reservations. Tasks assigned concurrently must not overlap edit/create paths. Tasks may share reference paths. Add a dependency when a task needs another task's output, not merely to serialize unrelated work.

Task IDs start at `TASK-0001` and are assigned by the CLI, uniquely within their ticket. Create dependencies first; a task can depend only on an existing task in the same ticket, and cycles are rejected.

```sh
pnpm spindle sdd task create --feature <feature-workspace> --ticket T-0001 --title "..." --instructions "..." --acceptance-criteria "..." --edit-paths <paths...> --create-paths <paths...> --reference-paths <paths...> --dependencies <task-ids...> --actor <acting-agent>
```

Provide only the non-empty path lists and `--dependencies` that apply. Before creating tasks, obtain approval for their objectives, acceptance criteria, scopes, and dependencies. On resumption, inspect existing tasks before creating more. Use `pnpm spindle sdd task update` to revise a task plan before implementation assignment; assignment freezes the plan.

## Task-based ticket implementation

Define the ticket's task plan before starting implementation. The controller
starts or resumes one shared ticket worktree and coordinates task workers there.
Before dispatch, revalidate task scopes against the current ticket worktree and
the results of prerequisite tasks.
Workers edit only their assigned task file scope and return task reports; they
do not change workflow state or commit. The controller reviews each task report
and accepts the task or requests changes. Do not submit a ticket implementation
report or complete the ticket while any task is not accepted. After all tasks
are accepted, the controller commits the combined ticket changes and submits
one ticket-level implementation report. Existing ticket checks, review,
integration, and post-merge validation remain required.

## Delivery

Use `sdd next` as the source of the next workflow step and exact command. Run it at the start, after a handoff, and after each completed command or decision. Use `status` and `ready` only for additional state details.

Use `--type` to select a specialist for `sdd review require`. Check records apply to the recorded commit, not a caller-selected list of paths. Failed or unavailable check and review results require `--details` with the evidence.

Unavailable implementation reports remain open assignments; submit the report if it becomes available and the assigned worktree has a clean new commit. An older corrective assignment without a starting commit must first be resumed with the same `sdd correct` command, then committed before submission. Retry an unavailable delivery check and record the actual result. The latest result for a check and commit supersedes earlier results; a current failed check or failed review still requires a correction decision.

To defer a blocking finding, commit the approved requirements change, record its approval, and obtain fresh passing review coverage before recording the deferral. Delivery deferrals require the same evidence.

Inspect feature records for sensitive content before starting the feature worktree. The start operation confirms those initial records may be committed. After start, workflow commands commit canonical record changes in the feature worktree. For task-based ticket work, workers return task reports without committing; the controller commits the combined ticket changes and submits the ticket-level report. The controller owns all workflow state changes.

Integrate ticket work serially and record passing post-merge checks before unblocking dependent tickets. After all tickets are complete, claim delivery ownership, establish feature checks, and obtain the required feature review. Declare the complete final-check list before finishing. Run and record those checks in the original checkout after the feature merge.

If post-merge checks fail, synchronize the ticket worktree to the recorded merge before correction. If final checks fail, revalidate the target on the original branch and rerun the complete final-check list. Preserve the journal and all work if recovery or cleanup is blocked.
