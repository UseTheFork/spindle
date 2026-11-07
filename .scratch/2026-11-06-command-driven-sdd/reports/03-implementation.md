# Ticket 03 implementation report

## Status

**DONE_WITH_CONCERNS** — assigned workflow behavior and focused regressions are
implemented and passing. Formatting, lint, type, build, and ticket-wide checks
remain for the controller. This report does not claim ticket acceptance.

## Checkout and snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `fd1cc60604cebe97dc4e14ebf76332af35d461b7`
- Final revision: `fd1cc60604cebe97dc4e14ebf76332af35d461b7` (unchanged)
- Branch remained `feat/skill-agent-creation` (ahead 2 of its upstream at
  dispatch); no staging or Git mutation was performed.
- At dispatch, the only dirty path was the controller-owned issue 03 file,
  including the claim/dispatch notes. It was preserved without editing.
- At hand-back, the modified paths are the preserved controller-owned issue,
  `docs/agents/issue-tracker.md`, `docs/agents/tooling.md`,
  `src/blueprints/skills/int-subagent-driven-dev/SKILL.md`,
  `src/blueprints/skills/int-subagent-driven-dev/references/example-workflow.md`,
  `src/commands/sdd/sdd-command.ts`, and `tests/sdd-create-status.test.ts`.
  Untracked paths are `tests/sdd-workflow.test.ts` and this report.
- Exact tested code snapshot: base revision above plus the implementation and
  test/doc changes below. The report itself was created after the final test
  run and is not part of that tested code snapshot.

### Snapshot SHA-256

| File | SHA-256 |
| --- | --- |
| `src/commands/sdd/sdd-command.ts` | `8cdbb9c9060de55d4ceaed640921fb201eab261eb8ef9b7d47afbc78d74263fe` |
| `tests/sdd-workflow.test.ts` | `a457282db3244e5651d31bd69d8a110ba1840f55e1102933eee805f77906f920` |
| `tests/sdd-create-status.test.ts` | `036799ec1a80c40e2c23287a8b33d2654ef51d2e86d422b17d8fda0d7c1b3923` |
| `docs/agents/issue-tracker.md` | `3a85a31bfe657ccfd5184e8577e74a502e245407af518e9c14fc8fe8bea96c28` |
| `docs/agents/tooling.md` | `8bd8a1cb732fedbec4bf556376639f189ea64ae26bb85ea8512ad07a7490a745` |
| `src/blueprints/skills/int-subagent-driven-dev/SKILL.md` | `db9ff5b41b5017d4a88f9773a8cad7433eaef7ca508ac28c7736f602af018073` |
| `src/blueprints/skills/int-subagent-driven-dev/references/example-workflow.md` | `ba800b9b95f50def69d5d27cbf085cf483d7502ac24adbf7136acd459989670f` |
| Controller-owned issue file (preserved) | `dfce208dff21822faa22e7d01fd67d68da9cba5d4bf8aaa993eb0ab05707e458` |

## Criteria-to-change/test summary

1. **Readiness, dependencies, and clean checkout:** `claim` checks triage,
   integrated dependencies, competing execution ownership, staged/unstaged and
   untracked changes; failures leave claim fields unchanged. CLI tests cover
   dirty variants, unready issues, dependency blockers, and concurrent claims.
2. **Claim ownership/baseline:** only a successful clean claim records the
   controller and starting `HEAD` SHA. Tests compare persisted values and
   verify failed claims preserve ledger contents and Git state.
3. **Dispatch intent and destination:** `implement` persists an idempotent
   assignment before returning role `implementation`, action, controller, and
   stable absolute report path. It does not launch a worker. Tests cover
   repeated and concurrent dispatch, ignored destinations, and existing-file
   preservation.
4. **Submission:** `submit` validates role, assignment, exact report target,
   regular-file/path safety, and report availability. It records report digest,
   attribution, and submission time; unavailable work stays pending and can
   later be submitted. Repeated submissions do not duplicate audit history.
