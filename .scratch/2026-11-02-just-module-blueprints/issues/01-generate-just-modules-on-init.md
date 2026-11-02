Category: enhancement
Status: ready-for-agent
Execution: integrated
Reporter: unknown

# 01: Generate and import Just Modules during `init`

**What to build:** As a project maintainer, I want `init` to generate
independently managed Just Modules from shared and selected Stack content and
make them available through the root `justfile`, so that projects receive
rendered tooling during setup.

**Blocked by:** None (can start immediately).

- [ ] Register Just Modules as a versionless Blueprint kind and migrate
      existing module sources into independently named module Blueprints with
      required shared entries and optional same-named Stack overlays.
- [ ] Validate module names; render shared and selected Stack contributions
      with Nunjucks; combine shared content first and Stack contributions in
      configured order with blank lines between them.
- [ ] During `init`, replace generated module outputs without conflict prompts,
      create a missing root `justfile` with required module imports, and reconcile
      imports in an existing file without replacing unrelated content.
- [ ] Add end-to-end CLI coverage for installation, rendering, Stack
      composition, Variable prompts/errors, and creation or preservation of the
      root `justfile`.
- [ ] Document the versionless Just Module exception and module composition
      decision; add the canonical Just Module term to the glossary.
- [ ] Migrate this repository's optional module imports to required imports.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-11-02T20:03:18Z - @unknown**
Execution set to `claimed` at commit `668b757d20065c62dff2dd14a1c578424989a71e`; ticket 01 is eligible with no blockers and is the first vertical slice of the approved spec graph.

**2026-11-02T20:03:18Z - @unknown**
Execution set to `implementing` at commit `668b757d20065c62dff2dd14a1c578424989a71e` plus this tracker update; ticket 01 is dispatched for implementation.

**2026-11-02T20:09:00Z - @unknown**
Execution set to `changes-requested` on the uncommitted ticket 01 snapshot based on `668b757d20065c62dff2dd14a1c578424989a71e`; controller full-suite check found T01-GATE-001: the instruction integration test's production summary expectation omits the newly registered Just Module kind. Eight additional full-suite failures assert existing Agent/Skill Blueprint source copies match `.github` copies; those paths are unchanged by ticket 01 and remain out of scope.

**2026-11-02T20:31:55Z - @unknown**
Execution set to `in-code-review` on the uncommitted ticket 01 snapshot at `668b757d20065c62dff2dd14a1c578424989a71e`. Round 1 fixed T01-GATE-001 in `tests/instructions.test.ts`. Controller gates pass: formatting, focused lint, type checking, and `tests/init.test.ts` plus `tests/instructions.test.ts` (25/25). The eight `tests/stubs.test.ts` failures reproduce on a clean archive of the starting revision. `git diff --check` passes; no implementation or test edits are authorized during review.

**2026-11-02T20:38:24Z - @unknown**
Execution set to `changes-requested` on the same uncommitted ticket 01 snapshot. Code and task reviews approved the ticket with no blocking findings. Code-slop review finding T01-SLOP-001: remove the unused `githubDirectory` parameter from `prepareModules` and its call. Controller accepts this minor finding for corrective round 2; no other review findings. Re-review is required after the fix and controller checks.

**2026-11-02T20:41:36Z - @unknown**
Execution set to `in-code-review` on the uncommitted ticket 01 snapshot at `668b757d20065c62dff2dd14a1c578424989a71e`. Round 2 removed the unused `githubDirectory` parameter and call argument for T01-SLOP-001. Controller checks pass: formatting, focused lint, type checking, `tests/init.test.ts` plus `tests/instructions.test.ts` (25/25), and `git diff --check`. Re-review of the round 2 fix is required; no implementation/test edits during re-review.

**2026-11-02T20:43:57Z - @unknown**
Execution set to `accepted` on the uncommitted ticket 01 snapshot at `668b757d20065c62dff2dd14a1c578424989a71e`. Initial code review and task review passed with no blocking findings; round 2's scoped re-review marked T01-SLOP-001 addressed. Controller formatting, lint, type, focused CLI tests (25/25), and `git diff --check` pass. The eight full-suite `tests/stubs.test.ts` failures reproduce on a clean archive of the base revision. See [implementation report](../reports/01-implementation.md), [code review](../reports/01-code-review.md), [code-slop review](../reports/01-code-slop-review.md), [task review](../reports/01-task-review.md), and [round 2 re-review](../reports/01-round-2-review.md). Integration commit and subsequent tickets are paused pending explicit commit authorization; no commit was made.

**2026-11-02T20:47:00Z - @unknown**
Execution set to `integrated` on the verified ticket 01 snapshot based on `668b757d20065c62dff2dd14a1c578424989a71e`; final focused tests, format, lint, type, and whitespace checks passed after the round 2 fix. The user authorized commits and continued implementation; this accepted snapshot is being committed before ticket 02.
