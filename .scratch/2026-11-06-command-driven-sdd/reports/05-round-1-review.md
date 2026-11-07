# Issue 05 — Corrective Review, Round 1

## Scope and snapshot

- **Phase/scope:** Corrective issue review, round 1, attempt 1. This report evaluates only supplied findings `05-Q01` and `05-Q02` and regressions from their corrections. It does not replace the initial issue review.
- **Checkout and comparison:** `/home/sincore/source/spindle`; base and HEAD `395773f0d3fa0ed91c550185bac51f3d2c505381`. Prior frozen tracked-change aggregate: `243f11261f56b59f70defece47fde51d57af9cdaf1b8b4069cbb80c839854b85`.
- **Fixed identity:** `src/commands/sdd/sdd-command.ts` SHA-256 `65e1b17de2163a093b50a7ceaffbd327d54c17d14e957def23d92afed84d4f19`; `tests/sdd-workflow.test.ts` SHA-256 `edf458c17ce48d90f781890073e7c9d5ae24e5403e6dc17b7468dffa70023e53`. I independently ran `sha256sum` and confirmed these two hashes. Other issue-05 implementation file hashes are unchanged from the initial freeze, per supplied inputs.
- **Requirements/history:** Canonical issue and comments, feature `spec.md` and `design.md`, applicable code-commenting/testing instructions, tooling and issue-tracker guidance, `GLOSSARY.md`, and ADRs 0003/0004. Initial criterion coverage and verdicts remain in `reports/05-review.md` (Spec FAIL, Quality FAIL solely for these two findings). Prior controller rulings confirmed both as blockers.
- **Change examined:** Corrective scope is the changes to the command and workflow test files since the first freeze, as described in the appended corrective implementation evidence. The prescribed `just tool::git diff --unified=5 -- ...` returned the cumulative worktree-versus-HEAD diff, not a separately isolated first-freeze delta. I assessed the supplied prior finding texts, corrective evidence, and matching current command/test code; no separate pre-fix file snapshot was available to reconstruct that delta.

## Evidence and limitations

- **Controller-supplied, current for the fixed snapshot:** formatting passed; focused SDD/catalog/install regressions passed (90 tests); packaged CLI tests passed (5); targeted lint, type checking, build, and `git diff --check` passed. The full project suite was not run. I did not run these checks.
- **Implementer-supplied history:** focused workflow RED/GREEN evidence is recorded in `reports/05-implementation.md`. Its appendix lists an earlier test-file hash (`9b20c5ce...`); the final supplied freeze and my local hash check identify `edf458c...`. The controller’s final regression evidence is supplied for the fixed snapshot and covers the new tests.
- I inspected the current set comparison and submission/acceptance paths, plus the public CLI tests for mixed-case inventory, failed/unavailable submissions, and acceptance blockers. I ran no behavioral checks.
- The cumulative-diff limitation above reduces independent patch-level regression comparison; the corrected behaviors themselves and their current public tests were directly assessable.

## Spec

**PASS — corrective scope only.** Both required corrections are present and match the issue contract. Initial review coverage for all unaffected criteria remains in `reports/05-review.md`; this report does not redo that coverage or determine overall acceptance.

- **05-Q01:** `review()` rejects duplicate inventory entries, then compares unique path membership and cardinality rather than sorting the supplied list with a locale-sensitive comparator (`src/commands/sdd/sdd-command.ts:1607-1645`). The Git-derived order is still used for persistence and later snapshot checks. The public CLI regression supplies mixed-case `B.ts` and `a.ts` paths and confirms dispatch with the exact Git-derived inventory (`tests/sdd-workflow.test.ts:398` onward).
- **05-Q02:** Passed results require `--no-findings`; failed/unavailable results reject that attestation and require nonblank details (`src/commands/sdd/sdd-command.ts:1917-1938`). Only passing submissions persist `noFindings`; acceptance still rejects non-passing results (`:2007`, `:2272-2274`). Public CLI tests cover valid failed and unavailable submissions without the attestation, missing-details rejection, and inability of either outcome to satisfy acceptance (`tests/sdd-workflow.test.ts:550-625`).

## Quality

**PASS — corrective scope only.** The inventory fix compares exact path sets while preserving the persisted deterministic Git-derived order. The submission fix keeps the finding-free attestation exclusive to passing reviews, records truthful failed/unavailable outcomes with details, and leaves the acceptance blocker intact. The added coverage exercises public CLI behavior and persisted outcome data. No fix-induced regression or material unnecessary complexity was identified in the assessed paths.

## Findings

### 05-Q01 — Canonical inventory sorting differs between producer and validator

- **Severity:** Important
- **Blocking:** No unresolved blocker after correction; originally blocking
- **Location:** `src/commands/sdd/sdd-command.ts:1607-1645`; test `tests/sdd-workflow.test.ts:398`
- **Disposition:** **ADDRESSED**
- **Evidence/impact:** Review input validation now checks uniqueness and exact set membership without imposing a second ordering, so valid mixed-case Git-derived inventories are no longer rejected due to comparator differences. The public mixed-case CLI test and controller-supplied final regression checks cover the corrected path on the fixed snapshot.
- **Required correction:** Compare path sets independent of input order or use the same deterministic comparator, and add a public mixed-case inventory test. Both requirements are met.

### 05-Q02 — Failed/unavailable review submission requires a no-findings attestation

- **Severity:** Important
- **Blocking:** No unresolved blocker after correction; originally blocking
- **Location:** `src/commands/sdd/sdd-command.ts:1917-1938`, `:2007`, `:2272-2274`; tests `tests/sdd-workflow.test.ts:550-625`
- **Disposition:** **ADDRESSED**
- **Evidence/impact:** Failed and unavailable submissions now require details but cannot be accompanied by `--no-findings`; those results are persisted without a no-findings attestation. Acceptance continues to block both outcomes. Public CLI tests cover valid submissions and verify they cannot satisfy acceptance; controller-supplied fixed-snapshot tests pass.
- **Required correction:** Require exclusive `--no-findings` for the passing finding-free path, allow detailed failed/unavailable submissions without that attestation, keep both outcomes acceptance-blocking, and test those paths. These requirements are met.

**New corrective-scope findings:** NONE.

## Observations and remaining context

- The full project test suite was not run; this is a supplied evidence limitation, not a demonstrated defect.
- The prescribed Git diff was cumulative against HEAD rather than isolated against the first freeze. The scoped behavior and regression tests were reviewed against the current files and supplied corrective description; broader issue-05 behavior remains covered only by the initial review.
- No unrelated observations or new controller rulings are requested by this scoped report. It does not decide issue acceptance, integration, or delivery state.
