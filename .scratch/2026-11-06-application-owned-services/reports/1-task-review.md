## Spec Compliance — FAIL

**Spec verdict: FAIL.** Eleven of the twelve ticket criteria pass. Criterion 7 fails for a valid dependency path involving a fresh instance and an already-resolved singleton of the same service type; see `T01-R-01`.

| # | Criterion | Spec | Quality | Diff evidence |
|---|---|---|---|---|
| 1 | Import-safe `App` and shared service base; base stores the owner and services do not inherit from `App`. | PASS | PASS | `src/app.ts:1-21,154-171` exports `App` and `Service`; `Service` stores its owner and is not an `App` subclass. Module top level contains only imports, a `WeakSet`, and a helper. |
| 2 | Immutable explicit roots and isolated application state; no ambient working-directory lookup. | PASS | PASS | `src/app.ts:23-40` stores explicit roots in private fields exposed through getters; maps are instance fields. `tests/app.test.ts:6-26,292-315` checks distinct roots and application-local instances. |
| 3 | Empty asynchronous base boot; constructors do not resolve dependencies, start async work, or run workflows. | PASS | PASS | `src/app.ts:29-32,156-160,171` constructors only store roots/owner; base `boot()` is empty and async. |
| 4 | Managed boot runs after derived construction/field initialization; dependencies can be awaited during boot. | PASS | PASS | `src/app.ts:143-151` constructs before calling `boot()`. `tests/app.test.ts:28-83` verifies derived-field availability and delayed async boot. |
| 5 | Read-only readiness is application-managed and becomes true only after successful boot; successful instances are not rebooted on retrieval. | PASS | PASS | `src/app.ts:149-150,165-167` marks readiness only after boot resolves and exposes a getter. `tests/app.test.ts:28-83,85-114,261-290` checks readiness, read-only behavior, and single boot across repeated retrieval. |
| 6 | Singleton retrieval is always asynchronous, shares identity and in-flight initialization within one application, and never exposes incomplete instances. | PASS | PASS | `src/app.ts:46-79`; `tests/app.test.ts:28-83` verifies delayed shared initialization and pending requests, and `85-114,261-290` checks repeated identity. |
| 7 | Fresh creation is always asynchronous, boots a distinct instance, and does not register it as the singleton. | **FAIL** | **FAIL** | `src/app.ts:82-90` makes `create()` fresh; `tests/app.test.ts:85-114` checks ordinary distinct creation. However, the ancestor check at `src/app.ts:84,95-102` rejects a fresh service's request for an already-initialized singleton of the same constructor before `get()` checks its cache at `src/app.ts:50`. This non-cyclic dependency prevents the fresh instance from booting. |
| 8 | Boot failures propagate and failed instances are not retained as usable singletons. | PASS | PASS | `src/app.ts:58-72,143-151`; `tests/app.test.ts:261-290` checks rejection, unready failed instance, retry with a new instance, and subsequent singleton identity. |
| 9 | Singleton/fresh circular dependencies reject with a dependency chain. | PASS | PASS | `src/app.ts:95-141`; `tests/app.test.ts:116-160,220-259` checks singleton, fresh, and concurrent graph cycles with diagnostic chains. |
| 10 | Concurrent non-cyclic retrieval, including shared dependencies, is not mistaken for a cycle. | PASS | PASS | Dependency edges and path checks are in `src/app.ts:105-141`; `tests/app.test.ts:162-218` verifies concurrent shared dependency success. |
| 11 | Public API tests cover identity, readiness, derived fields, delayed initialization, failure, cycles, and isolation. | PASS | PASS | `tests/app.test.ts:6-315` exercises these behaviors through `App` and fixture services, without inspecting private container structures. |
| 12 | Focused application tests and type checking use existing Just recipes; existing command behavior is retained. | PASS | PASS | No CLI/workflow production files changed. The full suite passed on the reviewed snapshot; supplied current format, lint, type, and full-suite evidence is recorded below. |

## Quality — FAIL

**Quality verdict: FAIL.** The application boundary is compact, import-safe, and tested through the assigned public seam. The resolution check nevertheless conflates service-constructor identity with resolution-instance identity, causing a false cycle and violating the fresh/singleton lifetime contract in criterion 7. The test suite does not cover that cross-lifetime case.

