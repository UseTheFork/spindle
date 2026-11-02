Category: enhancement
Status: ready-for-agent
Execution: integrated
Reporter: unknown

# 02: Reconcile Just Modules during `update`

**What to build:** As a project maintainer, I want `update` to regenerate
modules for the current Stacks, install newly shipped modules, and remove
obsolete outputs and imports, so that generated Just tooling stays aligned
with the current Spindle release and project configuration.

**Blocked by:** 01: Generate and import Just Modules during `init`.

- [X] Regenerate every shipped Just Module during `update` without overwrite,
      skip, or new-Blueprint prompts; automatically install newly shipped modules.
- [X] Rebuild each module from its shared entry and currently selected Stack
      contributions, removing contributions from Stacks no longer selected.
- [X] Remove only obsolete direct `.just` files from the managed module
      directory; preserve nested directories and non-`.just` files.
- [X] Reconcile required imports: remove imports for obsolete generated files,
      add missing imports, deduplicate identical declarations, and consolidate
      managed imports at the end in alphabetical module-name order.
- [X] Preserve unrelated recipes, imports, comments, line endings, and
      final-newline style in the root `justfile`.
- [X] Fail clearly when a shipped module name conflicts with an import of the
      same module name from another path, before generated modules are changed.
- [X] Add end-to-end CLI tests for regeneration, newly shipped modules,
      deselected Stacks, obsolete module/import cleanup, deterministic imports,
      idempotency, and import conflicts.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-11-02T21:11:01Z - @unknown**
Execution set to `claimed` at commit `fb867aa49962abb341a23488b720622d2244e4b5`; ticket 01 is integrated and the worktree is clean, satisfying the dependency for ticket 02.

**2026-11-02T21:11:01Z - @unknown**
Execution set to `implementing` at commit `fb867aa49962abb341a23488b720622d2244e4b5`; ticket 02 is dispatched for update-time module reconciliation.

**2026-11-02T21:18:05Z - @unknown**
Execution set to `in-code-review` on the uncommitted ticket 02 snapshot based on `fb867aa49962abb341a23488b720622d2244e4b5`. Controller format and lint checks pass, type checking passes, `init`/`update`/instruction regression tests pass (59/59), and `git diff --check` passes. The formatter was applied to `tests/update.test.ts` before the final test run. No implementation or test edits during review.

**2026-11-02T21:23:41Z - @unknown**
Execution set to `changes-requested` on the same uncommitted ticket 02 snapshot. Task review finding T02-IMP-01 is blocking: when the shipped Just Module catalog is empty, the early `blueprintNames.length === 0` guard skips the initializer, so update leaves obsolete direct module files and imports. Accepted for corrective round 1 with an E2E empty-catalog test preserving nested and non-`.just` files. Code review also raised T02-CR-001 (Minor): regenerated modules are reported as “Added”; parked for aggregate follow-up because it is non-blocking and outside this ticket's acceptance criteria. Code-slop review found no issues.

**2026-11-02T21:28:15Z - @unknown**
Execution set to `in-review` on the uncommitted ticket 02 snapshot based on `fb867aa49962abb341a23488b720622d2244e4b5`. Round 1 addresses T02-IMP-01 and adds empty-catalog update coverage. Controller formatting, lint, type, 60 focused lifecycle tests, and whitespace checks pass. Scoped re-review is in progress. T02-CR-001 remains parked for aggregate follow-up per controller ruling; see the ticket reports.

**2026-11-02T21:31:59Z - @unknown**
Execution set to `integrated` on ticket 02's verified snapshot based on `fb867aa49962abb341a23488b720622d2244e4b5`. Initial code review found no Critical/Important issues; task review's blocking T02-IMP-01 was addressed in round 1 and scoped re-review passed; code-slop review found no material issue. Controller format, lint, type, lifecycle regression (60/60), and whitespace checks pass. T02-CR-001 (Minor update summary labels regenerated modules as “Added”) remains parked for aggregate follow-up as out of acceptance scope. Evidence: [implementation](../reports/02-implementation.md), [code review](../reports/02-code-review.md), [code-slop review](../reports/02-code-slop-review.md), [task review](../reports/02-task-review.md), and [round 1 re-review](../reports/02-round-1-review.md). User requested pausing after this ticket; ticket 03 has not been started.
