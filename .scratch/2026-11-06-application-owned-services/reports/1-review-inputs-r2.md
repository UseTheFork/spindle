# Ticket 01 corrective round 2 review inputs

## Requirements and findings

- Spec: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/spec.md`
- Ticket: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/issues/01-application-construction-and-boot.md` (Comments section empty).
- Initial code review F-02: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/1-code-review.md`
- Initial Spec/Quality finding T01-R-01: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/1-task-review.md`
- Corrective attempt, RED/GREEN evidence, and controller ruling: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/1-implementation.md`, section "Corrective round 2".
- Round 1 findings and evidence: implementation report "Corrective round 1" and `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/1-review-inputs-r1.md`.
- Triage, testing, domain guidance and ADRs are enumerated in `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/1-review-inputs-r1.md`. Test seam: public `App` API/node:test.

F-02 and T01-R-01 were adjudicated as the same root defect. The fix-only scope is the get-cache ordering and the public regression test, with original cycle tests preserved.

## Workspace and reviewed snapshot

- Checkout: `/home/sincore/source/spindle`
- Comparison base and HEAD: `2274427687067aeb7c471a68bf2405b12de04d77`
- No commit was created. Reviewed identity is base HEAD plus the exact current contents of these implementation files:
  - `src/app.ts` (untracked, application logic plus cache-order correction); SHA-256 `1e7e5324f5a6d93b83ef078fb2dd12610f2608025a5af79356475ca115143f9e`
  - `tests/app.test.ts` (untracked, ten public API tests including the new fix test); SHA-256 `4ddcc602b25a6ded171ce96cd113dbe6fee3aefc7d4cf5c7e309973931257b30`
  - `tests/stubs.test.ts` (tracked modification from round 1, preserved); SHA-256 `9e5fbd8fae6696aa7591dcc7def813d9905075c193b67a8ed7279c6a714f49d9`
- Complete diff/file contents are present in the shared checkout; untracked files must be read directly, and `tests/stubs.test.ts` is a one-line diff plus its surrounding assertion context.
- Workflow-only excluded changes: modified ticket file and `.scratch` report files. No binary changes.

## Verification on the reviewed snapshot

Controller-run from `/home/sincore/source/spindle` after all implementation edits:

- `just format::check src/app.ts tests/app.test.ts tests/stubs.test.ts` — passed.
- `just lint::check src/app.ts tests/app.test.ts tests/stubs.test.ts` — passed.
- `just test::types` — passed.
- `just test::test tests/app.test.ts` — passed, 10 tests.
- `just test::test` — passed, 188 tests, 0 failures.

The implementer report contains RED then GREEN for the newly added case and initial full-suite/round-1 history. No build was required by ticket 01. The controller's commands above cover the current corrected snapshot.
