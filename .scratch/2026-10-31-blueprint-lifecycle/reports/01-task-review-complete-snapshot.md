# Spec Compliance — FAIL

Reviewed the complete frozen task diff at `/home/sincore/.copilot/session-state/a0213407-e3d4-4289-8674-684f1c819b77/files/ticket-01-frozen-complete.diff`, SHA256 `fbd6abe0d419df9f5162fd424c07a0789228b259b1ddb75c429786d3d51d5cfe`. It identifies checkout `/home/sincore/source/spindle`, base/head `d63e527fc49538f7d7586e7bada8ecf871a0680f`, with task changes uncommitted. The complete package includes the lifecycle, registry, handler, types, Blueprint files, tracked changes, and implementation report. No mutable-worktree diff or Git command was used.

| Acceptance criterion | Spec verdict | Diff evidence |
| --- | --- | --- |
| 1. Static TypeScript registry connects shared lifecycle engine to Skill handler; Skills only. | **PASS** | `src/blueprints/registry.ts:1-3` exports a static list containing only `skillHandler`; CLI init and update route through `reconcileBlueprints` and that registry (`src/index.ts:9-10`; `src/update.ts:6-7`). |
| 2. Skill handler declares source, destination, metadata/lifecycle rules; common discovery/rendering/install/reconciliation is shared. | **PASS** | `src/blueprints/skills/handler.ts:14-38` declares Skill source/destination, metadata file/validation, and version operations. Shared discovery, planning, conflict handling and reconciliation are in `src/blueprints/lifecycle.ts:25-232`; common recursive file installation/rendering is in `src/install.ts:77-110`. |
| 3. Unified init/update use lifecycle, preserving version-aware Skill updates and existing conflict behavior. | **FAIL** | Init and update use the registry/lifecycle (`src/index.ts:59-68`; `src/update.ts:101-120`), and lifecycle retains version comparison and conflict policies (`src/blueprints/lifecycle.ts:71-166`). However, the new required Variable `needed` (`src/variables.ts:8-12`) is unused by shipped Blueprints yet requires callers to supply it; production init tests had to add `--var needed=production-test` (`tests/stubs.test.ts:63-70`), and the implementation report documents the CLI failure when omitted (round 2, “Finding C2”). This adds a new mandatory init input unrelated to Skill lifecycle and fails preservation of existing user-facing behavior. |
| 4. Handler and Markdown Blueprints together; no prior-layout adapter. | **PASS** | Skill handler and Markdown Blueprint content are colocated under `src/blueprints/skills/` (`src/blueprints/skills/handler.ts:1-39`; `src/blueprints/skills/int-codebase-design/SKILL.md:1-10`). The old `src/reconcile.ts` and `src/stubs` content are removed; the new root is used by `blueprintsRoot` (`src/install.ts:33-37`). |
| 5. Config stores selected Stacks and user Variables, passed explicitly without mutable global state. | **PASS** | Init constructs a local Config and passes it and the render context to lifecycle (`src/index.ts`, hunk at the former line 57). Update reads stored Config and passes it explicitly to lifecycle, with context resolution supplied as a callback (`src/update.ts`, hunk at the former line 90). |
| 6. Shared Variable names/definitions are typed TypeScript and use one namespace/value. | **PASS** | `src/variables.ts:1-17` declares a typed `VariableDefinition` collection and returns copies from the shared `loadVariableDefinitions`; Config and render context use one variables record. The unused mandatory `needed` entry is raised separately under criterion 3. |
| 7. Nunjucks renders Markdown before gray-matter; all frontmatter parsing uses gray-matter and kind-specific validation. | **PASS** | `src/version.ts:48-60` renders before `matter(...).data` parses the version; `src/blueprints/skills/handler.ts:3,18-26` validates rendered Skill metadata using gray-matter. The prior custom version parser is removed in the same diff. |
| 8. Shared/nested text uses Stack conditions and Variables; non-renderable files remain byte-preserving. | **PASS** | `tests/init.test.ts:107-162` checks Stack conditional and Variable rendering in frontmatter and nested Markdown plus exact binary bytes. `src/install.ts:95-110` recursively installs, renders supported text, and uses `copyFile` for non-renderable files. |
| 9. CLI init/update fixture tests cover generated content, Config, rendering, frontmatter/version, and relevant Skill lifecycle outcomes. | **PASS** | Init fixture asserts generated Markdown, Config, nested rendering, and binary bytes (`tests/init.test.ts:107-162`). Update fixture tests a templated version rendered before comparison/install (`tests/update.test.ts:124-151`); existing CLI update tests cover version/conflict outcomes, and adapted reconciliation scenarios cover skip/update/warning results (`tests/update.test.ts`, existing test hunks; `tests/reconciliation.test.ts:26-176`). |

