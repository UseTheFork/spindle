## Spec Compliance

**Verdict: PASS**

| Ticket criterion | Verdict | Diff evidence |
|---|---|---|
| Move computed resolution and memoization into cohesive classes; remove old resolver exports. | PASS | `src/computed/computed-context.ts:6-34` owns the cached resolution; `src/computed/resolve.ts` is deleted. A focused search found no remaining references to the retired resolver names in `src` or `tests`. |
| Use an application-managed fresh service per run, with mutable Config and caches outside application-wide singletons. | PASS | `src/blueprints/lifecycle.ts:692-699` creates one `ComputedContextService` with `options.app.create` for each reconciliation. `src/app.ts:82-90` confirms `create` constructs and boots a fresh instance. |
| Retain provider classes and their read-only resolved Config contract; do not make providers services. | PASS | The provider class remains `ComputedVariableProvider` (`src/computed/provider.ts:6-7`); the service passes copied/frozen resolved inputs (`src/computed/computed-context.ts:17-20`). Provider files are not changed in the supplied diff. |
| Repeated/concurrent requests within a run share context and evaluate each provider once. | PASS | The service memoizes its resolution promise (`src/computed/computed-context.ts:7-14,32`); concurrent requests and provider evaluation counts are exercised in `tests/computed-variables.test.ts:445-528`. |
| Same-App later runs resolve fresh values; separate Apps do not share caches. | PASS | Repeated Updates through one App assert updated rendered values (`tests/computed-variables.test.ts:391-443`); distinct fresh service instances and values across runs/Apps are asserted at `:476-555`. |
| Preserve copied/frozen inputs and provider errors with public key and original cause. | PASS | Copy/freeze and mutation rejection assertions are at `tests/computed-variables.test.ts:497-508`; error message and cause assertions are at `:558-576`, implemented at `src/computed/computed-context.ts:17-27`. |
| Preserve Variables vs Computed Variables, generated text, and Config non-persistence. | PASS | Namespace rendering assertions remain at `tests/computed-variables.test.ts:509-528`; the repeated-Update test checks generated output and absence of computed data in Config at `:423-429`. |
| Migrate all current consumers and direct-import tests without compatibility exports; retain current reconciliation wiring without requiring ticket 06 migration. | PASS | The only `reconcileBlueprints` callers found are Init and Update, both passing their App (`src/commands/init/init-command.ts:67-68`, `src/commands/update/update-command.ts:105-106`). The old resolver module is deleted; reconciliation remains in `src/blueprints/lifecycle.ts:624` as scoped. |
| Extend existing workflow tests for application-owned construction and repeated runs, asserting observable behavior. | PASS | `tests/computed-variables.test.ts:391-443,445-576` exercises Init/Update behavior, rendered output, memoization, isolation, frozen inputs, and failures through public APIs. |
| Validate focused computed/affected tests and types through Just; update related documentation. | PASS | `docs/blueprints.md:90-99` documents per-reconciliation service lifetime and copied/frozen inputs. Current passing validation evidence is listed under Checks. |

Unverifiable requirements and required controller checks: None.

## Quality

**Verdict: PASS**

The change is bounded to the computed-resolution lifecycle, its two reconciliation consumers, tests, and directly related documentation. The service caches a single in-flight promise per instance and preserves the prior provider-key/error-cause behavior (`src/computed/computed-context.ts:13-32`). Reconciliation creates the service lazily and shares it through its context resolver (`src/blueprints/lifecycle.ts:692-699`), preserving preparation flow. Tests check observable rendered values, Config persistence, concurrent memoization, fresh runs, and failure diagnostics rather than private cache state (`tests/computed-variables.test.ts:391-576`). No correctness, maintainability, regression, or test-quality defect was found in the complete supplied diff.

## Strengths

- Clear ownership boundary: `ComputedContextService` contains per-run memoization while the application creates it fresh for reconciliation (`src/computed/computed-context.ts:6-14`; `src/blueprints/lifecycle.ts:692-699`).
- Provider inputs are copied and frozen, and failures retain both the public computed key and original cause (`src/computed/computed-context.ts:17-27`).
- The workflow test verifies refreshed output across two Updates using the same App and asserts computed values are not persisted (`tests/computed-variables.test.ts:391-443`).
- The documentation explains both service lifetime and provider-input guarantees (`docs/blueprints.md:90-99`).

## Issues

### Critical

None.

### Important

None.

### Minor

None.

## Checks

**Reviewed snapshot:** checkout `/home/sincore/source/spindle`, HEAD/base `c10f0602f1966a1701ded3fcc5ae879cff3781aa`, plus the supplied dirty implementation snapshot. The six changed implementation/test/docs file hashes match `4-review-inputs.md`; `src/computed/resolve.ts` is deleted and `src/computed/computed-context.ts` is the supplied addition. The tracked diff stat is 7 files, 137 insertions, 71 deletions; the added service is additional to that stat. Workflow reports and the ticket marker are excluded. No snapshot mismatch was observed.

**Reviewer-run, read-only checks:** inspected the complete tracked diff, added service, deleted resolver, stat, and surrounding context; verified the supplied HEAD and file hashes; searched `src` and `tests` for retired resolver references and all reconciliation call sites; inspected `App.create` only to resolve the fresh-instance ownership risk. No tests or build commands were run by the reviewer.

**Supplied controller evidence:** `4-review-inputs.md` reports these checks passed on the final frozen source/test snapshot matching the reviewed hashes: Just format check (six changed files), lint check (same files), type check, focused computed/rendering/reconciliation/Init/Update/install/App group (81 tests), build, full test suite (197 tests), and `just tool::git diff --check`. This evidence is supplied, not reviewer-run. The implementation report records its earlier handoff as having controller checks pending; the review-input package reports the later final-snapshot controller results, which are attributed here to the controller. Implementer-reported focused tests/types and TDD summary are in `4-implementation.md`.

Limitations: none affecting the ticket criteria or current evidence.

## Assessment

**Task quality: Approved.** Spec and Quality are PASS, with no blocking findings. This is the review recommendation for the supplied snapshot, not controller acceptance.
