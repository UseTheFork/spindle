## F-02 — ADDRESSED

**Summary:** `App.get()` now returns an already initialized singleton before applying constructor-ancestry cycle detection, so fresh-instance boot can use the existing same-type singleton.

**Evidence:** `src/app.ts:46-51` checks `#services` and returns the cached service at lines 47-48 before reading the resolution chain and invoking `#assertNoAncestorCycle()` at lines 50-51. Only successful boot is added to `#services` (`src/app.ts:59-64`), so in-flight/unresolved services still follow ancestry and dependency-graph cycle checks. The public regression at `tests/app.test.ts:116-144` initializes the singleton, then creates a distinct instance whose `boot()` retrieves that singleton and verifies it is booted, identity is retained, fresh boot succeeds, and exactly two instances boot.

**Current covering-test evidence:** Controller-reported `just test::test tests/app.test.ts` passed 10 tests and `just test::test` passed 188 tests with 0 failures on the exact corrected snapshot identified below. The implementer also reported intended RED (10 tests, 9 passed/1 failed with the false-cycle error) and GREEN (10 passed) for this regression. These results were inspected, not run by this reviewer.

## T01-R-01 — ADDRESSED

**Summary:** The same cache-order correction resolves this adjudicated duplicate of F-02 while preserving rejection of actual unresolved dependency cycles.

**Evidence:** The fixed ordering is at `src/app.ts:46-51`; a cache miss continues through in-flight lookup and dependency linking (`src/app.ts:53-78`), and `create()` retains its ancestry guard (`src/app.ts:82-90`). Public tests still assert real singleton and fresh-instance cycle chains at `tests/app.test.ts:146-190`, concurrent non-cyclic sharing at `tests/app.test.ts:192-248`, and a cycle reached through concurrent singleton branches at `tests/app.test.ts:250-285`. The added same-type test at `tests/app.test.ts:116-144` exercises the formerly rejected non-cycle through the public API.

**Current covering-test evidence:** The same supplied focused result (10 passed) and full-suite result (188 passed, 0 failures) cover the current fixed snapshot; the implementer's RED/GREEN evidence and controller results are attributed in Checks and Snapshot.

## New Breakage in the Fix Diff

**None.** The fix-only production diff only moves the successful-cache lookup ahead of ancestry detection (`src/app.ts`, 3 insertions/3 deletions); the test diff adds the focused public API regression (`tests/app.test.ts`, 30 insertions). Review of the surrounding resolver and retained cycle tests found no regression or expanded contract change.

## Updated Spec and Quality

- **Spec: PASS** for the reviewed ticket scope. The prior task review recorded 11/12 criteria passing and criterion 7 failing because of T01-R-01. The corrected test and cache ordering address that sole recorded criterion failure; the other criteria evidence is unchanged by this fix.
- **Quality: PASS** for the assigned findings and fix. The test verifies observable public behavior and identity without inspecting private resolver state; actual singleton, fresh-instance, and concurrent graph cycles remain covered.
- **Code-review readiness:** F-02 and its adjudicated duplicate T01-R-01 are addressed; no new Critical or Important breakage was found.
- **Initial task review:** It did occur; its prior Spec and Quality verdicts were FAIL solely on T01-R-01. No initial task review was pending at this assignment. This scoped re-review updates the assigned finding and does not restart the full review or replace the original review of unaffected criteria.
- **Expanded review requested:** None; the fix changes only cache-check ordering and its public regression coverage.

## Out-of-Scope Observations

None.

## Verdict

**Round complete for the assigned findings:** both findings are ADDRESSED, no new Critical/Important breakage remains, and Spec and Quality are PASS. Final acceptance remains with the controller.

## Checks and Snapshot

- **Exact fixed snapshot:** HEAD/base `2274427687067aeb7c471a68bf2405b12de04d77`, plus the following current working-tree content:
  - `src/app.ts` — SHA-256 `1e7e5324f5a6d93b83ef078fb2dd12610f2608025a5af79356475ca115143f9e`; Git blob `9ca35d8ed8ffcfde7f8787f711060d4451f07aeb`.
  - `tests/app.test.ts` — SHA-256 `4ddcc602b25a6ded171ce96cd113dbe6fee3aefc7d4cf5c7e309973931257b30`; Git blob `ff3f365d2b7e9f4cc39d6b1f0db45836b68332ed`.
  - `tests/stubs.test.ts` — preserved round-1 change; SHA-256 `9e5fbd8fae6696aa7591dcc7def813d9905075c193b67a8ed7279c6a714f49d9`; Git blob `d51a12b231651866ac3ae41892048316ecf1946a`.
- **Fix base and complete fix diff:** The supplied prior dirty snapshot was HEAD plus `src/app.ts` blob `a14fac5201f28fcad2a55af79c0cb5cb7e4d78a9`, `tests/app.test.ts` blob `82b68e66487182584100a9aa4bf2317943f4445b`, and preserved `tests/stubs.test.ts` blob `d51a12b231651866ac3ae41892048316ecf1946a`. Read-only comparison against the supplied corrected blobs showed `src/app.ts` 3 insertions/3 deletions and `tests/app.test.ts` 30 insertions; no other round-2 implementation file changed. The `tests/stubs.test.ts` correction is from round 1 and unchanged in this round.
- **Snapshot/inventory confirmation:** Reviewer-run `git rev-parse HEAD`, `git status --short`, `sha256sum`, and `git hash-object` matched the supplied identities and inventory. The worktree contained the modified controller ticket, preserved `tests/stubs.test.ts` change, untracked `src/app.ts`, `tests/app.test.ts`, and report directory; the ticket and `.scratch` reports are workflow artifacts excluded from the fix diff. No snapshot mismatch was found.
- **Reported verification inspected (not reviewer-run):** Controller reports `just format::check src/app.ts tests/app.test.ts tests/stubs.test.ts` passed; `just lint::check src/app.ts tests/app.test.ts tests/stubs.test.ts` passed; `just test::types` passed; `just test::test tests/app.test.ts` passed 10 tests; and `just test::test` passed 188 tests, 0 failures. The implementer's RED/GREEN focused test evidence was also inspected. Ticket 01 did not require a build.
- **Reviewer-run checks:** No project tests, formatting, lint, type check, or build were run. Snapshot inspection and read-only diff/hash comparisons succeeded. No named doubt required a focused rerun; supplied current evidence covers the exact fixed snapshot.
- **Limitations:** This is the assigned scoped re-review, not a restart of the full task review. The previous task-review evidence for unaffected criteria is retained; the controller owns final acceptance.
