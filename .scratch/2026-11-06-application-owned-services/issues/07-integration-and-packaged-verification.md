# 07: Complete integration and packaged verification

Reporter: unknown
Category: enhancement

**What to build:** The complete refactor works consistently in source and packaged execution, with no remaining obsolete workflow APIs or ambient project-root discovery and with documentation matching the delivered architecture.

**Blocked by:** 03: Application-owned setup and SDD commands; 06: Application-owned Blueprint reconciliation.

**Status:** ready-for-agent
**Execution:** integrated

- [ ] Audit every existing CLI command and affected workflow for application-owned construction, correct boot use, immutable root usage, and import-safe application modules.
- [ ] Remove any remaining replaced workflow exports, compatibility adapters, stale imports, or obsolete executable wiring; migrate missed consumers directly rather than patching old APIs.
- [ ] Confirm only the executable bootstrap reads the current directory in production code, solely to seed Git-root discovery; explicit workspace arguments retain their established meaning.
- [ ] Confirm command classes occupy their own folders and pure helpers use focused utility files rather than a replacement catch-all module.
- [ ] Verify source and packaged CLI execution target the same Git root from root and nested directories, preserve Blueprint source lookup/overrides, and never write nested fallback project output.
- [ ] Verify workspace commands fail explicitly without successful Git discovery, while help and version work outside Git and with Git unavailable.
- [ ] Preserve all existing command options, prompts, output contracts, Blueprint lifecycle behavior, and Config semantics except for the agreed Git-root behavior change.
- [ ] Retain and complete public application API coverage for lifecycle, concurrency, failures, cycle diagnostics, fresh instances, and cross-application isolation.
- [ ] Verify repeated workflows through one application cannot reuse stale Config or computed contexts, including installation/reconciliation service reuse.
- [ ] Finish directly related user and developer documentation, including construction/boot rules, singleton versus per-run lifetimes, migration of internal APIs, and mandatory Git discovery.
- [ ] Run the complete existing test suite, type check, lint/format checks, and build through existing Just recipes; verify packaged execution against the freshly built artifact.
- [ ] Resolve regressions caused by the refactor without unrelated cleanup, new DI/testing frameworks, Config schema changes, or weakening existing tests.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-11-06T19:05:57Z - @unknown**
Execution blocked at snapshot `ff0b358c354b2f9fb54767fb5816abd63d5b8cdb491cecc8bbff72d721d9a679`: repository-wide formatting fails on 113 untouched files; changed-file formatting passes. See [implementation report](../reports/7-implementation.md).

**2026-11-06T20:19:51Z - @unknown**
Resumed after formatter configuration was committed in `15aeff54a1902b3629c4280df3d39487dc5ba07f`. On current review snapshot (HEAD `15aeff5`, ticket diff SHA-256 `ade13517948633699729fd41bec03fcae87d778d09af458a7b987989ca680c25`), repository formatting, lint, types, build, packaged tests (5/5), full tests (200/200), and `git diff --check` pass. Advancing to review; prior blocker resolved.

**2026-11-06T20:29:44Z - @unknown**
Corrective round 1 of 5 persisted before dispatch. Initial code review and Spec/Quality review passed. Finding `SL-07-01` from the code-slop review: `docs/agents/tooling.md` repeats explicit `setup-project` and `sdd workspace` path semantics already stated immediately above. Controller ruling: remove only the repeated sentence; keep the existing command-path documentation intact. Prior attempts: NONE. Corrective implementation report will append to [implementation report](../reports/7-implementation.md); scoped re-review destination: `../reports/07-round-1-review.md`.

**2026-11-06T20:36:06Z - @unknown**
Corrective round 1 checks passed after removing `SL-07-01`. Fixed ticket diff SHA-256: `cc3246304d9404436416d925d1b07b03449bd98053e47e5a6b3ea6506be4b64d`; fix-only `docs/agents/tooling.md` diff SHA-256: `2e0a8df886d3fb906d182cd6b4a823bd4b0bb07bf35ed3563ae13843f4a5c911`. Repository formatting, lint, types, and `git diff --check` pass. The previously passing build, packaged tests (5/5), and full suite (200/200) cover unchanged production/test inputs; the sole corrective change is documentation wording. Dispatching scoped re-review to verify the fix.

**2026-11-06T20:39:43Z - @unknown**
Accepted on fixed snapshot `cc3246304d9404436416d925d1b07b03449bd98053e47e5a6b3ea6506be4b64d`. Code review and initial Spec/Quality review passed; scoped re-review addressed `SL-07-01` with no new breakage. Current covering checks are recorded above and in [implementation report](../reports/7-implementation.md); review reports: [code review](../reports/7-code-review.md), [slop review](../reports/7-slop-review.md), [task review](../reports/7-task-review.md), and [round 1 re-review](../reports/07-round-1-review.md).

**2026-11-06T20:40:04Z - @unknown**
Execution integrated on accepted snapshot `cc3246304d9404436416d925d1b07b03449bd98053e47e5a6b3ea6506be4b64d`; preparing the scoped integration commit after all reviews and required checks passed.
