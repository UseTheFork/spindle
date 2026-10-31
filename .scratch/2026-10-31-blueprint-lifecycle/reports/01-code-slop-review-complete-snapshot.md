# Ticket 01 code-slop review

## Findings

### Important

1. **The supposedly kind-neutral handler makes Skill semver mandatory.**  
   **Evidence:** `src/blueprints/types.ts:7-12` requires every handler to expose a metadata file and version-reading, templating, validation, and comparison callbacks. `src/blueprints/lifecycle.ts:80-109` then unconditionally requires every shipped Blueprint to have a valid semver version and describes invalid installed metadata as `SKILL.md`.  
   **Impact:** This is speculative generality with a Skill-specific contract embedded in the shared engine. A future kind without a semver version must provide meaningless callbacks or cannot use the registry, and failures/warnings from common code will carry Skill-specific assumptions. That undercuts the stated purpose of per-kind metadata and lifecycle rules.  
   **Behavior-preserving simplification:** Keep the generic handler contract limited to shared source/destination and metadata validation needs. Put version-aware planning behind a Skill-specific policy/capability (or otherwise make that lifecycle rule optional), preserving the current Skill version behavior without imposing semver machinery on every kind.

### Minor

1. **Templated-version detection scans unrelated frontmatter and can resolve Variables prematurely.**  
   **Evidence:** `src/version.ts:64-71` names the predicate `skillVersionIsTemplated`, but checks for Nunjucks delimiters anywhere in `matter(content).matter`. `src/blueprints/lifecycle.ts:81-87` calls it while planning each Blueprint, before the engine knows whether that Blueprint will be installed or updated, and resolves the full Variable context when it returns true.  
   **Impact:** A template in a description or another non-version metadata field can trigger Variable prompts even when the version is static and the Blueprint is already current or will be skipped. This adds unnecessary work and can make an otherwise no-op update ask for values unrelated to version comparison.  
   **Behavior-preserving simplification:** Detect templating in the `version` field specifically. Other templated metadata can continue to use the existing install-time context resolution when the Blueprint is actually selected for installation.

## Checks and Snapshot

- **Review phase:** INITIAL_TASK review.
- **Workspace and revisions supplied:** `/home/sincore/source/spindle`; base/head `d63e527fc49538f7d7586e7bada8ecf871a0680f` / `d63e527fc49538f7d7586e7bada8ecf871a0680f`; implementation changes are uncommitted.
- **Exact reviewed snapshot:** `/home/sincore/.copilot/session-state/a0213407-e3d4-4289-8674-684f1c819b77/files/ticket-01-frozen-complete.diff`
- **SHA-256:** `fbd6abe0d419df9f5162fd424c07a0789228b259b1ddb75c429786d3d51d5cfe`, matching the assignment.
- **Snapshot coverage:** Inspected the frozen diff only, including tracked changes, deleted old files, added lifecycle/registry/handler/type files, relocated Skill content, tests, package path correction, and implementation report. The change summary lists 26 files with the replacement Blueprint source files present. The prior incomplete-package report was preserved and not used as implementation input.
- **Requirements and context inspected:** Canonical ticket and parent spec; `GLOSSARY.md`; Blueprint lifecycle ADR; tooling, testing, and Copilot instructions. The scope was ticket 01; ticket 02 Stack-overlay and collision behavior was not evaluated as part of this review.
- **Additional evidence:** Supplied implementation report C1 documents the package copy-path correction; C2 documents production-test path/config migration. Controller status is `NONE — parallel code review pending`; no reviewer rulings were available.
- **Read-only checks run:** `sha256sum` confirmed the supplied package hash; `git apply --stat` and `git apply --summary` confirmed the reported package scope and source additions; `wc -l -c` measured the package. Source hunks and relevant file line numbers were inspected directly from the frozen package. No patch was applied.
- **Verification evidence supplied by the controller, not rerun:** `just test::test` — 67 passed, 0 failed, 0 skipped; `just test::types` — exit 0; `just lint::check` — exit 0; targeted changed-file formatting — pass; full repository formatting — exit 1 due to 27 files outside ticket 01; package build — not run because no approved Just build recipe was available.
- **Coverage limits:** No tests, lint, formatting, type checks, or build were run in this review. Findings are based on the frozen code and requirements; reported verification outcomes above remain controller-supplied evidence. No mutable checkout implementation files were inspected.

## Assessment

**Code slop found? Yes.** The generic lifecycle imposes mandatory Skill semver behavior on every handler, and its templated-version detection can resolve Variables for unrelated metadata before installation is needed. The report identifies behavior-preserving ways to keep Skill behavior while removing those unnecessary constraints and prompts.
