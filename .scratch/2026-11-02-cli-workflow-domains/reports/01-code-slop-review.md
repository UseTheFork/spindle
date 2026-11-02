# Ticket 01 code-slop review

## Findings

### Important

None.

### Minor

- **`src/index.ts:150,213` — unnecessary async wrapper.** `runSdd` only parses
  arguments, calls the synchronous `resolveWorkspace`, and writes output; it
  contains no asynchronous operations, yet is declared `async` and awaited at
  its only call site. Make it synchronous and call it directly. The surrounding
  `async main()` still turns thrown errors into rejections handled by the
  existing `main().catch(...)`, so CLI output and error handling are preserved.

## Checks and Snapshot

- **Reviewed snapshot:** base `a7f652f54c99ee96f1b04287c23ee4529cb943a9`;
  HEAD `a7f652f54c99ee96f1b04287c23ee4529cb943a9`; no staged changes. The
  reviewed worktree had the supplied dirty changes:
  - Modified: `.github/scripts/int-subagent-driven-dev/README.md`;
    `.github/skills/int-subagent-driven-dev/SKILL.md` and
    `example-workflow.md`; `.scratch/2026-11-02-cli-workflow-domains/issues/01-sdd-workspace-command.md`;
    `docs/agents/issue-tracker.md`; `justfile`;
    `src/blueprints/skills/int-subagent-driven-dev/SKILL.md` and
    `example-workflow.md`; `src/index.ts`; `tests/just-prerequisite.test.ts`.
  - Deleted: `.github/scripts/int-subagent-driven-dev/helpers.test.cjs`,
    `sdd.just`, and `workspace.cjs`.
  - Untracked: `.scratch/2026-11-02-cli-workflow-domains/reports/01-implementation.md`,
    `.scratch/2026-11-02-cli-workflow-domains/reports/01-controller-checks.md`,
    `src/subagent-driven-dev/workspace.ts`, and `tests/sdd-workspace.test.ts`.
    The issue's `Execution: implementing` field is controller-owned.
- **Changes covered:** the native SDD workspace resolver and CLI dispatch/help,
  migrated CLI and Just-prerequisite tests, removal of the obsolete SDD CJS
  implementation/test/Just module, and the SDD guidance/tracker migration.
  The assigned code-review report and controller rulings were `NONE`.
- **Evidence inspected:** approved spec, design, ticket, implementation report,
  controller-check report, complete tracked diff, directly inspected untracked
  files, changed TypeScript/tests and surrounding CLI flow, and applicable
  code-slop rule guidance. `just tool::git-detailed-diff` showed the tracked
  diff but its untracked-file section was scoped to its invocation directory;
  each supplied untracked file was inspected directly. The supplied inventory
  matched `git status` and HEAD.
- **Checks run by this reviewer:** no tests, lint, formatting, type check, or
  build commands were run.
- **Supplied verification evidence inspected (not rerun):** formatting,
  lint, types, diff hygiene, and the focused ticket regression suite are
  reported passing. The full suite is reported as 148/149, with its one failure
  in the unchanged local Skill-count assertion in `tests/stubs.test.ts`. The
  package build attempt is reported blocked because the existing Just recipe
  targets the nonexistent `packages/orchestration` directory. Those checks
  cover the implementation report's stated snapshot; no separate code-review
  report or controller ruling was supplied.

## Assessment

**Code slop found? Yes.** One minor, unnecessary async wrapper is supported by
the changed CLI code. Otherwise the new resolver keeps its helpers local, and
the tests exercise the public CLI with real disposable Git repositories and
observable results rather than mock-only or implementation-mirroring checks.

| Changed area                                                     | Verdict    | Top finding                                 | Suggested action                      |
| ---------------------------------------------------------------- | ---------- | ------------------------------------------- | ------------------------------------- |
| `src/index.ts`                                                   | SUSPICIOUS | `runSdd` is async without asynchronous work | Remove `async` and its single `await` |
| `src/subagent-driven-dev/workspace.ts`                           | CLEAN      | —                                           | —                                     |
| `tests/sdd-workspace.test.ts`, `tests/just-prerequisite.test.ts` | CLEAN      | —                                           | —                                     |
| SDD guidance, tracker, README, and Just-module migration         | CLEAN      | —                                           | —                                     |
| Removed obsolete SDD CJS files                                   | CLEAN      | —                                           | —                                     |

Comments, naming, defensive checks, and style were otherwise unremarkable in
the changed TypeScript paths: there are no narration/placeholder comments,
type escape hatches, debug artifacts, or redundant null guards. The resolver's
`ENOENT` handling is necessary to distinguish absent paths while rejecting
dangling symlink report targets.
