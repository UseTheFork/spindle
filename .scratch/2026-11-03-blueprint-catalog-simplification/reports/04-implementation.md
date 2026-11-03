# Ticket 04 implementation report

Status: `DONE`

## Snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `518a80414bcf32f3289f49785be9b18319c9b7f7`
- Final revision: `518a80414bcf32f3289f49785be9b18319c9b7f7` (no commit authorized or created)
- Tested snapshot: the final uncommitted implementation/test/docs/package diff on the final revision, plus fresh `build/` outputs from `pnpm run build`. The final focused test invocation and type check were run after the last source/test edits.
- Starting dirty state: the controller-owned ticket execution/comment update in `issues/04-coordinated-preparation-and-packaging.md`; preserved unchanged.
- Final implementation changes: `GLOSSARY.md`, `docs/adr/0003-catalog-selected-blueprints.md`, `docs/blueprints.md`, `package.json`, `src/blueprints/just.ts`, `src/blueprints/lifecycle.ts`, `src/blueprints/types.ts`, `src/update.ts`, `tests/coordinated-preparation.test.ts` (new), `tests/packaged-cli.test.ts`, and `tests/removals.test.ts`.
- No staging or commit performed. Generated build output is not listed as a worktree change.

## Criteria, changes, and evidence

- **Coordinate preparation before installation changes:** reconciliation now prepares every selected rendered write, the Config payload, and staged Just Modules/imports before applying writes, deletion, or cleanup. Preparation failures therefore leave planned changes unapplied. Real-CLI tests cover invalid Just UTF-8 alongside an included Agent, current and skipped Skill membership cleanup, a retired Skill target, existing Config/import bytes, and an outside-root sentinel. An init case also verifies a scheduled Config write and whole-target deletion remain unapplied.
- **Preserve current/skipped cleanup semantics:** `directory-membership.test.ts` retains coverage for successful cleanup of current and skipped selections; the new failure case verifies neither cleanup is applied after another kind fails preparation.
- **Application-time failure diagnostics:** application is tracked across rendered writes, Just Modules/imports, removals, cleanup, and Config. Failures report the failed operation, completed changes, nonzero status, and that rollback was not attempted. Real CLI injection tests exercise Agent writes (`fail-agent-write.mjs`), Config writes (`fail-config-write.mjs`), and removals (`fail-removal.mjs`), including completed cross-kind progress. Updated the related removal diagnostic assertion.
- **Mixed success/repeated run:** the new real-CLI test verifies exact Agent/Instruction/Just outputs, current Skill byte preservation, destination-only cleanup, retired-target deletion, root-import reconciliation, outside-root preservation, and the second-run output/result.
- **Packaged behavior:** package contents no longer list `src/blueprints`; the build bundles the catalog/tree under `build/blueprints`. The packaged smoke test runs outside the checkout with no `src` tree and a blank source-root override, verifies bundled catalog and recursive Skill asset bytes, then exercises init, a versioned Agent update, and exact managed Just imports.
- **Guidance and regression migration:** updated authoring guidance, glossary, and ADR-0003 with membership, preparation/application, and packaging boundaries. ADR-0003 remains `proposed`; no approval labels or prior ADR history were changed. Review found no remaining tests asserting retired wrapper Agent/Instruction paths or Just contribution composition. Retained flattened-catalog, rendering, malformed-version, binary, conflict, and unrelated CLI tests.

## RED/GREEN evidence

- `RED` — `just test::test tests/coordinated-preparation.test.ts`: the initial cross-kind preparation test failed because the included Agent existed after the later invalid Just Module preparation failed.
- `GREEN` — the same focused test passed after all selected files and Just changes were prepared before application.
- `RED` — the packaged source-tree manifest assertion failed because `package.json` still listed `src/blueprints`.
- `GREEN` — after removing that package entry and rebuilding, `just test::test tests/packaged-cli.test.ts` passed 4/4.
- The mixed-success test's first attempts exposed test assertion setup issues (CLI casing and literal assertion API); after correction, it passed without production changes. It adds coverage for already-supported successful reconciliation rather than claiming a new RED/GREEN implementation.
- Final focused command:
  `just test::test tests/coordinated-preparation.test.ts tests/agents.test.ts tests/catalog.test.ts tests/directory-membership.test.ts tests/removals.test.ts tests/init.test.ts tests/update.test.ts tests/rendering.test.ts tests/install.test.ts tests/variables.test.ts tests/packaged-cli.test.ts`
  Result: 152 tests, 152 passed, 0 failed, 0 skipped.

## Fresh checks

- `pnpm run build` — passed; fresh packaged outputs used by the packaged CLI test.
- `just test::types` — passed (exit 0), rerun on the final source snapshot.
- The focused test command above — passed on the final snapshot.

## Self-review and pending checks

- Application remains intentionally non-transactional. If a filesystem operation fails after earlier operations complete, diagnostics report progress and do not claim rollback, as required.
- No unresolved implementation concern was found in the reviewed diff.
- Not run by this implementer: formatting, lint, and the ticket-wide regression/mechanical gate. These remain pending with the controller and are not implementer failures or evidence of ticket acceptance.

## Hand-back

Ticket 04 implementation and assigned focused checks are complete in the existing shared checkout, uncommitted. Report: `.scratch/2026-11-03-blueprint-catalog-simplification/reports/04-implementation.md`.

## Corrective round 1 — T04-R1-01

Status: `DONE` for the assigned corrective finding.

### Snapshot and scope

