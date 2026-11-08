# Issue 09 implementation hand-back

## Status

**DONE_WITH_CONCERNS**

Implementation and scheduled checks are complete. The concern is that the
caller-commit success/mismatch and dependency-readiness test cases were added
after their implementation and therefore have GREEN evidence but no historical
RED run. I did not revert working behavior to manufacture RED. RED was
established before implementation for the hand-back contract and later
regressions for stale accepted check evidence and the uncommitted-delivery
claim diagnostic.

## Checkout and snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `036c497929ec17e7a155b2dbc87e61041dc7fb78`
- Final revision: `036c497929ec17e7a155b2dbc87e61041dc7fb78`
- No staging or commit was performed; commit authorization was denied.
- Starting state included the controller-owned modification to issue 09; it
  was preserved and excluded from implementation identity.
- Final worker changes are listed below. The controller's issue-file change
  remains separate. The assigned report was written after the final tests and
  does not affect code identity. The build generated no additional dirty paths.
- Final regression ran on the unchanged HEAD plus the final source, test, and
  guidance working-tree changes; the pre-existing controller issue-file
  modification was also present. No code changes followed that test run.

## Criteria, changes, and evidence

| Criterion | Implementation and public evidence |
|---|---|
| Accepted work, current evidence, frozen inventory, and safe hand-back | `integrate` uses the last accepted review inventory, requires accepted evidence, verifies current blockers/reports and accepted content, and returns `acceptedFiles` plus pending `deliveryRecords`. Public test checks exact `feature.ts` hand-back and unchanged Git status/HEAD. |
| Reject changed content, unrelated pending changes, stale evidence, and check blockers | Public tests reject changed accepted content, unrelated pending files, altered review reports, and a caller confirmation whose recorded required check is no longer passing. They assert user content, execution state, and HEAD remain unchanged. |
| Verify caller-owned commit before integration | `integrate --commit <sha>` verifies the full SHA is HEAD, a direct child of the recorded baseline, has exactly the accepted paths, and its tree blobs/modes match accepted content. A mismatched blob is rejected. |
| Preserve evidence across dirty-content commit | Accepted content digest and snapshot are preserved at acceptance. Verified integration allows unchanged accepted checks/reviews to remain current. Public caller-created-commit test confirms this, then checks integrated status and idempotent repeat confirmation. |
| No CLI Git mutation; resulting record hand-back; dependencies and later baseline | CLI only reads Git; confirmation writes issue/ledger delivery records and returns their paths. A public test verifies dependent claim is blocked while records are dirty, succeeds after caller commits them, and records the new clean HEAD as baseline. |
| Guidance/help | Added command help description and updated the integration reference, SDD skill, orchestrator agent, issue-tracker guide, and Just tooling reference. Bumped the Skill and Agent Blueprint versions per Blueprint guidance. |

### RED/GREEN evidence

- **RED, hand-back:** `just test::test tests/sdd-workflow.test.ts` failed the
  new hand-back test with `unknown command 'integrate'`; the other 62 tests in
  that run passed.
- **GREEN, hand-back:** focused selector passed 1/1.
- **RED, stale accepted check:** focused commit-confirmation test initially
  passed an invalidated `failed` required-check record; added the acceptance
  evidence gate.
- **GREEN, stale accepted check:** focused selector passed 1/1 after the fix.
- **RED, claim record diagnostic:** dependent claim returned only the generic
  dirty-checkout message and included the transient lock as a record. Filtered
  the lock and added an explicit uncommitted-delivery-record diagnostic.
- **GREEN, claim diagnostic:** focused dependent-claim test passed 1/1 after
  the fix.
- Integration-specific combined public tests passed 8/8 before final suite.
- One stale-report run rejected as intended but failed its overly narrow
  diagnostic assertion; the assertion was corrected to match the actual
  “not current and submitted” message and the rerun passed.
