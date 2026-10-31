Category: enhancement
Status: ready-for-agent
Execution: integrated
Reporter: unknown

# 02: Add Stack-specific Blueprint overlays

**What to build:** As a Blueprint author, I want to provide optional whole files for selected Stacks alongside shared Blueprint files, so that content that should only exist for some Stacks can be included without making overlays the normal way to express Stack-specific guidance.

**Blocked by:** 01: Migrate Skills to the Blueprint lifecycle.

- [x] Files at the Blueprint root are included for every selected Stack.
- [x] Files under Stack-specific overlay directories are included only when their Stack is selected; overlays for every selected Stack are combined.
- [x] Files in unselected Stack overlays are omitted from generated Skills.
- [x] Shared and overlay source files are mapped to output paths before application; any duplicate output path across shared and selected overlays or between selected overlays fails explicitly without silently overwriting content.
- [x] CLI-level `init` and `update` tests verify included shared files, selected overlays, omitted unselected overlays, and duplicate-path errors.
- [x] Tests run as part of the existing test suite so collision validation is available for future CI enforcement.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-10-31T18:52:00Z - @unknown**
Execution set to `claimed` at commit `3925308b7b15126d77c776283e294a4d55df640b`; the dependency ticket 01 is integrated and the worktree is clean.

**2026-10-31T18:53:00Z - @unknown**
Execution set to `implementing` at commit `3925308b7b15126d77c776283e294a4d55df640b` plus this tracker update; ticket 02 is dispatched.

**2026-10-31T19:24:00Z - @unknown**
Execution set to `in-code-review` at the uncommitted ticket 02 worktree based on `3925308b7b15126d77c776283e294a4d55df640b`; initial implementation and corrective round 1 are ready for review. Fresh gates: 75/75 full tests, type check, lint, changed-file formatting all pass. Repository-wide formatting still reports unrelated files outside this ticket. Implementation evidence: `../reports/02-implementation.md`.

**2026-10-31T19:36:00Z - @unknown**
Execution set to `changes-requested` at the same uncommitted worktree based on `3925308b7b15126d77c776283e294a4d55df640b`; code review found that file/directory-prefix collisions evade preflight and can delete an installed Skill before update fails. Code-slop review also found duplicate per-file text/binary installation logic. See `../reports/02-code-review.md` and `../reports/02-code-slop-review.md`; corrective round 2 addresses both.

**2026-10-31T20:04:00Z - @unknown**
Execution set to `in-code-review` at the uncommitted corrective-round-2 worktree based on `3925308b7b15126d77c776283e294a4d55df640b`. Fresh controller checks: full test suite 76/76, type check, lint, changed-file formatting, and whitespace check pass. One task-review report formatting issue was fixed with the repository formatter before the final changed-file check. Corrective evidence is in `../reports/02-implementation.md`; scoped re-review is pending.

**2026-10-31 - @unknown**
Controller acceptance: the scoped round-2 re-review marks both findings addressed with no new breakage; task review passed Spec and Quality, and final verification passed 76/76 tests, type check, lint, changed-file formatting, and whitespace checks. All ticket criteria are complete. Execution set to `integrated`; commit follows.

**2026-10-31 - @unknown**
Full-spec final fix removed the unused `installDirectory` entry point and moved text-rendering and byte-preservation test coverage to `planBlueprintFiles` plus `installPlannedBlueprintFiles`. The focused test passed before and after the refactor; aggregate final-fix re-review marks both related Minor findings addressed. See `../reports/final-fix-implementation.md` and `../reports/final-fix-review.md`.