## Strengths

- Private root fields with getter-only public access keep root ownership local and immutable (`src/app.ts:23-40`).
- Boot completion is recorded only after the async hook succeeds; failures remove the in-flight singleton and do not cache the failed object (`src/app.ts:58-72,143-151`).
- Tests cover delayed boot, derived fields, readiness, retries, concurrent shared dependencies, and cycle diagnostics at the confirmed `App` API seam (`tests/app.test.ts:28-315`).
- The corrective assertion change permits valid relative `SKILL.md` links while retaining the `.agent.md` restriction and relative-link target existence check (`tests/stubs.test.ts:123-140`).

## Issues

### Critical

None.

### Important

#### T01-R-01 — False cycle when fresh and singleton resolutions share a constructor

- **Impact/severity:** Important; valid fresh-instance initialization can reject even though the singleton dependency is already initialized and no dependency cycle exists.
- **Location:** `src/app.ts:48-50,82-102`.
- **Evidence:** `create(Foo)` runs with `Foo` in its async resolution chain. If that fresh instance's `boot()` calls `app.get(Foo)` and an initialized singleton already exists, `get()` calls `#assertNoAncestorCycle()` before its cache lookup. The constructor-only check at `src/app.ts:95-102` throws instead of returning the cached singleton. The cache hit at line 50 is therefore unreachable for this valid cross-lifetime resolution.
- **Required correction:** Distinguish resolution tokens/lifetimes when detecting cycles and reject only an actual dependency path, allowing a fresh instance to depend on an already-initialized singleton of its own service type. Add a public-API test covering this case while retaining genuine singleton/fresh cycle tests.
- **Blocking:** Yes.

### Minor

None.

## Checks

- **Snapshot reviewed:** HEAD/base `2274427687067aeb7c471a68bf2405b12de04d77` plus the current uncommitted `src/app.ts` (new), `tests/app.test.ts` (new), and `tests/stubs.test.ts` (one-line assertion correction), as enumerated by review-inputs package `reports/1-review-inputs-r1.md`. The modified ticket state and `.scratch` reports were excluded workflow artifacts, not implementation changes. The inspected status matched this inventory; no binary changes were listed.
- **Diff coverage:** Inspected the complete additions for `src/app.ts` and `tests/app.test.ts`, and the complete tracked diff with surrounding context for `tests/stubs.test.ts`. Diff stat: `src/app.ts` 170 additions; `tests/app.test.ts` 315 additions; `tests/stubs.test.ts` 1 insertion and 1 deletion. No snapshot mismatch or cut-off required rereading a changed source file.
- **Reviewer-run checks:** None. No suite was rerun because current controller evidence covers the reviewed snapshot and the diff provides direct evidence for the reported issue.
- **Controller-supplied evidence:** `just format::check src/app.ts tests/app.test.ts tests/stubs.test.ts`, `just lint::check src/app.ts tests/app.test.ts tests/stubs.test.ts`, `just test::types`, and `just test::test` are reported passed on the corrected snapshot; full suite: 187 passed, 0 failed. These results are supplied, not reviewer-run.
- **Implementer-reported evidence:** `just test::test tests/stubs.test.ts` passed 8 tests on the corrected snapshot. `just test::test tests/app.test.ts` passed 9 tests before the test-only corrective change; the supplied full-suite run on the corrected snapshot includes those application tests. The implementation report preserves the initial 7-failure result as history and records its correction.
- **Unverifiable requirements:** None for this ticket. The broader application-owned-services scope outside ticket 01 was not reviewed.
- **Required controller check:** After correcting `T01-R-01`, add/run a focused public-API test proving a fresh service can resolve an initialized singleton of the same constructor, retain real-cycle rejection tests, and provide current required checks covering the corrected snapshot.

## Assessment

**Task quality: Needs fixes.** Spec Compliance and Quality are both FAIL because of blocking finding `T01-R-01`. This is the review recommendation for the exact snapshot above, not controller acceptance. No implementation files or ticket state were edited.