- The first scheduled five-file regression run passed 116/117; the failure
  exposed the transient lock filtering issue above. After fixing it, the
  scheduled run passed **117/117**, with 0 skipped.

## Changed files

- `src/commands/sdd/sdd-command.ts`
- `tests/sdd-workflow.test.ts`
- `src/blueprints/skills/int-subagent-driven-dev/SKILL.md`
- `src/blueprints/skills/int-subagent-driven-dev/references/integration.md`
- `src/blueprints/agents/sdd-orchestrator.agent.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/tooling.md`
- `.scratch/2026-11-06-command-driven-sdd/reports/09-implementation.md` (this report)

Preserved, not worker-owned: `.scratch/2026-11-06-command-driven-sdd/issues/09-integrate-through-caller-owned-commits.md`.

## Checks

Fresh final checks on the final source snapshot:

- `just test::test tests/sdd-workflow.test.ts tests/sdd-issues.test.ts tests/sdd-create-status.test.ts tests/catalog.test.ts tests/install.test.ts` — **passed, 117/117, 0 skipped**.
- `just format::check src/commands/sdd/sdd-command.ts tests/sdd-workflow.test.ts src/blueprints/skills/int-subagent-driven-dev/SKILL.md src/blueprints/skills/int-subagent-driven-dev/references/integration.md src/blueprints/agents/sdd-orchestrator.agent.md docs/agents/issue-tracker.md docs/agents/tooling.md` — passed.
- `just lint::check src/commands/sdd/sdd-command.ts tests/sdd-workflow.test.ts` — passed.
- `just test::types` — passed.
- `just build` — passed.
- `just tool::git diff --check` — passed.

Not run: packaged-CLI-specific tests and the entire repository test suite.
The controller may run those checks and independently rerun the listed checks
on its acceptance snapshot. Controller review and acceptance remain pending;
worker check results do not imply ticket acceptance.

## Self-review and remaining concerns

- Confirmed `HEAD` stayed at the supplied baseline; no staged changes or
  worker commit. Git status shows only assigned worker paths, the assigned
  report, and the pre-existing controller-owned issue edit.
- Integration hand-back does not modify the worktree. Confirmation updates
  only workflow issue/ledger records and never stages, commits, stashes,
  discards, pushes, publishes, or closes.
- No other implementation defect found during self-review.
- TDD sequencing concern: caller-commit success/mismatch and readiness
  scenarios have final GREEN coverage but no pre-implementation RED evidence,
  as noted above. Current regression coverage is public CLI coverage using
  caller-created commits.

## Hand-back summary

Caller-owned prepare-and-confirm integration is implemented and verified on
the supplied checkout. Exact accepted paths, content/baseline verification,
evidence preservation, idempotence, delivery-record cleanliness, and dependent
readiness are covered by public CLI tests. No commit was created. Controller
acceptance and optional packaged CLI checks remain.

## Corrective attempt 1 — 2026-11-08

**Status: DONE_WITH_CONCERNS**

### Assignment and snapshot

- Corrected confirmed blocking findings `I09-R1` and `I09-R2` under the
  controller's minimal-fix ruling. Prior attempts were `NONE`.
- Checkout: `/home/sincore/source/spindle`
- Starting and final revision: `036c497929ec17e7a155b2dbc87e61041dc7fb78`
- Final implementation SHA-256:
  - `src/commands/sdd/sdd-command.ts`:
    `c2db9b6a1ed67a8a4c7143ed3bc9d0e5b41bc15117c6661b8de37c81c08c6c59`
  - `tests/sdd-workflow.test.ts`:
    `88f6ef61942010c16ccdea3184e90dd8ee5bdb254e41c55b085cc492accb04e6`
- Final tests covered the same HEAD plus those exact formatted source/test
  contents and the pre-existing working-tree changes and untracked issue-09
  reports listed at assignment. The report append happened after the final
  test run; no source or test changes followed it.
- No stage or commit was performed. The controller-owned issue edit, prior
  issue-09 guidance/product changes, and earlier reports were preserved.

