# Ticket 04 implementation report

## Status

**DONE**

## Snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `c10f0602f1966a1701ded3fcc5ae879cff3781aa`
- Final revision: `c10f0602f1966a1701ded3fcc5ae879cff3781aa` (no commit; controller owns integration)
- Starting worktree: clean except the controller-owned ticket claim marker.
- Tested snapshot: the starting revision plus the ticket 04 implementation and test changes listed below. No code or test files changed after the final verification. The report was added after those checks.
- Final dirty files: controller-owned claim marker in `issues/04-per-run-computed-context.md`; `docs/blueprints.md`; `src/blueprints/lifecycle.ts`; `src/commands/init/init-command.ts`; `src/commands/update/update-command.ts`; new `src/computed/computed-context.ts`; deleted `src/computed/resolve.ts`; and `tests/computed-variables.test.ts`. The report is new at this path. No other user changes were present; no commit was made.

## Criteria, changes, and tests

- Moved computed-value resolution and per-run context memoization into `ComputedContextService`, an application-managed fresh service. The service snapshots and freezes provider Config inputs and preserves keyed provider failures with the original cause.
- Reconciliation lazily creates one fresh context service through its owning App and shares it throughout that reconciliation. Init and Update pass their App; no old resolver exports or adapters remain.
- Kept provider classes and their `ResolvedConfig` contract unchanged. Existing computed namespace, Variables distinction, generated output, and Config non-persistence assertions remain in place.
- Extended `tests/computed-variables.test.ts` to cover concurrent context requests, provider evaluation count, immutable copied inputs, changed values on a later run, separate-App isolation, provider errors, and two Update runs through the same App. It asserts rendered output and Config behavior.
- Updated `docs/blueprints.md` with the service lifetime and provider-input guarantees.
- TDD evidence: the first new-service test was run RED because the intended `computed-context.ts` module did not yet exist (`ERR_MODULE_NOT_FOUND`). After implementing the service and migrating the direct-import error test, the focused computed tests passed. The repeated workflow behavior was already present across the old resolver function; its new same-App characterization passed after reconciliation wiring. No prior behavior assertions were weakened.

## Verification run

- `just test::test tests/computed-variables.test.ts tests/rendering.test.ts tests/coordinated-preparation.test.ts tests/init.test.ts tests/update.test.ts tests/install.test.ts tests/app.test.ts` — passed; 81 tests, 0 failures.
- `just test::types` — passed; exit code 0.
- `git diff --check` — passed.
- Legacy resolver search across `src` and `tests` — no matches for `createComputedContextResolver`, `resolveComputedVariables`, or `computed/resolve`.

## Review and remaining checks

- Self-review found no known implementation concerns. The old resolver module was removed rather than retained as a compatibility export. Provider classes do not inherit `Service`.
- Not run: formatting, lint, build, full test suite, or ticket-wide regression checks. These remain pending with the controller and are not implementer failures or evidence of ticket acceptance.

## Hand-back

Ticket 04 implementation and focused verification are complete at the uncommitted working-tree snapshot above. No commit was authorized or created. Controller integration and broader checks remain pending.

## Final review and controller acceptance

- Code review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/4-code-review.md` found no Critical, Important, or Minor findings; Ready to merge.
- Code-slop review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/4-slop-review.md` found no material slop.
- Spec/Quality task review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/4-task-review.md` passed both with no findings.
- The frozen review snapshot and evidence are recorded in `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/4-review-inputs.md`. Reviewers confirmed the supplied file hashes and reported no snapshot mismatch.
- Controller checks on that candidate: format and lint checks passed for the six changed source/test/docs files, types passed, the focused suite passed 81/81, `just build` passed, the full suite passed 197/197, and `just tool::git diff --check` passed.
- All ten ticket criteria are complete. Ticket 04 is accepted and marked `Execution: integrated`; controller integration is now proceeding.
