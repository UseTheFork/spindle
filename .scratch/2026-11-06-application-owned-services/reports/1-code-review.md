# Code Review Report — Ticket 01

## Strengths

- `App` requires explicit workspace and Blueprint source roots and stores them in private fields; `Service` receives and exposes its owning `App` without inheriting from it (`src/app.ts:3-8, 24-44, 153-170`). The module has no CLI, filesystem, or working-directory side effects on import.
- Construction precedes asynchronous `boot()`, and readiness is recorded only after successful boot (`src/app.ts:140-150, 153-170`). Singleton boot failures are removed from the in-flight map so later retrieval can retry.
- The public API tests exercise singleton identity and delayed readiness, fresh-instance identity, application isolation, failures/retry, and singleton/fresh cycle behavior. They also cover shared non-cyclic dependencies and a cycle formed across concurrent branches (`tests/app.test.ts`).
- The F-01 correction is narrow: it preserves the `.agent.md` link prohibition and relative-link target validation while permitting valid links to `SKILL.md` (`tests/stubs.test.ts:123-137`).

## Issues

### Critical

None.

### Important

- **F-02 — `src/app.ts:48-51, 95-101`:** `get()` checks whether the constructor appears anywhere in the current resolution chain before checking whether a successfully booted singleton is already cached. Thus, after `await app.get(S)`, a fresh `S` instance whose `boot()` calls `await this.app.get(S)` to use that existing singleton is rejected with `Circular service dependency: S -> S`. The dependency is not cyclic: the singleton is already initialized, but the ancestry check prevents the cache return at lines 50-51. This makes a valid fresh-instance dependency fail and conflates constructor identity with an unresolved instance dependency. Check for an initialized singleton before treating repeated constructors as a cycle; add a public API regression test for a fresh service resolving its already-booted same-type singleton, while retaining tests for actual in-flight singleton and fresh-instance cycles.

### Minor

None.

## Recommendations

None beyond the correction requested in F-02.

## Checks

- **Reviewed snapshot:** base/HEAD `2274427687067aeb7c471a68bf2405b12de04d77` plus the current uncommitted contents of `src/app.ts` (untracked), `tests/app.test.ts` (untracked), and the one-line `tests/stubs.test.ts` correction. The live inventory matched the supplied review-input package; the modified ticket and `.scratch` reports were excluded workflow artifacts. No snapshot mismatch was found.
- **Reviewer-run:** `just test::test tests/app.test.ts` — passed, 9 tests, on the reviewed checkout. A separate read-only Node probe reproduced F-02 by initializing `S` as a singleton and then creating `S` whose boot retrieves that singleton; it returned `Circular service dependency: S -> S`.
- **Supplied controller evidence**, documented in the review-input package and implementation report and identified there as covering this corrected snapshot: `just format::check src/app.ts tests/app.test.ts tests/stubs.test.ts` passed; `just lint::check src/app.ts tests/app.test.ts tests/stubs.test.ts` passed; `just test::types` passed; and `just test::test` passed with 187 tests and 0 failures.
- **Supplied implementer evidence:** `just test::test tests/stubs.test.ts` passed with 8 tests, including the corrected production-install assertions and relative-link validation.
- I did not independently run the full suite, formatting, lint, type check, or build. The supplied checks are attributed above rather than claimed as reviewer-run. No build result was included in the assigned evidence.
- Coverage included the complete new application module and API tests, the complete changed assertion context, the ticket/spec, listed repository guidance and ADRs, and supplied verification history. I did not modify implementation files, the index, HEAD, branches, or ticket state.

## Declined to judge

- CLI root discovery, command/service migration, Blueprint reconciliation, computed-context lifetimes, and packaged execution are broader spec behaviors not implemented in this ticket’s supplied change inventory. They were not judged here; this review covers the application/service construction lifecycle and the specifically authorized F-01 assertion correction.

## Assessment

**Ready to merge? No.** F-02 is an Important correctness issue in cycle handling. Correct the false rejection and add regression coverage, then obtain fresh checks for the corrected snapshot. The final acceptance decision belongs to the controller.