### Findings, changes, and public evidence

| Finding | Correction and covering evidence |
|---|---|
| I09-R1 — arbitrary feature-workspace files treated as delivery records | Safe integration now allows accepted files and only known workflow-owned state: the feature spec and ledger, ledger-backed issue documents, and report files referenced by workflow assignments/finding provenance. Other pending feature-workspace files are rejected; delivery-record output uses the same allowlist. New public CLI test creates `.scratch/0001-claim-flow/notes.txt` and asserts nonzero exit, unchanged file contents, unchanged Git status, unchanged ledger bytes, and execution remains `accepted`. |
| I09-R2 — divergent accepted-path index content ignored | Caller confirmation now hashes each accepted path's stage-0 Git index mode and blob bytes, compares them with accepted content, and rejects invalid/missing/non-stage-0 entries. The check runs before state mutation, including before idempotent confirmation success. New public CLI test makes a real exact caller commit, stages divergent accepted-file bytes, restores accepted worktree bytes, and verifies rejection while preserving HEAD, status, raw staged blob bytes, worktree bytes, ledger, and accepted execution. |

### RED/GREEN evidence

- **RED:** `just test::test tests/sdd-workflow.test.ts` was run before
  implementation. Both new regressions failed at their intended
  `rejected.status !== 0` assertions because `integrate` returned exit 0.
  The caller-commit setup completed; failures were behavioral, not fixture
  errors.
- The first targeted post-implementation run found an assertion issue: the
  test helper trimmed a staged blob's final newline. The test was corrected to
  compare raw Git blob buffers; no production change was needed for that
  observation error.
- **GREEN:** the two corrective public selectors passed together, **2/2**.
- The first full scheduled regression run passed **118/119**; an existing
  mismatched-commit test saw the new index diagnostic before its expected
  commit-tree mismatch diagnostic. Validation order was adjusted to preserve
  the established commit-tree diagnostic while checking the index before
  integration state mutation and idempotent success.
- **GREEN:** corrective selectors plus the existing caller-commit blob
  mismatch selector passed together, **3/3**.
- **Final GREEN:** exact scheduled set
  `just test::test tests/sdd-workflow.test.ts tests/sdd-issues.test.ts tests/sdd-create-status.test.ts tests/catalog.test.ts tests/install.test.ts`
  passed **119/119, 0 skipped** on the final formatted source/test snapshot.
  This includes both new tests and the existing commit-mismatch regression.

### Checks

- `just format::check src/commands/sdd/sdd-command.ts tests/sdd-workflow.test.ts`
  — passed after applying the project formatter to those assigned files.
- `just lint::check src/commands/sdd/sdd-command.ts tests/sdd-workflow.test.ts`
  — passed.
- `just test::types` — passed.
- `just build` — passed.
- `just tool::git diff --check` — passed.
- All Just commands ran from `/home/sincore/source/spindle`.
- Not run by this worker: full repository test suite and packaged-CLI-specific
  test selector. Controller-owned verification and acceptance remain pending;
  these worker checks do not imply ticket acceptance.

### Files, self-review, and concerns

Attempt-1 edits were limited to:

- `src/commands/sdd/sdd-command.ts`
- `tests/sdd-workflow.test.ts`
- This appended implementation-report section.

Self-review confirmed the unrelated path cannot be returned as a delivery
record, the reject path does not write workflow state or Git, the index digest
includes Git mode as well as blob bytes, and the existing commit-tree mismatch
diagnostic remains covered. No commit was created.

Concern: no separate public regression isolates a staged mode-only mismatch;
the new index digest includes mode and the required staged-byte divergence case
passes, but a mode-only case is not directly asserted. Full-suite and
packaged-CLI checks also remain unavailable to this worker.

### Hand-back

Both blocking findings are corrected on the supplied HEAD, with the exact
focused set and scheduled worker checks passing. The worktree remains
unstaged/uncommitted; controller review, broader checks, and acceptance remain
pending.
