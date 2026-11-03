Reporter: unknown
Category: enhancement
Status: ready-for-agent
Execution: integrated

# 02: Retire Just Modules as a Blueprint kind

**What to build:** Spindle manages only the remaining supported Blueprint kinds. A former `just` catalog entry is rejected through generic unknown-kind validation, and previously generated project files and imports remain untouched.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Remove Just Modules from catalog parsing and validation, lifecycle handlers, shipped Blueprint sources, and package assets.
- [ ] Keep generic unknown-kind validation with no Just-specific compatibility behavior or message.
- [ ] Remove Just-specific product tests and Just-only fixtures; preserve unrelated coverage and add no replacement tests.
- [ ] Update current user-facing documentation and applicable ADRs to remove Just-specific product guidance while preserving unrelated decisions.
- [ ] Leave existing project files and imports, and the repository's Just-based developer workflow, untouched.

## Comments

**2026-11-03T21:58:40Z - unknown**
Execution: claimed → implementing at clean snapshot `567d6780223b295cd986ff80f4622f9d760cfcac`; controller selected this dependency-free ticket after integrating ticket 01.

**2026-11-03T22:24:27Z - unknown**
Controller integration finding `T02-INT-1`: ignored `build/blueprints` still contains stale generated Just code/assets, and the package build copies into that directory without removing them. Correct `package.json` build cleanup to remove only those retired generated outputs; preserve the ignored build directory and all developer Just tooling. No root build recipe is available in project tooling guidance.

**2026-11-03T22:27:45Z - unknown**
Execution: in-review for scoped re-review of `T02-INT-1`; package build cleanup is implemented. Changed-file formatting, lint, types, and 148 regression tests pass. No fresh package build was run because the project tooling guidance defines no approved root build recipe; the ignored build output remains untouched.

**2026-11-03T22:30:48Z - unknown**
Execution: in-code-review after scoped re-review cleared `T02-INT-1`; initial code, code-slop, and task reviews now examine the same frozen worktree snapshot. Controller gate: changed-file formatting, lint, types, and 148 regression tests pass; developer Just paths are unchanged. Fresh package build remains unavailable under the repository tooling guidance.

**2026-11-03T22:37:40Z - unknown**
Execution: changes-requested → implementing, corrective round 2 of 5; code-review finding `C02-1` identifies a shipped SDD skill that still falsely requires Just for CLI use. The baseline application scenario failed by instructing a user to install Just; remove that obsolete claim and retain accurate direct-invocation guidance.

**2026-11-03T22:41:41Z - unknown**
Execution: in-review after deleting the stale skill prerequisite sentence. The identical fresh scenario passed; changed-file formatting, lint, types, and 148 CLI/catalog/Blueprint regression tests pass. Scoped re-review is assigned for finding `C02-1`.

**2026-11-03T22:46:49Z - unknown**
Execution: in-review → accepted → integrated at the current ticket snapshot. Initial code review finding `C02-1` was cleared by `reports/02-round-2-review.md`; task and code-slop reviews passed; `T02-INT-1` was cleared by `reports/02-round-1-review.md`. The stale skill guidance baseline failed and the identical fresh retest passed. Changed-file formatting, lint, types, and 148 regression tests pass; the repository developer Just paths are unchanged. A package build was not run because no approved root build recipe exists; ignored build outputs were left untouched, and `package.json` now removes stale Just outputs on builds.
