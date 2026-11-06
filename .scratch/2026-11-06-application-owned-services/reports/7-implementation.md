# Ticket 07 implementation report

**Status: BLOCKED**

## Snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `31e98d0136b6173475461398acb6fc3fcc16bbff`
- Final revision: `31e98d0136b6173475461398acb6fc3fcc16bbff` (no commit)
- Exact tested snapshot: that revision plus worktree diff SHA-256
  `ff0b358c354b2f9fb54767fb5816abd63d5b8cdb491cecc8bbff72d721d9a679`.
- Dirty files: `docs/agents/tooling.md` and `tests/packaged-cli.test.ts` are this
  worker's changes. The issue file's `Execution: claimed` marker is
  controller-owned and was already dirty at assignment. The assigned report at
  `.scratch/2026-11-06-application-owned-services/reports/7-implementation.md`
  was created after testing and is the only untracked file; it is not part of
  the tested source snapshot.
- Build output did not add tracked or untracked changes.

## Criteria, changes, and tests

The integration audit found the application/service architecture, async
construction and boot, immutable roots, command ownership, import-safe
bootstrap, per-run computed context, explicit setup/SDD path meanings, and
workflow behavior consistent with the ticket. `src/index.ts` is the only
production file referencing `process.cwd()`, for executable Git-root discovery.
Searches found no replaced workflow-function consumers or compatibility
adapters. Commands are in their own folders and pure helpers remain in focused
utility modules.

Source-mode nested-root, Git-discovery failure, help/version, App lifecycle,
workflow, and computed-context behavior are covered by existing seams. The
packaged tests previously lacked a direct nested-directory `init` case. Added
that characterization to `tests/packaged-cli.test.ts`; it checks root and
nested invocation produce the same output and root Config/installed content,
with no files written in the nested directory. It passed against the existing
bootstrap, so no production behavior change was needed.

`docs/agents/tooling.md` now documents contributor rules for App roots, service
construction/boot, singleton versus fresh-instance resolution, per-run state,
and direct internal API migration. Existing `docs/blueprints.md` documents
mandatory Git discovery, explicit workspace meanings, packaged assets, and
computed-context lifetime.

This was a pure integration/refactor audit reusing existing tests; the focused
pre-change and post-documentation runs each passed 114 tests. The packaged
nested-root characterization was added without a production change and verified
GREEN. No behavioral code changes were made, so no production RED/GREEN cycle
was applicable and no tests were weakened.

## Changed files and self-review

- `docs/agents/tooling.md` — contributor architecture guidance.
- `tests/packaged-cli.test.ts` — packaged root/nested invocation coverage.

Self-review found no production changes or unrelated cleanup. The added test
uses the packaged executable and built Blueprint assets, compares root and
nested results, and explicitly checks that the nested directory remains empty.
`git diff --check` passes.

## Fresh checks

- `just format::check` — **failed** (exit 1): Oxfmt reported 113 unformatted
  files elsewhere in the checkout. Neither changed file was among the reported
  files. These untouched files are outside this ticket's scope and were not
  reformatted.
- `just format::check docs/agents/tooling.md tests/packaged-cli.test.ts` —
  passed; both changed files use the expected format.
- `just lint::check` — passed (exit 0).
- `just test::types` — passed (exit 0).
- `just build` — passed (exit 0), run on the final production source.
- `just test::test tests/packaged-cli.test.ts` — passed, 5/5, after the final
  build.
- `just test::test` — passed, 200/200, after the final build and packaged test.
- `git diff --check` — passed.

No required check was unavailable or skipped. `just test::coverage` was not
assigned and was not run. The failed repository-wide format check blocks worker
completion; the targeted check confirms the changed files themselves are
formatted.

## Controller checks and hand-back

Controller verification/review remains pending; these worker results do not
establish ticket acceptance. The repository-wide formatter failure needs
controller disposition. Formatting, lint, types, packaged verification, and
ticket-wide regression checks remain subject to the controller's final-snapshot
checks; pending controller checks are not acceptance evidence.

**Hand-back:** The integration audit and packaged nested-root coverage are
complete, with no production fix required. Full tests, type check, lint, build,
and packaged verification pass. Worker status is **BLOCKED** solely on the
repository-wide format check reporting 113 untouched files.

## Corrective round 1 — SL-07-01

**Round status: DONE**

### Finding and correction

Removed only the repeated sentence from `## Application services` in
`docs/agents/tooling.md` that restated the explicit `setup-project --workspace`
and `sdd workspace` path semantics. The earlier tooling section still documents
those semantics. All other application-service and root details remain
unchanged. No production or test files were changed in this round.

### Snapshot and scope

- Checkout: `/home/sincore/source/spindle`
- Starting and final revision: `15aeff54a1902b3629c4280df3d39487dc5ba07f`
  (no commit)
- Exact check snapshot: that revision plus the tracked worktree diff for
  `docs/agents/tooling.md`, the pre-existing `tests/packaged-cli.test.ts`
  addition, and the controller-owned ticket marker; diff SHA-256
  `28e1d60037f4dbff08bb69d982b997c86d003a2c09807b48ca27a89b580951de`.
- Pre-existing dirty/untracked paths were preserved. The only implementation
  change in this round is `docs/agents/tooling.md`; this report was appended
  after verification.

### Verification

This is a documentation-only deduplication; no behavioral test applies, and no
test changes were authorized. Baseline `just format::check
docs/agents/tooling.md` passed before editing. Fresh checks on the final
correction snapshot:

- `just format::check docs/agents/tooling.md` — passed.
- `git diff --check` — passed.

Self-review confirmed the earlier path-semantics text remains and the
`Application services` section retains every other root/service detail. Tests,
build, lint, type checks, and ticket-wide regression checks were not run in this
round; they remain with the controller, as do the fresh required snapshot
checks and scoped re-review. These pending controller checks are not
implementer failures or evidence of ticket acceptance.

**Hand-back:** Finding `SL-07-01` is corrected as ruled. The initial report and
all pre-existing changes remain intact; no commit was made.