5. **Read-only queries:** `next` and expanded `status` report eligible actions,
   pending assignments, dirty-checkout/dependency/report blockers, and do not
   write files. Changed or missing registered reports block review.
6. **Resume/handoff:** resume returns the same gate and assignment. Ownership
   changes require `--confirm-handoff`, record the stop-confirmed handoff, and
   retain assignment identity and report path. Tests verify state preservation
   for same-owner resume and rejected unconfirmed takeover.
7. **Locks/recovery/idempotency:** claim, dispatch, and submission use the
   existing short-lived issue lock and recoverable atomic ledger/issue writes.
   Separate-process tests cover concurrent claims, dispatch, and submissions.
   Repeating dispatch after persisted intent returns that intent.
8. **Path safety/preservation:** assignment and submitted report paths are
   contained under `reports/`, reject ignored/symlink/non-regular/outside
   targets, and do not overwrite existing reports or outside content.
9. **Public CLI coverage:** tests invoke independent CLI processes for claim,
   implement, submit, resume, next, and status; invalid transitions, missing
   reports, ownership handoffs, dirty starts, and idempotency are covered.
10. **Help/guidance and prohibited operations:** CLI help, project tracker and
    tooling guidance, and the shipped SDD skill/example now document the
    command contract. CLI workflow code uses Git only for read-only status,
    revision, and ignore checks; no command launches agents or mutates Git.

Behavior changes used RED→GREEN where the test exposed an absent command or
behavior, including initial clean claim, unavailable-report recovery,
missing-report diagnostics, stale-report blockers, dirty-query blockers, and
incomplete-claim recovery. Some other cases (dirty variants, dependency,
concurrency, handoff, and path guards) were added after their implementation
already existed and passed directly; they have no historical RED evidence.
A test-fixture extraction reused the previously passing clean-claim test.

## Changed files

- `src/commands/sdd/sdd-command.ts`
- `tests/sdd-workflow.test.ts` (new)
- `tests/sdd-create-status.test.ts`
- `docs/agents/issue-tracker.md`
- `docs/agents/tooling.md`
- `src/blueprints/skills/int-subagent-driven-dev/SKILL.md`
- `src/blueprints/skills/int-subagent-driven-dev/references/example-workflow.md`
- `.scratch/2026-11-06-command-driven-sdd/reports/03-implementation.md` (this report)
- Preserved, not edited: `.scratch/2026-11-06-command-driven-sdd/issues/03-claim-dispatch-and-resume-implementation.md`

## Fresh checks and results

Run through the approved Just recipe from `/home/sincore/source/spindle`:

```text
just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts
```

**Passed:** 54 tests, 0 failures, including the ticket-focused CLI suite,
existing SDD issue/status regressions, and shipped-skill installation/version
tests.

Not run by this implementer: formatting, lint, type checking, build, or the
entire project suite. These remain controller-owned pending checks, not
implementer failures or evidence of acceptance.

## Self-review and remaining concerns

- No staging, commit, checkout reset, or edits to the controller-owned issue
  occurred.
- A prior intermediate run exposed that a query lock check interfered with
  existing issue recovery/concurrency. That guard was removed; the final fresh
  regression run passes the recovery and concurrent issue tests.
- Formatting, lint, type checking, build, and ticket-wide regression results
  remain unverified and should be run by the controller on the hand-back
  snapshot.

## Hand-back

Claim/dispatch/submit/resume behavior and focused public-CLI coverage are ready
for controller review. Report: `.scratch/2026-11-06-command-driven-sdd/reports/03-implementation.md`.
No commit was created; controller retains integration and acceptance ownership.

## Controller verification

The controller formatted all assigned code, tests, guidance, and shipped
Blueprint files, then ran the applicable checks:

- `just format::format src/commands/sdd/sdd-command.ts tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts docs/agents/issue-tracker.md docs/agents/tooling.md src/blueprints/skills/int-subagent-driven-dev/SKILL.md src/blueprints/skills/int-subagent-driven-dev/references/example-workflow.md` — passed.
- Targeted `just lint::check` over implementation, changed and related tests,
  guidance, and Blueprint files — passed.
