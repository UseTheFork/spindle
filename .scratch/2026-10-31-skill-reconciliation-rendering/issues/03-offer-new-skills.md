# 03: Offer new Skills during update

**What to build:** As a project maintainer, I can adopt newly shipped Skills during `update`, choose required Variables before changes are made, and understand which Skills were added, updated, or skipped.

**Blocked by:** 02 — Consolidate init and update Skill reconciliation.

**Status:** ready-for-agent
**Execution:** integrated

- [X] Interactive `update` offers uninstalled shipped Skills in a multi-select with all selected by default; selecting none is allowed, and unchecked Skills count as skipped.
- [X] `--include-new` selects all new Skills and skips the selection prompt in both interactive and non-interactive runs; without it, non-interactive runs do not install new Skills.
- [X] `--include-new` does not replace the conflict-policy decision required for outdated installed Skills.
- [X] New-Skill selection and outdated-Skill conflict decisions finish before writes; cancelling a prompt leaves installed Skills unchanged.
- [X] When at least one Skill will be installed or replaced, required Variables resolve from Config, then defaults, then interactive prompts; missing required values fail non-interactively before writes. No-op runs do not prompt or fail for missing Variables.
- [X] Prompted Variable values apply to every Skill changed in the run and are merged into Config only after all selected Skills install successfully, preserving Stacks and other Config values.
- [X] Installation stops at the first failure without rollback; Config-write failures are surfaced without rolling back installed Skills or saving prompted values on failed installation.
- [X] The update summary reports newly added Skills separately from updated Skills, with one skipped total and the existing invalid-version warnings.
- [X] CLI tests cover selection, `--include-new`, cancellation, Variable prompting and persistence, failure behavior, and summaries.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-10-31T16:30:00Z - @unknown**
Ticket 02 dependency is integrated (`73f6753` implementation; `47738fa` integration record). Ticket 03 claimed from clean baseline `47738fa` on branch `feat/skill-agent-creation`. Confirmed seam: end-to-end `update` CLI tests using the existing node:test/tsx test harness. Dispatching implementation for new-Skill selection, `--include-new`, pre-write Variable resolution/prompting and Config persistence, failure handling, and summary behavior.

**2026-10-31T16:55:00Z - @unknown**
Controller mechanical gate on the fixed implementation snapshot: scoped `just format::check` passed; `just lint::check` passed; `just test::types` passed; full `just test::test` passed (65/65); `git diff --check` passed. One initial lint error and formatting issues were corrected before this frozen review snapshot. Execution set to `in-code-review`; implementation edits are frozen while the three parallel reviews run.

**2026-10-31T17:10:00Z - @unknown**
Parallel initial reviews completed on the frozen snapshot. Code review: no concrete issues; ready to merge. Task review: all nine criteria and Quality PASS, no issues. Code-slop review found Minor `T03-CS-001`: remove the one-use update-only `afterInstall` callback and perform the same prompted-Config persistence in `update` after awaited reconciliation returns. This preserves delayed persistence and failure behavior while keeping caller-specific Config side effects in the CLI. Controller assigns corrective round 1 of at most five, scoped only to this finding; no other changes requested.

**2026-10-31T17:25:00Z - @unknown**
Corrective round 1 removes the `afterInstall` hook and moves the unchanged prompted-Config write into `update` after successful reconciliation. Implementer reports the focused `tests/update.test.ts` suite passed 22/22 after the refactor. Controller reran scoped formatting, lint, types, the full suite (65/65), and `git diff --check`; all passed on the fixed source snapshot. The exact fix-only diff and snapshot fingerprints are recorded in `reports/03-round-1-fix-diff.md`. Execution set to `in-code-review`; implementation edits are frozen for scoped re-review of `T03-CS-001`.

**2026-10-31T17:35:00Z - @unknown**
Scoped re-review initially returned UNVERIFIED because the fix-diff excerpt retained an empty branch in its representation. The controller corrected the complete fix package; follow-up re-review marks `T03-CS-001` ADDRESSED with no new breakage and Spec/Quality PASS. Controller checks on the fixed source snapshot passed: scoped formatting, lint, types, all 65 tests, and `git diff --check`. All nine criteria are complete. Execution set to `integrated` for the pending integration commit.

**2026-10-31T17:40:00Z - @unknown**
Ticket 03 implementation and all review evidence committed as `1d22f63` (`feat: offer new skills during update`). Integration record will be committed separately after confirming the implementation commit and clean worktree. The full-spec ticket graph is now complete.
