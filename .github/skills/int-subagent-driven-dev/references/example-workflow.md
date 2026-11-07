# Example: sequential tickets in one checkout

Load and follow the `int-subagent-driven-dev` skill; its workflow is authoritative. This example uses the existing checkout, current triage fields, and canonical dated `.scratch` directory.

## Pre-flight

Confirm actual invocation access to `sdd-implementer` and `sdd-reviewer`. Read the spec, ticket comments, instructions, and tracker guidance. Record checkout, baseline, permissions, criteria/seams, dependency graph, and report destinations. Ticket 2 depends on ticket 1, so only ticket 1 is initially eligible.

On resume, restore the recorded gate, snapshot, findings, rulings, checks, attempts, and progress assessments. Announce each flowchart entry and decision without restarting completed work.

## Ticket 1

1. Set `Execution: claimed`, then `Execution: implementing`. Dispatch `sdd-implementer` with the [implementer template](../assets/implementer-prompt.md) in `INITIAL` mode and assign `01-implementation.md` inside the canonical reports directory. Supply complete requirements, criteria/seams, scope, checkout/snapshot, dependencies, checks, and permissions.
2. Verify its focused-test handoff, then perform controller formatting, lint, type, and applicable regression checks. Reuse current passing evidence; failed/unavailable required evidence blocks review.
3. Read [review inputs](review-inputs.md), freeze the snapshot, and set `Execution: in-review`. Dispatch one `sdd-reviewer` using the [reviewer template](../assets/reviewer-prompt.md) in `INITIAL` mode with complete shared inputs and `01-review.md`. Wait for its comprehensive Spec/Quality report before allowing further implementation.
4. Reconcile stable finding IDs and record rulings. If two compatible blockers remain, set `Execution: changes-requested`, record a supported [continuation decision](corrective-rounds.md#continuation-decision), persist attempt 1, and dispatch one corrective implementer assignment containing both findings.
5. Verify the fix handoff and invalidated controller checks once. Freeze the fixed snapshot and dispatch the same reviewer role in `CORRECTIVE` mode to `01-round-1-review.md`, supplying both finding IDs, fix-only changes, prior/fixed identities, initial verdicts, and fresh checks. Do not repeat three separate review phases or redo unaffected initial coverage.
6. Record per-finding dispositions and progress. If another concrete blocker remains and progress supports continuation, record another attempt; if the same blocker recurs or requirements conflict, pause for adjudication. Attempt 5 is not an automatic stop, and attempt 6 is not automatically justified.
7. Once both verdicts pass and blockers are resolved, set `Execution: accepted`, confirm coverage, and follow [standalone integration](integration.md) under established permissions before claiming ticket 2.

## Ticket 2 and finalization

Ticket 2 becomes eligible only after ticket 1 is integrated. Repeat sequentially; never overlap implementation workers or implementation with review.

For standalone full-spec delivery, follow [full-spec delivery](full-spec.md): one aggregate comprehensive review, progress-based batched corrections and scoped verification if needed, final verification/integration, the current required delivery retrospective, and hand-back. Delivery attempts are separate from ticket attempts and are not capped at one.

Caller-owned tickets hand back with current evidence at the ownership gate, leaving integration to the caller. Preserve the checkout, report history, and all unresolved blockers on incomplete delivery.
