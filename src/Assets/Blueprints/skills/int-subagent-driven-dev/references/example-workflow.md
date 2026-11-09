# Example: sequential tickets in one checkout

Load and follow the `int-subagent-driven-dev` skill; its workflow is authoritative. This example uses the existing checkout, issue triage fields, and the feature's canonical `.scratch` directory.

## Pre-flight

Confirm actual invocation access to `sdd-implementer` and `sdd-reviewer`. Read the spec, issue comments, instructions, and tracker guidance. Record checkout, baseline, permissions, criteria/seams, dependency graph, and report destinations. Inspect `sdd next --spec <path>` or `sdd status --spec <path>` for permitted actions, pending assignments, and blockers. Issue 2 depends on issue 1, so only issue 1 is initially eligible.

On resume, use `sdd resume --spec <path> --issue <id> --author <controller>` to restore the existing gate and assignment. If the controller changes, add `--confirm-handoff` only after confirming the prior worker stopped. Restore the recorded snapshot, findings, rulings, checks, attempts, and progress assessments without restarting completed work.

## Ticket 1

1. Commit preparation documents, issue/triage updates, and every other checkout change. Run `sdd claim --spec <path> --issue I-0001 --author controller`; the command rejects staged, unstaged, and untracked changes and records the clean starting revision only on success. Run `sdd implement --spec <path> --issue I-0001 --author controller`; it persists an implementation assignment and returns its stable report path without launching an agent. Dispatch `sdd-implementer` with the [implementer template](../assets/implementer-prompt.md) in `INITIAL` mode and pass that exact path with the complete requirements, criteria/seams, scope, checkout/snapshot, dependencies, checks, and permissions.
2. Register the returned report with `sdd submit --spec <path> --issue I-0001 --role implementation --report <assigned-path> --author controller`. A missing report is not complete; record unavailability explicitly with `--unavailable --details <reason>`. Then perform controller formatting, lint, type, and applicable regression checks. Reuse current passing evidence; failed/unavailable required evidence blocks review.
3. Read [review inputs](review-inputs.md), freeze the snapshot, and set `Execution: in-review`. Dispatch one `sdd-reviewer` using the [reviewer template](../assets/reviewer-prompt.md) in `INITIAL` mode with complete shared inputs and `01-review.md`. Wait for its comprehensive Spec/Quality report before allowing further implementation.
4. Reconcile stable finding IDs and record rulings. If two compatible blockers remain, set `Execution: changes-requested`, record a supported [continuation decision](corrective-rounds.md#continuation-decision), persist attempt 1, and dispatch one corrective implementer assignment containing both findings.
5. Verify the fix handoff and invalidated controller checks once. Freeze the fixed snapshot and dispatch the same reviewer role in `CORRECTIVE` mode to `01-round-1-review.md`, supplying both finding IDs, fix-only changes, prior/fixed identities, initial verdicts, and fresh checks. Do not repeat three separate review phases or redo unaffected initial coverage.
6. Record per-finding dispositions and progress. If another concrete blocker remains and progress supports continuation, record another attempt; if the same blocker recurs or requirements conflict, pause for adjudication. Attempt 5 is not an automatic stop, and attempt 6 is not automatically justified.
7. Once both verdicts pass and blockers are resolved, set `Execution: accepted`, confirm coverage, and follow [standalone integration](integration.md) under established permissions before claiming ticket 2.

## Ticket 2 and finalization

Ticket 2 becomes eligible only after ticket 1 is integrated. Repeat sequentially; never overlap implementation workers or implementation with review.

For standalone full-spec delivery, follow [full-spec delivery](full-spec.md): one aggregate comprehensive review, progress-based batched corrections and scoped verification if needed, final verification/integration, the current required delivery retrospective, and hand-back. Delivery attempts are separate from ticket attempts and are not capped at one.

Caller-owned tickets hand back with current evidence at the ownership gate, leaving integration to the caller. Preserve the checkout, report history, and all unresolved blockers on incomplete delivery.
