# Example: sequential tickets in one checkout

Load and follow the `int-subagent-driven-dev` skill; its workflow is authoritative. This example shows a two-ticket dependency graph using the existing checkout and canonical `.scratch` feature directory.

## Pre-flight

Before starting the controller flow, confirm invocation access to `sdd-implementer`, `sdd-code-reviewer`, `sdd-code-slop-reviewer`, `sdd-task-reviewer`, and `sdd-re-review`. If any is unavailable or unconfirmed, stop and tell the user which agents are missing; an agent file alone does not establish access.

The controller reads the spec, ticket comments, repository instructions, and tracker guidance. It records the current checkout, starting revision, user changes, permissions, dependency graph, and `.scratch/2026-10-23-dataset-foundation/` as the canonical feature directory. Ticket 2 depends on ticket 1, so only ticket 1 is initially ready.

On resume, restore the ledger, snapshot, checks, findings, rulings, and round counters before continuing at the recorded gate. Announce each controller flowchart step, including re-entries and decision branches.

The controller resolves report destinations, assigning a separate path to each worker:

```sh
spindle sdd workspace --workspace /repo \
  --reports-dir .scratch/2026-10-23-dataset-foundation/reports --ticket 01
```

## Ticket 1

1. Set `Execution: claimed`, then `Execution: implementing`. Populate the [implementer template](../assets/implementer-prompt.md) in `INITIAL` mode and omit its corrective-only section. Dispatch `sdd-implementer` with canonical sources, criteria, checkout/snapshot, dependencies, file scope, checks and working directory, permissions, and report path. Missing or conflicting inputs cause the worker to request context before proceeding.
2. The implementer edits only assigned code, tests, and `.scratch` files in `/repo`, preserving existing changes and report history. It announces its flowchart steps and announces `RED: <test or behavior>` or `GREEN: <test or behavior>` immediately before test calls. Behavior changes start with failing tests; pure refactors reuse existing tests. After relevant tests pass, it saves the assigned implementation report. Formatting, lint, type checks, and ticket-wide regression checks remain with the controller.
3. The controller verifies the handoff, applies formatting, and runs applicable lint, type, and ticket-wide regression checks. Failed or unavailable required checks block review. Read [review inputs](./review-inputs.md), freeze the snapshot, and dispatch `sdd-code-reviewer`, `sdd-code-slop-reviewer`, and `sdd-task-reviewer` **in parallel**, using their populated [code-review](../assets/code-reviewer-prompt.md), [code-slop](../assets/code-slop-reviewer-prompt.md), and [task-review](../assets/task-reviewer-prompt.md) templates, one shared review-input reference, and distinct report paths. Existing exact diffs and evidence can be referenced without copying logs or duplicating SHA fields. Supply relevant existing findings and rulings; mark same-batch reports not yet available as `NONE - parallel review pending`. Reviewers write only their assigned reports and do not spawn agents or edit implementation files.
4. Wait for **all three reports** before reconciling findings and issuing controller rulings. A failed or unavailable review blocks the gate; it does not permit implementation edits while another reviewer is running.
5. If blocking findings remain, enter the [corrective branch](./corrective-rounds.md). It persists the round before dispatch, supplies corrective-only inputs, checks the fix, and requests scoped re-review before returning to acceptance.
6. Once all required reviews pass and findings are ruled, confirm current evidence covers the delivered snapshot and follow [standalone integration](./integration.md) before starting ticket 2.

Ticket 2 is now ready because ticket 1's accepted changes are already in the same checkout and freshly verified.

## Ticket 2 and finalization

Repeat the ticket gates sequentially for ticket 2; only independent reviewers run in parallel, not implementation workers.

After all tickets are integrated, enter [full-spec delivery](./full-spec.md) for aggregate review, its bounded final-fix path, verification, retrospective, and hand-back.

For a caller-owned ticket rather than this standalone full-spec delivery, return the evidence at the caller-owned hand-back gate; leave integration and acceptance to the caller.

No separate checkout, branch transfer, worktree cleanup, or `.scratch` copy is involved. If a blocking issue remains, preserve the checkout and reports and return an incomplete hand-back.
