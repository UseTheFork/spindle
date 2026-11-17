---
name: sdd-to-tickets
description: "Break an approved feature spec into tracer-bullet tickets and bounded task plans, then publish them to the configured tracker."
argument-hint: "[spec path or tracker reference]"
disable-model-invocation: true
metadata:
  spindle:
    version: 1.1.0
---

# To Tickets

Break an approved feature spec into **tickets**: independently actionable vertical slices with explicit blocking dependencies. Define a bounded task plan for each ticket that requires one, then publish the tickets and task plans after approval.

An optional argument is one spec path or tracker reference. Read the full spec and its comments before planning. Without an argument, use the approved spec already in context. If the source is missing or ambiguous, ask for a usable reference before proceeding.

## Required Skills

Before drafting tickets, read and apply:

- **REQUIRED:** `private-ref-ears`

## Process

1. **Select the feature and confirm sequence.**
   - Use the spec's existing feature workspace. In Spindle's local tracker, this is a numbered `.spindle/features/<feature-id>-<slug>/` directory containing `spec.md`, `sdd.json`, and `tickets/`. Never create a dated folder or a second workspace for the same feature.
   - If `design.md` exists in the feature workspace, read it and confirm it was completed and approved before the spec. If the spec is not approved or a present design is unfinished, stop and resolve that before ticket planning.
   - A design is optional. Do not require or create one when the approved spec was intentionally written without a design.
   - For local SDD tracker work, use the feature workspace directory with `pnpm spindle sdd` ticket commands. Otherwise follow the configured tracker's documented conventions.

   **Complete when:** one approved spec and its tracker destination are identified; any existing design precedes it and is approved.

2. **Gather context.** Use the conversation and spec as the requirements source. If the user supplies a tracker reference, read its full body and comments. Explore the codebase when needed, using its glossary vocabulary and relevant ADRs. Look for useful prefactoring that reduces implementation difficulty.

   **Complete when:** requirements, relevant project context, and tracker rules are understood.

3. **Draft tickets and task plans.** Break the approved work into tracer-bullet tickets:
   - Each slice is a narrow, complete path through the relevant layers and is verifiable on its own.
   - Each slice fits a fresh context window.
   - Identify only genuine ticket blockers and list tickets in dependency order.
   - A wide mechanical refactor may use expand–migrate–contract sequencing when no vertical slice can remain green.
   - For each ticket that requires a task plan under the tracker guidance, define one or more bounded tasks before implementation. Use one task when the ticket does not need meaningful decomposition; do not force artificial splits.
   - Give each task a title, self-contained instructions, observable acceptance criteria, and explicit repository-relative edit, create, and reference paths. Do not use globs.
   - Keep task dependencies within their parent ticket. Add a dependency only when a task needs another task's output. Ensure the task graph is acyclic and dependencies refer to tasks in the same ticket.
   - Tasks assigned concurrently must not have overlapping edit/create paths. Shared reference paths alone do not require a dependency.
   - Treat task plans as implementation-time inputs: the controller must revalidate their file scopes against the ticket worktree before dispatch. Honor only task-plan exceptions documented and approved by the project; do not create exceptions during planning.

   **Complete when:** every requirement is covered, each ticket is independently actionable, ticket blockers are explicit, and every required task plan is complete.

4. **Get approval.** Present the proposed breakdown as a numbered list. For each ticket, show its title, blockers, and end-to-end behavior; nest its tasks with their objective, acceptance criteria, file scopes, and task dependencies. Ask whether the ticket and task granularity and dependency edges are right and whether anything should be merged or split. Iterate until the user approves both levels. Do not publish before approval.

   **Complete when:** the user approves the ticket breakdown, task plans, and dependency relationships.

5. **Publish tickets and task plans.**
   - For a local Spindle SDD tracker, create each ticket in dependency order with `pnpm spindle sdd ticket create --feature <feature-directory>`. Supply its title, reporter, category (`bug` or `enhancement`), and `--actor` value according to the ticket-tracker guidance. Fill the generated ticket's Requirements and Acceptance Criteria. After creation, use `pnpm spindle sdd ticket update --feature <feature-directory> --ticket <id> --blocked-by <blocker-ids...> --actor <acting-agent>` to record each ticket dependency; omit `--blocked-by` when there are no blockers.
   - Create each approved task plan under its ticket with `pnpm spindle sdd task create`. Supply the ticket, title, instructions, acceptance criteria, and actor. Supply the task's non-empty `--edit-paths`, `--create-paths`, and `--reference-paths` lists as applicable; omit a list when it has no paths. The CLI assigns task-local IDs.
   - Create tasks in dependency order so every `--dependencies` ID already exists. Use the generated task IDs for dependent tasks. Do not edit `sdd.json` directly or duplicate task definitions in ticket Markdown.
   - On resumption, inspect the ledger's existing tickets and tasks before creating more; do not duplicate published work. Task plans can be changed with `pnpm spindle sdd task update` only before implementation is assigned, because assignment freezes the plan.
   - For an external ticket tracker, create one ticket per approved ticket in dependency order and use native blocking relationships when available; otherwise record blockers in each ticket. Represent task plans with the tracker's native task/subtask mechanism and retain the same scopes and dependencies. If the tracker cannot represent tasks, ask where the approved task plans should be recorded before publishing. If the source was an existing ticket, create sub-tickets as required by the tracker.
   - Apply a status only when the project documents it or the user requests it. Do not close or modify a parent ticket.
   - Publishing ends here. Tell the user that delivery begins through the project's documented implementation workflow; do not start worktrees, task dispatch, implementation, or commits.

   **Complete when:** every approved ticket exists with its requirements, acceptance criteria, and blockers, every required task exists with its approved plan and dependencies, and no implementation work has started.
