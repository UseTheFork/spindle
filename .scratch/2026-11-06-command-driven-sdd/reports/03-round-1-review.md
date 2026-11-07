# Ticket 03 — Corrective Round 1 Spec/Quality Review

## Scope and snapshot

- **Scope/phase:** Corrective review, round 1, attempt 1; assigned finding
  `I03-F01` and fix-induced regressions only.
- **Identity:** base/HEAD
  `fd1cc60604cebe97dc4e14ebf76332af35d461b7`, plus the previously reviewed
  dirty issue 03 changes and this test-only correction. I verified HEAD and
  the supplied current hashes: `src/commands/sdd/sdd-command.ts`
  `192da33440f1fd51c3d6a8732e27f7ad9a2c5962aaa625599bffbc75fa34a2b5`;
  `tests/sdd-workflow.test.ts`
  `f2d4d2d09c11b8d7f71027c6f15947a81ad13a9198a2be58a71ff7169db37f23`.
  The test-only delta is from prior test hash
  `677b0f971dd11a3f3ca278f691ac4aa00050419230533ae3879863de8683c177`.
  Production source is unchanged.
- **Canonical requirements:** ticket 03, `spec.md`, and `design.md`, especially
  the ticket's interruption/recovery/public-CLI criteria, spec requirements
  for resuming the same dispatch and recovering interrupted ledger/Markdown
  writes, and design's persistence/recovery and verification sections.
  Relevant glossary terminology and existing initial review were consulted.
- **Change reviewed:** the new public-CLI test in
  `tests/sdd-workflow.test.ts:385-480`; matching production lock, resume,
  journal recovery, and two-target write paths in
  `src/commands/sdd/sdd-command.ts:1185-1245, 1369-1387, 1660-1745`.
  No production file changed in this correction.
- **Preserved coverage:** the initial comprehensive assessment remains in
  `03-review.md`. This report does not redo unaffected issue 03 criteria.

## Evidence and limitations

- **Controller-supplied evidence** for the current test hash: formatting,
  targeted lint, type checking, and `git diff --check` passed. The focused
  ticket regression command
  `just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts`
  passed 60 tests. The controller also reports a prior successful build; its
  production source hash is byte-identical to the current source hash.
  Evidence and command results are recorded in
  `03-implementation.md` under “Controller verification — corrective round
  1”.
- I verified the supplied HEAD and source/test hashes and inspected the
  corrective test, its CLI harness, requirements, and production recovery
  path. I did **not** run project checks, as instructed.
- The full project test suite was not run. The controller-supplied focused
  regression evidence covers the changed test and related ticket suites on
  the current test snapshot; the build evidence covers the unchanged
  production source.

## Spec

**Verdict: PASS** for the assigned corrective criterion.

| Assigned requirement | Assessment |
| --- | --- |
| Deterministically interrupt public CLI dispatch after one target replacement and before the other | **PASS.** The child runs the real `sdd implement` CLI. Its test-local preload wraps `fs.renameSync`, performs the rename of `issues/I-0001.md`, emits a marker, and stops the child. The parent sees the marker and sends `SIGKILL`. Assertions establish the issue file has changed, the ledger remains at its before-image, and the recovery journal remains. Thus this is a process interruption at the one-sided publication boundary, not an exception followed by command cleanup. |
| A separate `resume` restores the original dispatch intent and assignment/report destination | **PASS.** The test calls `resume` through a separate CLI invocation. It verifies the journal's intended ledger contains the dispatch assignment and expected report path, then compares the resumed assignment exactly with that intent, including assignment ID and report path. |
| Recovery leaves issue and ledger consistent and does not duplicate dispatch audit | **PASS.** After resume, both files equal their journaled after-images and the journal is gone. The issue's dispatch audit text must match the assignment ID and report path and occur exactly once. The production issue format intentionally keeps execution state in the ledger rather than mirroring it in issue front matter; the audit and journaled ledger are the corresponding issue/ledger evidence here. |

Other issue 03 criteria remain covered by `03-review.md`; they were not
reassessed in this corrective scope.

## Quality

**Verdict: PASS** for the assigned correction and inspected regressions.

The test uses the public CLI and actual filesystem replacement, with a
test-local preload rather than a production test-only API. Its assertions
verify that the intended failure boundary was reached before testing recovery,
so a missed injection cannot silently pass. The production `resume` path
acquires the issue lock and calls `#recoverWrites` before loading the ledger
and issue; recovery validates that targets contain either journal before- or
after-images, finishes pending atomic writes, and removes the journal. This
aligns with the observable behavior the test checks.

The test-only helper extension and preload are proportionate to making the
process interruption deterministic. I found no fix-induced regression or
material unnecessary complexity in the assigned change.

## Findings

### I03-F01 — No public-CLI test for interrupted dispatch/write recovery

- **Severity:** Important
- **Blocking:** Yes in the initial report; the assigned defect is now corrected.
- **Location:** Correction at `tests/sdd-workflow.test.ts:385-480`;
  production recovery at `src/commands/sdd/sdd-command.ts:1185-1245,
  1660-1733`.
- **Disposition: ADDRESSED.** The change supplies a real process kill after
  the issue target's atomic rename and before ledger replacement, then
  separately resumes and checks original assignment/report identity,
  journaled issue/ledger after-images, journal removal, and a single matching
  dispatch audit entry. The controller-supplied focused regression check
  passed on the verified current test snapshot.

**New findings: NONE.**

## Observations and remaining context

- This test covers interruption after issue replacement, with the ledger
  still at its before-image. It does not separately exercise every possible
  journal/write boundary or an interrupted submission; the reviewed test
  protects the shared journal recovery path through the assigned dispatch
  scenario. No additional finding is established from those untested
  scenarios in this scoped review.
- The initial comprehensive report remains the source of coverage for
  unaffected criteria. This report is not an acceptance, integration, or
  execution-state ruling.
