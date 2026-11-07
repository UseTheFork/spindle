# Issue 01 Implementation Report

## Status

**DONE**

## Snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `3c0ff211946361acf29db516c4eb47dcf68be901`
- Final revision: `3c0ff211946361acf29db516c4eb47dcf68be901` (no commit authorized or created)
- The final tested code snapshot was that revision plus the working-tree changes listed below. The assigned report was added after the final test run and does not change the tested source or tests.
- The controller's pre-existing edit to `issues/01-create-and-inspect-feature-workspaces.md` was preserved and not changed by this implementation.
- No other pre-existing user changes were present at initial scope capture. No unrelated changes were edited.

Changed or removed files:

- Added `src/commands/sdd/sdd-command.ts`
- Updated `src/cli.ts`
- Removed `src/commands/sdd-workspace/sdd-workspace-command.ts`
- Added `tests/sdd-create-status.test.ts`
- Removed `tests/sdd-workspace.test.ts` (its old resolver contract is obsolete)
- Updated `docs/agents/tooling.md`
- Updated `docs/blueprints.md`
- Added this report at `.scratch/2026-11-06-command-driven-sdd/reports/01-implementation.md`

Final tested content hashes:

- `src/commands/sdd/sdd-command.ts`: `424a1e54bc9407ed7757f3339c3407a988932774ed60cee1cebd6c1a9b7250e7`
- `tests/sdd-create-status.test.ts`: `b6d8d35ae15fee91365d3a3aebc9c309fb71a17ac2c6c46b166f3f0b60fd3af7`
- `src/cli.ts`: `500ceb0eb697173c5fd7c481cebcbeda6a7a2978277ce0681bece24c35116bea`
- `docs/agents/tooling.md`: `c29926a5de7bf1826103d230741d83e0e0c513c9cfe672a237ace6d9da220c5c`
- `docs/blueprints.md`: `dca76fa062e912cbb72aaa2b2e14ac4679991d5eca6b4b1a8c42844ef2cc8754`

## Criteria, changes, and tests

- **Creation and defaults:** Added named `--title` and `--author` inputs, optional `--require-retrospective`, initial title spec, `issues/` and `reports/`, and exactly one version-1 `sdd.json`. The ledger pins review policy version 1 and one `sdd-reviewer` for issue and delivery reviews; omission of the retrospective option records false. The first creation test failed against the baseline (`unknown command 'create'`) and passed after implementation.
- **IDs and concurrency:** Allocates IDs above the highest matching ID with at least four zero-padded digits, excluding dated legacy directories and unrelated entries. A temporary exclusive lock covers allocation and publication; multiple CLI processes get distinct consecutive IDs. Existing files are not overwritten. Uses `BigInt` to preserve ordering for large matching IDs.
- **Recovery and filesystem safety:** Stages the complete feature before publishing it. Failed writes clean staging and report that no complete workspace was published. Abandoned staging and stale locks are preserved and reported with manual recovery guidance rather than silently removed. Tests cover symlinked `.scratch`, ignored destinations, lock cleanup after normal concurrent creation, stale lock preservation, and an abandoned staging directory.
- **Explicit read-only status:** Added `status --spec`; it returns the selected feature's paths and parsed state, including recorded review policy and delivery progress. It does not write the ledger or alter Git status. Status rejects missing/unsupported ledger schema versions, invalid workspace paths, normalized traversal, symlinked feature paths, and dated legacy layouts. A stored non-default policy is returned unchanged.
- **CLI and guidance:** Help documents create/status and their named options. Removed the old public `sdd workspace` resolver and its obsolete tests. Updated tooling and Blueprint CLI-root guidance for the new commands and lack of legacy migration.

Behavior changes followed RED/GREEN where a failing baseline was feasible: creation, status, traversal handling, abandoned staging, ignored `.scratch`, obsolete command removal, large numeric IDs, and stale-lock handling each had a focused failing run before correction. Additional input/allocation assertions passed on their first run against the already-implemented slice; they were retained as characterization coverage, not used to manufacture a failure. No pure refactor was performed.

## Verification

Fresh focused public CLI check on the tested snapshot:

- `just test::test tests/sdd-create-status.test.ts` — **passed**, 13 tests, 0 failures.

During implementation, a `git diff --check` command was also run and exited 0; project verification claims rely on the approved Just test recipe above.

Not run by this implementer, as assigned to the controller or outside the scheduled focused check:

- Formatting and lint checks
- `just test::types`
- `just build`
- The full test suite and ticket-wide regression checks

These pending controller checks are not implementer failures and do not establish ticket acceptance.

## Self-review and remaining concerns

- No known implementation defect remains from the assigned create/status scope.
- Incomplete staging and stale lock artifacts intentionally block retry and require inspection/removal after confirming no owner is active. This favors preservation over automatic cleanup and is surfaced in diagnostics.
- Type checking, lint, formatting, build, and broader regression coverage remain unverified pending controller checks.

