---
name: sdd-to-tickets
description: "Break an approved feature spec into tracer-bullet tickets with explicit blockers, then publish them to the configured ticket tracker."
argument-hint: "[spec path or tracker reference]"
disable-model-invocation: true
metadata:
  spindle:
    version: 1.0.0
---

# To Tickets

Break an approved feature spec into **tickets**: independently actionable vertical slices with explicit blocking dependencies.

An optional argument is one spec path or tracker reference. Read the full spec and its comments before planning. Without an argument, use the approved spec already in context. If the source is missing or ambiguous, ask for a usable reference before proceeding.

## Process

1. **Select the feature and confirm sequence.**
   - Use the spec's existing feature workspace. In Spindle's local tracker, this is a numbered `.scratch/<feature-id>-<slug>/` directory containing `spec.md`, `sdd.json`, and `tickets/`. Never create a dated folder or a second workspace for the same feature.
   - If `design.md` exists in the feature workspace, read it and confirm it was completed and approved before the spec. If the spec is not approved or a present design is unfinished, stop and resolve that before ticket planning.
   - A design is optional. Do not require or create one when the approved spec was intentionally written without a design.
   - For local SDD tracker work, use the feature's `spec.md` path with `pnpm spindle sdd` ticket commands. Otherwise follow the configured tracker's documented conventions.

   **Complete when:** one approved spec and its tracker destination are identified; any existing design precedes it and is approved.

2. **Gather context.** Use the conversation and spec as the requirements source. If the user supplies a tracker reference, read its full body and comments. Explore the codebase when needed, using its glossary vocabulary and relevant ADRs. Look for useful prefactoring that reduces implementation difficulty.

   **Complete when:** requirements, relevant project context, and tracker rules are understood.

3. **Draft vertical slices.** Break the approved work into tracer-bullet tickets:
   - Each slice is a narrow, complete path through the relevant layers and is verifiable on its own.
   - Each slice fits a fresh context window.
   - Identify only genuine blockers and list tickets in dependency order.
   - A wide mechanical refactor may use expand–migrate–contract sequencing when no vertical slice can remain green.

   **Complete when:** every requirement is covered, each ticket is independently actionable, and blocking relationships are explicit.

4. **Get approval.** Present the proposed breakdown as a numbered list. For each ticket, show its title, blockers, and end-to-end behavior. Ask whether the granularity and dependency edges are right and whether anything should be merged or split. Iterate until the user approves. Do not publish before approval.

   **Complete when:** the user approves the ticket breakdown and blocker relationships.

5. **Publish the tickets.**
   - For a local Spindle SDD tracker, create each ticket in dependency order with `pnpm spindle sdd ticket create --spec <absolute-spec-path>`. Supply its title, reporter, category (`bug` or `enhancement`), and author. Fill the generated ticket's Requirements and Acceptance Criteria using the tracker guidance. After creation, use `pnpm spindle sdd ticket update --spec <absolute-spec-path> --ticket <id> --blocked-by <blocker-ids...> --author <author>` to record each dependency; omit `--blocked-by` when there are no blockers. Keep the approved spec and feature ledger authoritative.
   - For an external ticket tracker, create one ticket per approved ticket in dependency order and use native blocking relationships when available; otherwise record blockers in each ticket. If the source was an existing ticket, create sub-tickets as required by the tracker.
   - Apply a status only when the project documents it or the user requests it. Do not close or modify a parent ticket.
   - Publishing ends here. Tell the user that delivery begins through the project's documented implementation workflow; do not start implementation.

   **Complete when:** every approved ticket exists in the configured tracker with its acceptance criteria and blockers, and no implementation work has started.
