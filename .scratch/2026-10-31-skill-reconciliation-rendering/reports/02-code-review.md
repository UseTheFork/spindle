# Code Review: Ticket 02 — Shared Skill reconciliation

## Strengths

- `src/reconcile.ts:52-60` discovers shipped Skill directories in a stable order and applies the existing path-safety checks before writes. Its update classification at lines 72-105 only compares installed Skills, skips missing or invalid installed versions with a warning outcome, and keeps equal or newer installed versions untouched.
- `src/reconcile.ts:108-127` collects conflict decisions before entering the write loop. Lines 129-164 return per-Skill outcomes, remove old directories before replacement (so stale files are removed), and write init Config even when every conflict was skipped.
- The CLI retains presentation responsibilities: `src/index.ts` supplies the init conflict prompt and reports installed/skipped totals; `src/update.ts` supplies the outdated-Skill prompt, emits warnings, and summarizes update outcomes.
- The new reconciliation tests exercise outcomes, overwrite/skip behavior, Config persistence on an all-skipped init, version comparisons, and invalid shipped versions. The init CLI tests cover skip persistence and stale-file removal. Existing CLI tests also exercise path-safety checks.

## Issues

### Critical

None.

### Important

- **`src/update.ts:58-69, 72-87` — required Variables are resolved before reconciliation and the update path has no missing-Variable prompt or persistence flow.** `update()` calls `readConfig()` before `reconcileSkills()` can determine whether any Skill will be installed or replaced. `readConfig()` throws as soon as a required Variable has neither a Config value nor a default. Consequently, an update with no outdated Skills (or with every outdated Skill skipped) can fail despite needing no rendering inputs. When an outdated Skill does need replacement, an interactive run also errors instead of prompting for the missing value; update never calls `promptVariable` or merges prompted values into Config. This fails the assigned spec stories 20, 22, and 24-26 and can block both no-op updates and otherwise valid interactive updates. **Correction:** separate Config parsing from Variable resolution; first classify Skills and collect conflict decisions, resolve required Variables only if at least one Skill will actually be rendered, use Config then defaults then interactive prompts (or a clear non-interactive error), and persist prompted answers only after all selected installations succeed while preserving Stacks and unrelated Config values. Add CLI coverage for no-op/missing-variable, interactive prompting, and successful Config merge/persistence.

### Minor

None.

## Recommendations

None beyond the correction specified under Important.

## Checks

- **Reviewed snapshot:** base `c5b1eae757f22d6ca6378b4bc97fc055d058ce9e`; HEAD remains `c5b1eae757f22d6ca6378b4bc97fc055d058ce9e`. At initial verification, the status paths matched the assignment; the assigned tracked changes and untracked `src/reconcile.ts`, `tests/reconciliation.test.ts`, and implementation report were reviewed. At final verification, two additional untracked files had appeared: `.scratch/2026-10-31-skill-reconciliation-rendering/reports/02-code-slop-review.md` and `.scratch/2026-10-31-skill-reconciliation-rendering/reports/02-task-review.md`. These were not part of the supplied snapshot and were not inspected. This is an unresolved snapshot mismatch; the controller must confirm the authoritative worktree/snapshot and provide updated verification evidence or restore the assigned snapshot before review can approve. No implementation files, index, HEAD, or branch were changed during review.
- **Coverage:** inspected the complete reconciliation module and relevant CLI paths, the modified init tests, reconciliation tests, related update/install tests and helpers, version and install utilities, ticket 02 and its comments, the full spec’s applicable decisions and testing scope, related update ticket 10, and the implementation report. No `AGENTS.md` repository instructions were found; loaded `.github/skills/int-verification-before-completion/SKILL.md`.
- **Reviewer-run checks on the reviewed snapshot:**
  - `just format::check src/index.ts src/update.ts src/reconcile.ts tests/init.test.ts tests/reconciliation.test.ts` — passed.
  - `just lint::check` — passed.
  - `just test::types` — passed.
  - `just test::test` — passed, 54/54 tests.
  - `git diff --check` — passed.
- **Limitations:** no separate interactive terminal reproduction was run for the missing-Variable path; the finding is based on the directly inspected update call path and the absence of an update prompt/persistence path. The current test suite does not cover the required no-op and interactive missing-Variable cases.

## Declined to judge

- **Spec stories 13-18 and 30-31 (new Skills in `update`, `--include-new`, and new-Skill summary behavior):** excluded from this review’s assigned story range and ticket 02 scope, which addresses shared init and existing-Skill update reconciliation. No ruling on their delivery is made here.
- **Spec stories 32-38 (Nunjucks rendering and text/binary installation behavior):** unrelated to the ticket 02 changes and excluded from this review’s assigned story range. No ruling on their delivery is made here.

## Assessment

**Ready to merge? No.** The controller must first resolve the snapshot mismatch and provide the authoritative current snapshot. On the initially supplied snapshot, the required update Variable resolution/prompting/persistence behavior also needs implementation and focused CLI tests before approval. Reviewer-run formatting, lint, type, full-suite, and diff checks passed on that initially supplied snapshot, but do not cover the identified behavior or the newly appeared reports.

## Addendum — Controller ruling and snapshot clarification

The controller clarified that `.scratch/2026-10-31-skill-reconciliation-rendering/reports/02-code-slop-review.md` and `.scratch/2026-10-31-skill-reconciliation-rendering/reports/02-task-review.md` are expected assigned outputs from parallel reviewers, not implementation changes. After comparing the complete tracked and untracked inventory with that clarification, the snapshot mismatch is resolved: the source/test diff remains the assigned ticket 02 snapshot, and HEAD remains `c5b1eae757f22d6ca6378b4bc97fc055d058ce9e`. No implementation or test fixes were made during this review; only the assigned review report was amended.

The controller ruled that the missing-Variable observation previously listed under Important is out of ticket 02 scope. Its behavior is explicitly assigned to ticket 03, `.scratch/2026-10-31-skill-reconciliation-rendering/issues/03-offer-new-skills.md`, whose acceptance criteria cover resolving Variables only when Skills are selected, interactive prompting, no-op behavior, and post-install Config persistence. The original observation and rationale above are preserved as review history, but are **not a blocking ticket 02 finding**. Preserve this follow-up for the final aggregate review ledger under ticket 03; no ticket 02 requirement was changed by this ruling.

**Current ticket-scoped assessment (supersedes the earlier assessment above): Ready to merge? Yes.** No Critical or Important ticket 02 findings remain after the controller’s scope ruling. The reviewed source/test snapshot matched after inventory clarification, and the reviewer-run formatting, lint, type, full test suite (54/54), and diff checks passed on that snapshot. This is a ticket-scoped review recommendation, not controller acceptance. The out-of-scope Variable behavior remains a ticket 03 follow-up for aggregate review.
