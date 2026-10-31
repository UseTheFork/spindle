# Code Review — Ticket 02: Add Stack-specific Blueprint overlays

## Strengths

- `planBlueprintFiles` keeps Blueprint-root files shared and maps selected Stack overlay files relative to their overlay root, so selected overlays merge into the Skill tree while unselected overlay directories are not traversed (`src/install.ts:136-158`).
- Exact duplicate output paths are detected before lifecycle application, and the error identifies the colliding output and both source files (`src/install.ts:160-169`). The tests cover shared/overlay and selected-overlay/selected-overlay collisions at CLI level.
- The lifecycle plans every Blueprint’s eligible source files before applying any Blueprint (`src/blueprints/lifecycle.ts:68-76`), and the update collision test verifies an existing Skill remains unchanged on the tested exact-duplicate failure (`tests/update.test.ts`).
- The Skill handler plans its version from whichever mapped source produces `SKILL.md`, including a selected overlay when no shared `SKILL.md` exists (`src/blueprints/skills/handler.ts`). An update CLI test verifies that case (`tests/update.test.ts`).
- The C1 update-caller correction is reflected in the code and direct reconciliation coverage: Stack selection falls back from Config to the supplied context, with an empty selection as the final fallback (`src/blueprints/lifecycle.ts:55` and `tests/reconciliation.test.ts`).

## Issues

### Critical

None.

### Important

- **`src/install.ts:160-169`; `src/blueprints/lifecycle.ts:181-187` — preflight misses file/directory-prefix collisions.** The preflight rejects only identical output-path strings. A selected set containing a file at `docs` and another file at `docs/readme.md` has distinct strings but cannot be materialized together. The installer will fail when it tries to create a parent directory beneath the file or write a file over a directory (`src/install.ts:191-199`). On update, the lifecycle removes the existing Skill before installation (`src/blueprints/lifecycle.ts:181-186`), so this malformed overlay set can leave the prior Skill deleted or partially replaced despite being a detectable source collision. Extend planning validation to reject any file output path that is a strict path-component prefix of another output path, before application; add an update-level regression test asserting the existing Skill remains unchanged and the error identifies the conflicting paths.

### Minor

None.

## Recommendations

- No optional recommendations beyond the preflight correction and regression test described in Important.

## Checks

- **Reviewed snapshot:** base `3925308b7b15126d77c776283e294a4d55df640b`; HEAD `3925308b7b15126d77c776283e294a4d55df640b`; ticket 02 changes are uncommitted. The assigned frozen package is `/home/sincore/.copilot/session-state/a0213407-e3d4-4289-8674-684f1c819b77/files/ticket-02-frozen-complete.diff`, SHA-256 `d96f2094bd9ac493b718d5cce12519b5de78e472018f8e3b83e2cc37b871190b`. Reviewer recomputed and matched that hash. The package’s changed-file inventory and diff were compared with the checkout; the implementation report addition is included. HEAD and index were unchanged during review.
- **Coverage:** inspected the complete supplied frozen package, changed implementation in `src/install.ts`, `src/blueprints/lifecycle.ts`, `src/blueprints/skills/handler.ts`, and `src/blueprints/types.ts`, and the CLI/reconciliation tests in `tests/init.test.ts`, `tests/update.test.ts`, and `tests/reconciliation.test.ts`. Read the surrounding update Config validation and lifecycle application code. Reviewed the ticket, parent spec, `GLOSSARY.md`, ADR 0001, `docs/agents/tooling.md`, testing instructions, repository Copilot instructions, prior ticket 01 review, and ticket 02 implementation report.
- **Controller-reported verification (not rerun by reviewer):** `just test::test` — 75 passed, 0 failed, 0 skipped; `just test::types` — exit 0; `just lint::check` — exit 0; changed-file `just format::check` — all matched files formatted; `just tool::git diff --check` — exit 0. Full repository formatting failed because of 45 files outside ticket 02. The checks are reported as covering the current implementation snapshot.
- **Reviewer-run checks:** recomputed the frozen-package SHA-256; inspected `git rev-parse HEAD`, `git status --short`, package manifest, and index cleanliness. No test, type, lint, formatting, build, or runtime reproduction command was run by the reviewer. The path-prefix collision finding is based on the inspected preflight and application control flow, not a separately executed reproduction.
- **Limitations:** the full test suite and mechanical gates remain controller evidence rather than reviewer-run evidence. Full repository formatting is known to fail on unrelated files as reported; this review does not assess or request changes to those files.

## Declined to judge

None. No considered behavior was set aside as outside the ticket or parent spec; file/directory-prefix collisions are treated as part of the requested pre-application collision safety.

## Assessment

**Ready to merge? With fixes.** The assigned frozen snapshot matches the checkout, and the requested overlay behavior and exact-path collision checks are evidenced. Merge readiness requires preflight rejection of file/directory-prefix conflicts before an update removes the installed Skill, plus regression coverage that proves the prior installed content remains intact on that error. Controller acceptance and any corrective dispatch remain the controller’s decision.