**Unverifiable requirements / required controller checks:** None for the nine ticket criteria. The controller explicitly scoped whole-file Stack overlays and output-collision behavior to ticket 02; these are not treated as blockers for ticket 01.

# Quality — FAIL

The lifecycle is separated from Skill-specific source and version policy, with explicit inputs and registry dispatch (`src/blueprints/lifecycle.ts:25-55`, `src/blueprints/skills/handler.ts:14-38`). CLI fixture tests assert concrete results, including exact rendered Markdown, Config and asset bytes (`tests/init.test.ts:107-162`). The most consequential quality issue is the globally mandatory `needed` Variable: it is not used by the shipped Blueprint content, but its no-default definition forces every init invocation to provide a value. The fixture edits that supply it mask rather than protect ordinary init behavior.

**Verification evidence for this snapshot (reported by the assignment; not reviewer-run):** `just test::test` — 67 passed, 0 failed, 0 skipped; `just test::types` — exit 0; `just lint::check` — exit 0; targeted changed-file `just format::check ...` — pass. Full-repository `just format::check` — exit 1 because 27 unrelated files outside this ticket are not formatted. Package build was not run because no approved Just build recipe exists. The implementation report documents RED/GREEN evidence for templated version handling and fresh full-suite evidence after the final test correction. No relevant test output was stated as missing or ambiguous.

# Strengths

- The static registry is small and explicit, with only the ready Skill kind registered (`src/blueprints/registry.ts:1-3`).
- Shared lifecycle behavior is implemented once, while Skill-specific metadata and version behavior is expressed in the handler (`src/blueprints/lifecycle.ts:25-232`; `src/blueprints/skills/handler.ts:14-38`).
- Explicit Config/context flow avoids mutable global state (`src/index.ts`, hunk at former line 57; `src/update.ts`, hunk at former line 90).
- Frontmatter rendering/parsing order and nested/binary behavior have concrete CLI fixture assertions (`src/version.ts:48-60`; `tests/init.test.ts:107-162`).

# Issues

## Critical

None.

## Important

### T01-R3 — Unused required Variable breaks normal init without an unrelated flag

- **Impact/severity:** Important; introduces a required input for every project initialization, despite no shipped Blueprint using this value.
- **Evidence:** `src/variables.ts:8-12` declares `needed` without a default. The production CLI fixture has to pass `--var needed=production-test` (`tests/stubs.test.ts:63-70`); the common init test helper also unconditionally appends `--var needed=fixture` (`tests/init.test.ts:35-48`). The implementation report's round-2 C2 describes the CLI error requiring `--var needed=<value>` before this was supplied. No shipped Blueprint diff uses `variables.needed`.
- **Required correction:** Remove this test-only Variable from the shared production definitions and revise fixtures to supply only Variables that the product contract actually requires; if a required Variable is genuinely intended, define its user-facing purpose and ensure it is used by a Blueprint. Preserve a CLI test proving default `init` works without an unrelated `needed` flag.
- **Blocking:** Yes.

## Minor

### T01-R4 — Full-repository formatting check fails outside this ticket

- **Impact/severity:** Minor; changed-file formatting check passed, but the reported full-repository check exits unsuccessfully due to unrelated files.
- **Evidence:** Assignment-reported `just format::check` exits 1 because 27 files outside this ticket are unformatted; targeted changed-file formatting passes.
- **Required correction:** Record as an existing out-of-scope limitation or handle through a separately scoped cleanup; avoid broadening this ticket without authorization.
- **Blocking:** No, considered alone.

# Checks

- **Reviewer-run:** No commands or focused checks were run. The assigned frozen diff was read once; no mutable diff, checkout, or source file reread was used.
- **Implementer/controller-reported evidence for the frozen package SHA above:**
  - `just test::test` — 67 passed, 0 failed, 0 skipped.
  - `just test::types` — exit 0.
  - `just lint::check` — exit 0.
  - Targeted changed-file `just format::check ...` — pass.
  - Full-repository `just format::check` — exit 1; 27 unrelated files outside the ticket are unformatted.
  - Package build — not run; no approved Just package-build recipe exists.
  - Implementation report documents a RED then GREEN cycle for the templated version behavior and corrective round evidence.
- **Snapshot and limitation:** These results are reported for the implementation/test snapshot identified by the complete frozen package SHA. The subsequent tracker-only update does not alter implementation code/tests. Package build behavior remains unverified.

# Assessment

- **Spec:** FAIL.
- **Quality:** FAIL.
- **Task quality:** Needs fixes.
- **Review recommendation:** Do not approve until T01-R3 is corrected and ordinary CLI initialization without the unused required Variable is covered. This is a review recommendation; controller acceptance and execution state remain controller-owned.