- `just test::types` — passed.
- `just build` — passed on the final implementation source.
- The first packaged CLI run exposed a stale exact-output expectation for the
  expanded `status` shape in `tests/packaged-cli.test.ts`. The controller
  updated the expected empty `actions`, `pendingAssignments`, and `blockers`
  fields; formatting and the packaged CLI suite then passed, 5/5.
- Final `just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts` — passed, 59 tests, 0 failures.
- `just tool::git diff --check` — passed.

The test-only packaged expectation changed after the build; the implementation
source hash remained identical, so the passing build covers the final
production source. The full project test suite was not run.

### Final reviewed code snapshot

Base/HEAD remains `fd1cc60604cebe97dc4e14ebf76332af35d461b7`; the reviewed
identity is that revision plus the dirty/untracked issue 03 changes. SHA-256:

| File | SHA-256 |
| --- | --- |
| `src/commands/sdd/sdd-command.ts` | `192da33440f1fd51c3d6a8732e27f7ad9a2c5962aaa625599bffbc75fa34a2b5` |
| `tests/sdd-workflow.test.ts` | `677b0f971dd11a3f3ca278f691ac4aa00050419230533ae3879863de8683c177` |
| `tests/sdd-create-status.test.ts` | `036799ec1a80c40e2c23287a8b33d2654ef51d2e86d422b17d8fda0d7c1b3923` |
| `tests/sdd-issues.test.ts` | `3a1033302afb8e04728fa89e3538eb5c8208d8d11c6ab0a23df9e297c6c82bd0` |
| `tests/packaged-cli.test.ts` | `1607e1c4b48eef862229f6d392470e91cb975ce6bccf291c4380e667b81ff20c` |
| `tests/stubs.test.ts` | `5cb625569507c8397f26df652486c64cf6a9b927506c721ba5e45853e054ae7e` |
| `docs/agents/issue-tracker.md` | `3a85a31bfe657ccfd5184e8577e74a502e245407af518e9c14fc8fe8bea96c28` |
| `docs/agents/tooling.md` | `8bd8a1cb732fedbec4bf556376639f189ea64ae26bb85ea8512ad07a7490a745` |
| `src/blueprints/skills/int-subagent-driven-dev/SKILL.md` | `db9ff5b41b5017d4a88f9773a8cad7433eaef7ca508ac28c7736f602af018073` |
| `src/blueprints/skills/int-subagent-driven-dev/references/example-workflow.md` | `ba800b9b95f50def69d5d27cbf085cf483d7502ac24adbf7136acd459989670f` |

## Corrective attempt — round 1 (`I03-F01`)

**Status: DONE_WITH_CONCERNS.** The assigned recovery-coverage correction is
implemented and freshly tested. This is not a ticket-acceptance claim; scoped
review and controller-owned checks remain pending.

### Snapshot and scope

- Checkout: `/home/sincore/source/spindle`
- Starting and final revision: `fd1cc60604cebe97dc4e14ebf76332af35d461b7`
  (unchanged; no commit, staging, reset, or checkout mutation).
- Starting snapshot matched the assignment: production command SHA-256
  `192da33440f1fd51c3d6a8732e27f7ad9a2c5962aaa625599bffbc75fa34a2b5`;
  workflow test SHA-256 before this attempt
  `677b0f971dd11a3f3ca278f691ac4aa00050419230533ae3879863de8683c177`.
- Exact tested code snapshot: base revision plus the pre-existing dirty issue
  03 changes and this attempt's test-only change. The production command
  remains byte-identical to the assigned frozen hash. The updated workflow
  test SHA-256 is
  `78ce0181ff1cae619ba8ffa8360f3135579af7ecea69b38c699072a7e9eca091`.
  The report append occurred after test execution and is not part of the code
  test input.