## Hand-back

Issue 01 now provides numbered feature creation, recorded default policy, concurrent allocation, explicit read-only feature status, and rejects legacy resolver/layout use. The focused public CLI suite passes on the listed dirty snapshot. No Git commit or other Git mutation was made.

## Round 1 corrective implementation

### Status and snapshot

**Status: DONE_WITH_CONCERNS** — both assigned review findings were corrected and the focused handoff suite passes. This reports completion of the corrective assignment only; it is not ticket acceptance.

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `3c0ff211946361acf29db516c4eb47dcf68be901`
- Final revision: `3c0ff211946361acf29db516c4eb47dcf68be901` (unchanged; no commit authorized or created)
- The tested snapshot is that revision plus the pre-existing dirty/untracked implementation and documentation state, the corrective edits below, and the fresh `just build` output. The implementation report was appended after the final test and does not change tested source or tests.
- Pre-existing dirty state was preserved: the controller-owned issue file; `docs/agents/tooling.md`, `docs/blueprints.md`, `src/cli.ts`; the removal of `src/commands/sdd-workspace/sdd-workspace-command.ts` and `tests/sdd-workspace.test.ts`; and untracked `.scratch/.../reports/`, `src/commands/sdd/`, and `tests/sdd-create-status.test.ts`. No unrelated file was edited.
- Corrective changes: `src/commands/sdd/sdd-command.ts`, `tests/sdd-create-status.test.ts`, and `tests/packaged-cli.test.ts`; corrective evidence appended to `.scratch/2026-11-06-command-driven-sdd/reports/01-implementation.md`.

Final tested content SHA-256:

- `src/commands/sdd/sdd-command.ts`: `b7723e821d661cae1acaa4dd98d15b72be8f084b5dacaecd2d58e3195e778ccf`
- `tests/sdd-create-status.test.ts`: `db3bbc0153b6989af9302e4e40fc9be53dcd184e4e2b1fb5293919292f931490`
- `tests/packaged-cli.test.ts`: `d0abeb8576465389c58f79ca8f88643579ed3a45a82123d19872263000f747f3`
- Rebuilt `build/index.js`: `86119f55e69d1361dbfddc64f3dd45a8a4178d0e10f5e0cdd5ea8967f21b1437`
- Rebuilt `build/commands/sdd/sdd-command.js`: `2e4d1b7b35bd529fb0bb0144647185d0e5f74bb604d01eb28ad8cfda85a854b7`

### Findings, changes, and tests

- **01-S-001:** Replaced `unknown[]` ledger element typing with v1 issue-progress records (`id` using the `I-` numeric form and a supported execution state) and delivery-history records (valid timestamp, non-empty author, non-empty action). `status` now rejects non-record elements, missing required values, and wrong types/enums before returning state. Public CLI tests cover malformed issue/history elements and verify the persisted ledger remains byte-for-byte unchanged; supported records are also accepted without mutation.
  - RED evidence: `just test::test tests/sdd-create-status.test.ts` failed the newly added case because malformed status returned exit code 0; the other 13 tests passed.
  - GREEN evidence: the final focused suite below passed with the validator and supported-shape assertions.
- **01-Q-001:** Removed obsolete packaged `sdd workspace` invocation/help/argument assertions. Packaged tests now exercise `sdd create` output and generated files/default policy, `sdd status` structured output and read-only ledger/Git state, command help, and invalid named arguments. A search of `tests/packaged-cli.test.ts` found no remaining SDD workspace-resolver references.
  - Controller-supplied pre-correction evidence recorded in the review report: after a build, the prior packaged test failed 2/5 cases on `unknown command 'workspace'`.
  - Fresh packaged behavior is covered in the passing run below.

### Verification and remaining checks

- `just build` — **passed**, rebuilding the production bundle before packaged testing.
- `just test::test tests/sdd-create-status.test.ts tests/packaged-cli.test.ts` — **passed**, 19 tests, 0 failures, on the final corrective source/test snapshot and rebuilt package.
- The final test rerun followed the last test-helper edit. No production source changed after the successful build.
- Not run by this implementer: formatting, lint, standalone `just test::types`, full suite, and ticket-wide regression checks. Build's TypeScript compilation passed, but does not replace those checks. Formatting, lint, type, and ticket-wide regression checks remain pending with the controller; they are not implementer failures or evidence of acceptance.

### Self-review, concern, and hand-back

- The selected v1 nested-record shapes are the minimal typed structures needed for the current scaffold and implied by the design's issue execution/history authority. The broader spec leaves the smallest typed ledger schema open; later ledger-writing work must extend these shapes consistently rather than treating this validation as a finalized full workflow schema.
- No other corrective-scope defect was found. No commit, staging, stash, discard, or unrelated Git mutation was performed.
- Hand-back: both selected findings are implemented and covered through the confirmed public CLI seams; the final focused source and packaged tests pass 19/19. Controller checks and adjudication remain pending.