- Checkout: `/home/sincore/source/spindle`
- Starting and final revision: `518a80414bcf32f3289f49785be9b18319c9b7f7` (no commit authorized or created).
- Starting tree was already dirty with the initial ticket 04 implementation, controller tracker/review artifacts, and untracked `tests/coordinated-preparation.test.ts`; these were preserved. The report retains its initial content above.
- Corrective changes: `src/install.ts`, `src/blueprints/lifecycle.ts`, `tests/coordinated-preparation.test.ts`, and new test-only injector `tests/fail-skill-file-write.mjs`; this report received this appended section.
- Final `git status --short --untracked-files=all` also includes pre-existing ticket 04 changes in `GLOSSARY.md`, `docs/adr/0003-catalog-selected-blueprints.md`, `docs/blueprints.md`, `package.json`, `src/blueprints/just.ts`, `src/blueprints/types.ts`, `src/update.ts`, `tests/packaged-cli.test.ts`, and `tests/removals.test.ts`; controller-owned issue/review report paths remain dirty/untracked as before.
- No staging or commit performed.
- Exact tested source/test snapshot SHA-256:
  - `src/install.ts`: `415108414852f0285ea70334a6bd38a694cdfa0e920d11797f6fdd8d85f15bd5`
  - `src/blueprints/lifecycle.ts`: `c29128caa886ffb956085c6d3a495d2b27ed2d38d4fa88978781d256303bad95`
  - `tests/coordinated-preparation.test.ts`: `0bd220ceadffc0cf666970540745ac4f431997dc76c24c3d40cbf0135972609f`
  - `tests/fail-skill-file-write.mjs`: `17545bd823929798d959851b26b408456ac59ef63a0330b23eb54e4b6af460a2`

### Finding correction and RED/GREEN evidence

- `installPlannedBlueprintFiles` now calls an optional per-file success callback only after a file finishes installing, and wraps install errors with that file's relative path and exact destination path.
- Lifecycle application records each completed Skill file as `applied Skill file '<skill>/<relative-file>'`; existing removal and whole-operation status reporting remain intact.
- Added a real-CLI test that updates a multi-file Skill with `SKILL.md` and `a-first.txt` written before an injected failure on `z-failing.txt`. It asserts nonzero exit, exact failing file/destination, both earlier successful files in completed progress, their actual filesystem contents, absence of the failed file and replaced local file, unchanged Config/outside sentinel, and the explicit no-rollback diagnostic.
- `RED` — `just test::test tests/coordinated-preparation.test.ts`: 6/7 passed; the new case failed because the diagnostic omitted the failed file and successful in-Skill file progress.
- First implementation rerun exposed two old diagnostic expectations that did not account for newly reported Skill file progress; the assertions were updated without changing production behavior.
- `GREEN` — `just test::test tests/coordinated-preparation.test.ts`: 7 tests passed, 0 failed.
- Related regression — `just test::test tests/coordinated-preparation.test.ts tests/directory-membership.test.ts tests/agents.test.ts`: 50 passed, 0 failed.
- Type check — `just test::types`: exited 0.

### Self-review and pending checks

- The callback runs after successful file application; a later failure reports the failing relative and absolute destination paths, while progress lists only completed file operations. Existing whole-Skill replacement and removal semantics are unchanged.
- No unresolved concern was found in the assigned correction. The behavior remains intentionally non-transactional; diagnostics do not claim rollback.
- Not run for this correction: formatting, lint, and ticket-wide/full regression checks; these remain pending with the controller and are not implementer failures or evidence of ticket acceptance.

### Hand-back

Corrective round 1 for `T04-R1-01` is implemented and verified on the existing uncommitted checkout. See the fresh commands and tested snapshot above; controller review and ticket-wide checks remain pending.

## Controller verification after corrective round 1

The controller formatted the corrective source and test files, then ran fresh
checks on the corrected snapshot:

- `just test::test tests/coordinated-preparation.test.ts tests/directory-membership.test.ts tests/agents.test.ts` — **passed, 50/50**, exit 0.
- `just test::test` — **passed, 196/196**, exit 0.
- `just test::types` — **passed**, exit 0.
- Scoped `just format::check src/install.ts src/blueprints/lifecycle.ts tests/coordinated-preparation.test.ts tests/fail-skill-file-write.mjs` — **passed**, exit 0.
- Scoped `just lint::check src/install.ts src/blueprints/lifecycle.ts tests/coordinated-preparation.test.ts tests/fail-skill-file-write.mjs` — **passed**, exit 0.
- `just tool::git diff --check HEAD` — **passed**, exit 0.

The tested source snapshot remains based on
`518a80414bcf32f3289f49785be9b18319c9b7f7`. SHA-256 values:
`src/install.ts` `415108414852f0285ea70334a6bd38a694cdfa0e920d11797f6fdd8d85f15bd5`;
`src/blueprints/lifecycle.ts`
`c29128caa886ffb956085c6d3a495d2b27ed2d38d4fa88978781d256303bad95`;
`tests/coordinated-preparation.test.ts`
`0bd220ceadffc0cf666970540745ac4f431997dc76c24c3d40cbf0135972609f`;
`tests/fail-skill-file-write.mjs`
`17545bd823929798d959851b26b408456ac59ef63a0330b23eb54e4b6af460a2`.
Scoped re-review and task-review reconciliation remain pending; this evidence
does not assert ticket acceptance.

## Final package verification

The controller ran a fresh package build through a temporary Just recipe because
the repository does not define a build recipe and its documented `tool::pnpm`
recipe targets an absent directory:

- `just --justfile <session>/files/temporary-build.just build` — **passed**;
  this runs the package's `pnpm run build` from the repository root.
- `just test::test tests/packaged-cli.test.ts` — **passed, 4/4** against those
  freshly built outputs.

The temporary Justfile is a session artifact only and is not part of the
repository change.