- Final `git status --short --untracked-files=all` inventory: modified
  `.scratch/2026-11-06-command-driven-sdd/issues/03-claim-dispatch-and-resume-implementation.md`,
  `docs/agents/issue-tracker.md`, `docs/agents/tooling.md`,
  `src/blueprints/skills/int-subagent-driven-dev/SKILL.md`,
  `src/blueprints/skills/int-subagent-driven-dev/references/example-workflow.md`,
  `src/commands/sdd/sdd-command.ts`, `tests/packaged-cli.test.ts`, and
  `tests/sdd-create-status.test.ts`; untracked
  `.scratch/2026-11-06-command-driven-sdd/reports/03-implementation.md`,
  `.scratch/2026-11-06-command-driven-sdd/reports/03-review.md`, and
  `tests/sdd-workflow.test.ts`. This inventory matches dispatch. Only the
  workflow test content and this report content changed during this attempt;
  all other dirty paths, including the controller-owned issue, were preserved.

### Finding-to-change/test evidence

`I03-F01` requested deterministic public CLI coverage for interrupted
dispatch/write recovery. Added
`resume recovers dispatch interrupted after replacing only the issue target`
to `tests/sdd-workflow.test.ts`. It launches the real CLI in a child process
with a test-local preload that pauses after the atomic rename of the issue
Markdown target; the parent kills the child there, before the ledger target
is replaced. The test verifies the persisted journal and one-sided publication,
then invokes `resume` in a separate CLI process. It asserts the journaled
assignment ID and exact report path survive, the ledger and issue contents
match the intended completed write, the journal is removed, and the dispatch
audit entry occurs exactly once.

The first run passed, including this crash-boundary scenario. This is
characterization evidence that the existing production recovery handles the
tested partial-publication boundary; no production fix was demonstrated as
necessary, and none was made. No failing result was manufactured. A fresh
focused rerun and the related SDD regressions also passed.

### Fresh checks run

All commands ran through the approved Just recipes from the checkout:

- `just test::test tests/sdd-workflow.test.ts` — passed 15 tests, 0 failures
  on the first characterization run.
- `just test::test tests/sdd-workflow.test.ts` — passed 15 tests, 0 failures
  on the fresh focused rerun.
- `just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts`
  — passed 60 tests, 0 failures on the final corrective code snapshot.

### Self-review, concerns, and pending checks

- Self-review found no production recovery defect at the exercised boundary.
  The new test uses a real child CLI and filesystem rename boundary; its
  fault-injection preload is local to the test process and adds no production
  test API.
- The test intentionally couples to the existing journal contract and target
  replacement boundary. It exercises interruption after issue replacement,
  with the ledger still at its before-image; it does not separately kill a
  child immediately after journal creation but before either target changes.
- Formatting, lint, type checking, build, diff checks, and any ticket-wide
  checks were not run by this implementer and remain with the controller.
  The full project test suite was not run. These are pending controller checks,
  not implementer failures or evidence of acceptance.

### Hand-back

`I03-F01` now has fresh public-CLI crash/recovery coverage on the final test
snapshot; recovery already passed, so production code is unchanged. The
controller should review the scoped test and run its pending checks. Scoped
review destination: `.scratch/2026-11-06-command-driven-sdd/reports/03-round-1-review.md`.
No commit was created.

### Controller verification — corrective round 1

The controller formatted the corrective test and reran the relevant checks:

- `just format::format tests/sdd-workflow.test.ts` — passed.
- Targeted `just lint::check` over the implementation, affected and related
  tests, guidance, and Blueprint files — passed.
- `just test::types` — passed.
- `just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts` — passed, 60 tests, 0 failures.
- `just tool::git diff --check` — passed.

The production source is byte-identical to the controller-built source above,
so the prior successful `just build` remains applicable. The full project test
suite was not run.

Final corrective source/test SHA-256:

- `src/commands/sdd/sdd-command.ts` —
  `192da33440f1fd51c3d6a8732e27f7ad9a2c5962aaa625599bffbc75fa34a2b5`
- `tests/sdd-workflow.test.ts` —
  `f2d4d2d09c11b8d7f71027c6f15947a81ad13a9198a2be58a71ff7169db37f23`
