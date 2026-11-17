# Ticket Task Dispatch

## Problem Statement

Tickets are currently the smallest implementation assignment. This makes it difficult for a controller to delegate independent work to multiple workers within one ticket while limiting each worker to only the instructions and files needed for that work. The workflow does not track those smaller assignments, their file ownership, dependencies, reports, or controller acceptance.

## Solution

Add task planning and dispatch within tickets. A controller defines bounded tasks, assigns ready tasks to workers sharing the ticket worktree, and records task reports and acceptance through SDD commands. Explicit file scopes and task dependencies allow independent work to proceed concurrently while preventing overlapping writes and premature downstream work. After every task is accepted, the controller commits the combined ticket changes and submits one ticket-level implementation report. Existing ticket review, integration, and post-merge checks remain the ticket completion gates.

## User Stories

### Defining task plans

As a feature controller, I want to define the objective, acceptance criteria, file scope, references, and dependencies for each task so that workers receive bounded, actionable assignments.

- When a controller creates a task, the system shall record its task-local identity, instructions, acceptance criteria, explicit edit/create/reference paths, and dependencies under its ticket.
- When a controller attempts to start implementation for a ticket without tasks, the system shall reject the request and explain that a task plan is required.
- When a controller defines a dependency cycle or references a task that does not exist in the same ticket, the system shall reject the task change.

### Dispatching independent tasks

As a feature controller, I want an assignment command to reserve a task and produce its complete handoff so that I can dispatch multiple independent workers without requiring each worker to explore the full feature.

- When a controller assigns a ready task, the system shall record the assignment and output the task instructions, task acceptance criteria, parent ticket requirements and acceptance criteria, file scope, explicit references, shared ticket worktree, and report destination.
- When a controller requests instructions for an assigned task, the system shall output the current handoff without changing workflow state.
- When two active tasks have overlapping edit/create paths, the system shall prevent both tasks from running concurrently.
- When active tasks share only reference paths, the system shall allow them to run concurrently.
- When a task depends on another task, the system shall keep it unavailable for assignment until the dependency is accepted.

### Reviewing task reports

As a feature controller, I want to record task reports and accept work or request changes so that task progress and readiness reflect reviewed results rather than worker claims.

- When a controller records a task report, the system shall mark the task as submitted and retain its file reservations.
- When a controller accepts a submitted task, the system shall mark it accepted, release its file reservations, and make its dependent tasks eligible when their other prerequisites are satisfied.
- When a controller requests changes, the system shall retain the task's file reservations until the task is accepted.
- The system shall allow only the controller to change task workflow state; workers shall return reports without editing the SDD ledger or committing code.

### Completing a ticket

As a feature controller, I want the existing ticket-level review and integration process to assess one stable commit after task work is complete so that parallel task execution does not weaken ticket acceptance.

- While any task is not accepted, the system shall prevent ticket implementation submission and ticket completion.
- When all tasks are accepted, the controller shall commit the combined ticket changes and submit one ticket-level implementation report.
- After that report is submitted, the system shall continue through the existing ticket checks, review, integration, and post-merge validation.

## Implementation Decisions

- Tasks are structured data nested under their ticket in the feature ledger. Ticket Markdown remains the source for parent requirements, acceptance criteria, and comments; task definitions are not duplicated in the ticket template.
- Task IDs start at `TASK-0001` and are unique within each ticket.
- Each task has a title, instructions, task-specific acceptance criteria, explicit repository-relative paths to edit, create, and reference, optional dependencies on other tasks in the same ticket, and tracked workflow state. File scopes do not use globs.
- Task states are unassigned, assigned, submitted, accepted, and changes-requested. Readiness is derived from task dependencies and active file-scope conflicts; tasks do not have a separate blocked status or manual blocker reason.
- Edit and create paths reserve exclusive write ownership while a task is assigned, submitted, or changes-requested. Reservations end when the controller accepts the task. Reference paths do not reserve files; dependencies express when a task needs another task's completed output.
- The controller is the only writer of task state and the sole Git writer for ticket task work. Workers return task reports and do not commit. The controller accepts or requests changes through SDD commands.
- Task assignment records the assignment and produces a self-contained handoff. A read-only instructions operation can reproduce the handoff. The handoff includes the parent ticket requirements and acceptance criteria and only the task's explicit reference files; feature design and spec are included only when explicitly referenced.
- Task-specific checks are not required. The controller assesses each task against its acceptance criteria. Existing ticket-level checks and review remain after all tasks are accepted.
- The task plan is required before ticket implementation starts. The ticket implementation command establishes or resumes the shared ticket worktree for the controller; it does not dispatch a whole-ticket implementation worker.
- Task state changes use SDD commands. Direct edits to the feature ledger are not supported.
- The ticket task workflow changes ticket implementation commit ownership. Delivery assignments and other workflows remain unchanged.
- Do not add general migration or compatibility support for prior SDD ledger schemas. As a rollout exception, convert this feature's active schema-version-3 ledger once when the new schema is introduced, so this feature workspace can continue tracking its own delivery.

## Testing Decisions

- Validate task ledger entries, task-local IDs, required fields, explicit path syntax, dependency existence and cycles, and task state.
- Exercise task creation, assignment, handoff generation, report submission, acceptance, changes-requested handling, readiness, dependency gating, and file-scope conflicts through the existing SDD service test seams.
- Exercise the task command surface and its user-facing handoff, including read-only instruction retrieval and controller-only state changes.
- Exercise the ticket workflow to verify that tasks are required before implementation, unaccepted tasks prevent ticket submission/completion, and the existing ticket review, integration, and post-merge gates remain effective after all tasks are accepted.

## Out of Scope

- Removing ticket Markdown or the ticket template.
- Tasks that span multiple tickets, or task dependencies across tickets.
- Automatically launching subagents from an SDD command.
- Separate task worktrees, task-level commits, or parallel writes to the same file.
- Read reservations for reference files.
- Task-specific check requirements.
- Replacing or changing ticket-level review, integration, or post-merge validation.

## Further Notes

No unresolved requirements decisions remain. Prior SDD ledger schemas remain unsupported; only this feature's active ledger receives a one-time conversion during rollout.
