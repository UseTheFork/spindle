# 03: Claim, dispatch, and resume implementation

Reporter: User
Category: enhancement

**What to build:** A controller can claim a ready issue from a clean checkout,
obtain a durable implementation handoff, submit its report, and recover the
same work safely in a later session.

**Blocked by:** 02: Create, triage, and organize issues.

**Status:** ready-for-agent
**Execution:** integrated

- [X] `claim` enforces readiness and dependency gates, rejects competing ownership, and rejects staged, unstaged, or untracked changes including preparation documents without altering them.
- [X] Only a successful clean claim records the starting commit SHA and explicit controller author. Failed claims leave ownership and baseline unchanged.
- [X] `implement` moves through permitted claimed/implementing gates, persists dispatch intent before returning inputs, and assigns a durable report destination with role `implementation`; it does not launch an agent.
- [X] Implementation `submit` validates the expected assignment/action and report target, registers the report and available provenance, and makes missing/unavailable reports explicit rather than treating them as completed work.
- [X] `next` and expanded `status` return permitted actions, pending assignments, and blockers without writing state or inventing unsupported successful transitions.
- [X] `resume` returns the same recorded assignment and gate without resetting evidence/history or allocating another dispatch. A changed author records a handoff requiring controller confirmation that the previous worker stopped.
- [X] Short-lived locks protect claims and dispatch/submission changes. Interrupted dispatch resumes its original intent; repeated submissions do not duplicate history.
- [X] Assignment/report paths retain relevant checkout containment, symlink, ignored-path, and regular-file protections. Existing reports and user changes are preserved.
- [X] Public CLI tests exercise separate-invocation claim/dispatch/submit/resume flows, dirty-start cases, concurrent claims, invalid transitions, missing reports, handoffs, read-only queries, interruption, and idempotency.
- [X] Help and related assignment/recovery guidance reflect the delivered contract; Just-based validation confirms no automatic execution or Git mutations.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
**2026-11-07T18:01:53Z - @Copilot**
Claimed issue 03 from clean baseline `fd1cc60604cebe97dc4e14ebf76332af35d461b7`; issue 02 is integrated. Controller author is `Copilot`.

**2026-11-07T18:02:17Z - @Copilot**
Implementation dispatched; durable handoff destination is `../reports/03-implementation.md`. The controller retains integration and commit ownership.

**2026-11-07T18:46:09Z - @Copilot**
Frozen for initial Spec/Quality review at base/HEAD `fd1cc60604cebe97dc4e14ebf76332af35d461b7`. Final SHA-256: `src/commands/sdd/sdd-command.ts` `192da33440f1fd51c3d6a8732e27f7ad9a2c5962aaa625599bffbc75fa34a2b5`; `tests/sdd-workflow.test.ts` `677b0f971dd11a3f3ca278f691ac4aa00050419230533ae3879863de8683c177`; `tests/sdd-create-status.test.ts` `036799ec1a80c40e2c23287a8b33d2654ef51d2e86d422b17d8fda0d7c1b3923`; `tests/packaged-cli.test.ts` `1607e1c4b48eef862229f6d392470e91cb975ce6bccf291c4380e667b81ff20c`. Additional guidance and unchanged related-test hashes are recorded in `../reports/03-implementation.md`. Controller `just` checks: formatting and lint passed; types passed; build passed; final ticket regression command passed 59 tests; diff check passed. The full project test suite was not run. The controller corrected the packaged status expected shape; all final code and test changes are frozen.

**2026-11-07T18:52:21Z - @Copilot**
Initial review `../reports/03-review.md` returned Spec/Quality FAIL with blocking Important finding `I03-F01`: no public CLI test exercises interrupted dispatch/write recovery. First corrective attempt is authorized to add deterministic crash/recovery CLI coverage and assert assignment identity/report path, consistent ledger/issue state, and no duplicate dispatch history. Prior corrective attempts: none. Prior rulings: none. Progress decision: continue; this is a concrete, first-pass coverage gap with no disagreement over requirements.

**2026-11-07T18:52:40Z - @Copilot**
Round 1 corrective implementation dispatched for `I03-F01`; preserve the initial implementation/report and append fresh attempt evidence to `../reports/03-implementation.md`. Scoped review destination: `../reports/03-round-1-review.md`.

**2026-11-07T19:05:32Z - @Copilot**
Round 1 fix frozen for scoped review at base/HEAD `fd1cc60604cebe97dc4e14ebf76332af35d461b7`. Production source SHA-256 remains `192da33440f1fd51c3d6a8732e27f7ad9a2c5962aaa625599bffbc75fa34a2b5`; final workflow-test SHA-256 is `f2d4d2d09c11b8d7f71027c6f15947a81ad13a9198a2be58a71ff7169db37f23`. `just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts` passed 60 tests; targeted lint, types, formatting, and diff check passed. The prior successful build covers the byte-identical production source. Review scope is `I03-F01` and regressions.

**2026-11-07T19:09:50Z - @Copilot**
Scoped corrective review `../reports/03-round-1-review.md` returns Spec PASS and Quality PASS; `I03-F01` is ADDRESSED with no new findings. Together with the initial review `../reports/03-review.md`, all issue 03 criteria are covered and no blocking finding remains. Controller accepts issue 03. The recovery test exercises interruption after issue replacement but not every journal boundary or submission interruption; reviewer found no additional blocker.

**2026-11-07T19:10:16Z - @Copilot**
Controller-owned integration authorized by the user. Commit the complete issue 03 implementation, test, guidance, and reports; a successful commit and clean worktree complete integration.
