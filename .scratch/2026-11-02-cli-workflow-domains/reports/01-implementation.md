# Ticket 01 implementation report

**Status:** DONE_WITH_CONCERNS

## Snapshot

- **Checkout:** `/home/sincore/source/spindle`
- **Starting revision:** `a7f652f54c99ee96f1b04287c23ee4529cb943a9`
- **Final revision:** `a7f652f54c99ee96f1b04287c23ee4529cb943a9` (no commit authorized)
- **Exact tested snapshot:** That HEAD plus the implementation/test/documentation worktree changes listed below and the controller-owned issue state `Execution: implementing`. Final focused tests ran after the last source, test, and guidance edits; the report itself was added afterward and does not change code.
- **Existing change preserved:** `.scratch/2026-11-02-cli-workflow-domains/issues/01-sdd-workspace-command.md` remains controller-owned and modified with `Execution: implementing`.
- **Implementation dirty/untracked changes:** `src/index.ts`; new `src/subagent-driven-dev/workspace.ts`; new `tests/sdd-workspace.test.ts`; `tests/just-prerequisite.test.ts`; `justfile`; `.github/scripts/int-subagent-driven-dev/README.md`; deletion of `.github/scripts/int-subagent-driven-dev/workspace.cjs`, `helpers.test.cjs`, and `sdd.just`; `.github/skills/int-subagent-driven-dev/SKILL.md` and `example-workflow.md`; `src/blueprints/skills/int-subagent-driven-dev/SKILL.md` and `example-workflow.md`; `docs/agents/issue-tracker.md`.
- **Assigned report:** This new file, `.scratch/2026-11-02-cli-workflow-domains/reports/01-implementation.md`.

## Criteria, changes, and evidence

1. Added `src/subagent-driven-dev/workspace.ts` with typed request/result contracts. Git and report-path validation helpers remain local to the feature; domain code does not parse CLI arguments or print/exit.
2. Added `spindle sdd workspace` dispatch with required workspace, reports directory, and ticket options; optional round; strict unknown, duplicate, positional, missing, and inapplicable argument rejection. Errors retain the `spindle:` prefix, nonzero status, and empty stdout.
3. Added `spindle sdd --help`, `spindle sdd workspace --help`, and top-level command discovery. The existing global Just prerequisite still runs before command parsing/help. Public CLI tests show no project Config or prior `init` is needed.
4. Preserved absolute checkout-root and valid-HEAD checks; `.scratch` containment; traversal, escaping-link, ignored-directory and ignored-destination rejection; ticket/round validation; and non-regular target rejection, including dangling symlinks.
5. The public CLI test asserts the exact JSON serialization, result/report key ordering, relative and absolute destinations, filename conventions, and optional `scopedReview` behavior.
6. Tests verify resolution does not create missing report directories, alter existing report contents, or change Git status.
7. Ported the previous CJS assertions to TypeScript CLI tests and added malformed-argument, help, no-Just, and additional symlink/target cases without weakening the prior assertions.
8. Updated the installed SDD Skill, its Blueprint and examples, and the SDD tracker command reference to invoke Spindle directly. Bumped the Skill Blueprint and installed copy to `1.1.0`. Relocated useful helper details into the Skill before removing the old scripts.
9. Removed only the superseded SDD CJS implementation/test and Just module, and removed its root Just import. Kept `.github/scripts/utils/common.cjs` and unrelated Just modules intact.
10. The controller owns formatting, lint, type/build, and ticket-wide regression checks; these remain pending below.

## Test-first evidence

- **RED:** `just test::test tests/sdd-workspace.test.ts` initially failed because the prior CLI rejected `--workspace`, confirming the new public command was not available.
- **RED:** The dangling-report-symlink case initially returned success; switching target checks to `lstat` fixed this gap.
- A later focused run exposed that Node `parseArgs` accepts duplicate values for a non-multiple option. Added explicit duplicate detection; the final focused suite passes.
- A test-cleanup setup error during an intermediate run was corrected and the affected test rerun successfully.

## Fresh checks

- **GREEN —** `just test::test tests/sdd-workspace.test.ts tests/just-prerequisite.test.ts`
- **Result:** 16 tests passed, 0 failed.
- **Not run by implementer; pending controller:** formatting, lint, type check, build, and ticket-wide regression checks. They were not scheduled for this worker and are not implementer failures or evidence of acceptance.

## Self-review and concerns

- No known remaining implementation defect or out-of-scope change.
- No commit, push, PR, issue-state edit, or shared CJS utility removal was performed.

## Hand-back

The public SDD workspace resolver and its focused behavioral coverage are ready for controller verification. The controller-owned issue state is untouched; formatting, lint, type/build, and ticket-wide regression checks remain pending. No commit was made.

## Corrective round 1 — SL-01

**Status:** DONE_WITH_CONCERNS

- **Checkout:** `/home/sincore/source/spindle`
- **Starting revision:** `a7f652f54c99ee96f1b04287c23ee4529cb943a9`
- **Final revision:** `a7f652f54c99ee96f1b04287c23ee4529cb943a9` (no commit authorized)
- **Exact tested snapshot:** Supplied HEAD plus the existing dirty ticket 01 implementation, tests, guidance, tracker/report work and controller-owned `Execution: implementing` issue edit; after the SL-01 source change to `src/index.ts`. The report append happened after the focused test run.
- **Correction:** Removed `async` from `runSdd` and called it directly from `async main()`. `main()` and its existing `main().catch(...)` error handling remain unchanged, preserving CLI output/error behavior.
- **Finding evidence:** SL-01 resolved as ruled. The same focused public CLI subprocess suite passed 7/7 before and after the refactor; no new tests or RED phase were required for this pure refactor.
- **Changed files in this round:** `src/index.ts`; this report appended with round results. No other files were edited.
- **Fresh check:** `just test::test tests/sdd-workspace.test.ts` — 7 passed, 0 failed, after the source change.
- **Self-review:** Diff review confirms only the `runSdd` async modifier and sole `await` were changed; no known remaining concern for SL-01.
- **Dirty/untracked changes:** Preserved the existing worktree state: changes in `.github/scripts/int-subagent-driven-dev/README.md`, deletion of its `helpers.test.cjs`, `sdd.just`, and `workspace.cjs`, changes in `.github/skills/int-subagent-driven-dev/SKILL.md`, `.github/skills/int-subagent-driven-dev/example-workflow.md`, `docs/agents/issue-tracker.md`, `justfile`, `src/blueprints/skills/int-subagent-driven-dev/SKILL.md`, `src/blueprints/skills/int-subagent-driven-dev/example-workflow.md`, `src/index.ts`, `tests/just-prerequisite.test.ts`, and the controller-owned issue file; untracked `.scratch/2026-11-02-cli-workflow-domains/reports/`, `src/subagent-driven-dev/`, and `tests/sdd-workspace.test.ts`.
- **Pending controller checks:** Formatting, lint, type check, ticket regression, and build remain with the controller as assigned. They were not run for this round; pending checks are not implementer failures or evidence of ticket acceptance.
- **Hand-back:** SL-01 correction is ready for controller verification. No commit was made.
