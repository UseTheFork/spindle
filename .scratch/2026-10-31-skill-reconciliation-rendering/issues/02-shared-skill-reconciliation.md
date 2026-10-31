# 02: Consolidate init and update Skill reconciliation

**What to build:** As a Spindle maintainer, I want `init` and `update` to share a Skill reconciliation workflow, so that installation behavior is consistent and outcomes can be tested without relying only on full CLI runs.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent
**Execution:** integrated

- [X] `init` and `update` use a shared reconciliation workflow while retaining CLI-owned prompts and output.
- [X] `init` considers all shipped Stubs, treats existing Skill directories as conflicts, supports per-Skill overwrite or skip, removes stale files when overwriting, and writes Config even when every Skill is skipped.
- [X] `update` considers installed Skills, replaces only those with a strictly older version when overwrite is selected, leaves equal or newer versions unchanged, and warns and skips missing or invalid installed versions.
- [X] An invalid shipped Stub version fails explicitly; current conflict-policy requirements for non-interactive outdated-Skill updates remain intact.
- [X] Existing symlink path-safety checks remain effective before filesystem changes.
- [X] The workflow returns per-Skill outcomes; tests at its interface cover reconciliation results, while CLI tests continue to cover user-visible behavior and summaries.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-10-31T15:25:00Z - @unknown**
Execution set to `claimed` at integrated ticket 01 commit `c5b1eae757f22d6ca6378b4bc97fc055d058ce9e`; ticket 02 has no blockers and is the next frontier.

**2026-10-31T15:25:00Z - @unknown**
Execution set to `implementing` at `c5b1eae757f22d6ca6378b4bc97fc055d058ce9e`; dispatching shared reconciliation workflow implementation.

**2026-10-31T15:40:00Z - @unknown**
Execution set to `in-code-review` at base `c5b1eae757f22d6ca6378b4bc97fc055d058ce9e` plus the current ticket worktree. The controller applied scoped formatting and removed an unused import; changed-file formatting, lint, types, and the full 54-test suite now pass.

**2026-10-31T16:05:00Z - @unknown**
Execution set to `changes-requested` at the reviewed ticket 02 worktree. Code and task reviews pass for in-scope criteria; code-slop review found Minor `T02-CS-001` (unused exported `ReconciliationMode` alias in `src/reconcile.ts:13`). The missing-Variable behavior was ruled to ticket 03 and is not blocking this ticket. Controller assigns corrective round 1 solely to remove the redundant alias; no other code changes requested.

**2026-10-31T16:20:00Z - @unknown**
Controller acceptance: round-1 re-review marks `T02-CS-001` addressed with no new breakage; code review and task review pass ticket scope. The controller reran changed-file formatting, lint, types, all 54 tests, and `git diff --check`; all passed on the fixed snapshot. All six criteria are complete. Missing-Variable prompt/no-op/persistence behavior remains a ticket 03 follow-up, not a ticket 02 blocker. Execution set to `integrated` for the pending integration commit.
