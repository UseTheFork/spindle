# Ticket 02 Implementation Report

**Status:** DONE

## Snapshot and checkout

- **Checkout:** `/home/sincore/source/spindle`
- **Starting revision:** `3925308b7b15126d77c776283e294a4d55df640b`
- **Final revision:** `3925308b7b15126d77c776283e294a4d55df640b` (no commit authorized or created)
- **Exact tested snapshot:** HEAD `3925308b7b15126d77c776283e294a4d55df640b`, with the tracked working-tree diff fingerprint `0713d7cada1daea8415f91a1a5e084a7d81a08d3e734c9c0fe548771cc1d43b9` immediately after the final test run. This fingerprint includes the controller's existing issue-tracker edit and the implementation/test changes; this report was written afterward.
- **Starting dirty state:** only the controller's uncommitted claim/dispatch comments in `.scratch/2026-10-31-blueprint-lifecycle/issues/02-add-stack-specific-blueprint-overlays.md`.
- **Final dirty state:** that tracker edit remains preserved; implementation changes are in the assigned source and test files; this report is newly added. No untracked files were reported before writing this report. Temporary test fixtures were cleaned up.

## Criteria, changes, and evidence

1. **Shared Blueprint-root files remain included.** The installer plans root files alongside overlays. CLI `init` and `update` fixtures assert a shared file is present.
2. **Selected overlays combine; unselected overlays are omitted.** `planBlueprintFiles` recursively includes only `stacks/<selected-stack>/` directories and maps their paths relative to each overlay root. CLI tests select Python and TypeScript, verify both overlay contents (including a nested Python file in `init`), and verify the PHP file is absent.
3. **Duplicate output paths fail before application.** All eligible files for each Blueprint are mapped and checked before lifecycle application. The error names the duplicate relative output path and both source paths. An `init` test covers a shared/selected-overlay collision; an `update` test covers collisions between selected overlays and verifies the installed Skill remains unchanged.
4. **Update metadata can come from an overlay.** Lifecycle passes the mapped files to the Skill handler, so version planning reads an overlay-provided `SKILL.md` if no shared `SKILL.md` exists. The new update test first failed with the expected missing-valid-version error, then passed after the change.
5. **Normal-suite CLI coverage.** The tests are in existing `tests/init.test.ts` and `tests/update.test.ts`; no manifest or CI changes were made.

The initial `init` overlay-inclusion test produced RED before implementation: the generated Python overlay file was missing (`ENOENT`). The update test for overlay-provided `SKILL.md` also produced RED before the handler change. The collision tests were added after collision preflight had already been implemented; they provide passing CLI coverage but were not represented as pre-implementation RED evidence.

## Changed files

- `src/install.ts`
- `src/blueprints/lifecycle.ts`
- `src/blueprints/skills/handler.ts`
- `src/blueprints/types.ts`
- `tests/init.test.ts`
- `tests/update.test.ts`
- `.scratch/2026-10-31-blueprint-lifecycle/reports/02-implementation.md` (this report)

The issue file is not an implementation change; its existing controller edit was preserved.

## Fresh checks

- `just test::test tests/init.test.ts tests/update.test.ts` — **PASS**, 41 tests, 0 failures, 0 skipped.
- `git diff --check` — **PASS** (no whitespace errors).

## Self-review and remaining concerns

- A collector argument error was exposed during the first GREEN run and corrected; the complete final CLI test command passed afterward.
- No remaining implementation findings identified in the assigned scope.
- No corrective-round findings apply (`ROUND=NONE`).
- No commit was made, as commit authorization was denied.

## Controller-owned checks not run

Formatting, lint, type checks, and ticket-wide/full-suite regression checks remain pending with the controller as assigned. They were not scheduled for this worker, are not implementer failures, and are not evidence of ticket acceptance.

## Hand-back

Shared files and selected Stack overlays are now planned together; unselected overlays are omitted; duplicate eligible output paths produce actionable errors before Blueprint changes; and init/update CLI coverage passes. Hand back to the controller for its assigned mechanical gates and acceptance review.

## Corrective round 1 — finding C1

**Round status:** DONE

- **Finding:** Direct `reconcileBlueprints` update callers can provide `context.stacks` without a Config. The prior implementation unconditionally read `options.config.stacks`, causing a `TypeError` before version validation and masking the expected invalid-shipped-version error.
- **Correction:** Update `config` is now optional in `ReconcileOptions`; overlay stack selection uses `options.config?.stacks ?? options.context?.stacks ?? []`. Init still requires Config, and its persistence behavior is unchanged.
- **Coverage:** Added a direct lifecycle update test with no Config, Python in context, shared and Python overlay files, and a TypeScript overlay. It asserts shared and selected files are installed and the unselected overlay is absent. Existing direct reconciliation tests also verify normal updates and invalid-version errors without Config.
- **RED evidence:** `just test::test tests/reconciliation.test.ts` failed 2/4 before the new test: both update cases reached `Cannot read properties of undefined (reading 'stacks')`; the invalid-version test was masked by the same `TypeError`. After adding the context-only overlay test, the same command failed 3/5 with the same intended error, including the new test.
- **GREEN evidence:** `just test::test tests/reconciliation.test.ts` — **PASS**, 5 tests, 0 failures. Then `just test::test tests/init.test.ts tests/update.test.ts tests/reconciliation.test.ts` — **PASS**, 46 tests, 0 failures, 0 skipped.
- **Whitespace/scope evidence:** `git diff --check` — **PASS**. Corrective source/test changes are limited to `src/blueprints/lifecycle.ts` and `tests/reconciliation.test.ts`; binary diff fingerprint for those two files after the final test run: `230fb9e5dd8fea96a8ebdb15875d832226db965e5beb1313b9ab4d7e9241d205`.
- **Corrective snapshot:** Checkout `/home/sincore/source/spindle`; HEAD remains `3925308b7b15126d77c776283e294a4d55df640b`, with the prior ticket 02 working-tree changes and controller tracker entry preserved. No commit, index, branch, or tracker edits were made in this corrective round.
- **Checks not run:** Formatting, lint, type checks, and broader ticket-wide regression gates remain controller-owned and were not scheduled for this corrective worker.

**Corrective hand-back:** C1 is addressed with the ruled config-to-context stack fallback. Focused reconciliation plus init/update/reconciliation CLI checks pass; hand back for controller review and remaining assigned gates.

## Corrective round 2 — findings T02-C2 and T02-S2

**Round status:** DONE

- **T02-C2 correction:** `planBlueprintFiles` normalizes output paths, rejects exact duplicates, then checks each output's strict path-component ancestors against the complete eligible output map. This catches a file/directory prefix collision regardless of which source appeared first, without treating a component such as `docs2` as `docs`. The error identifies both normalized output paths and both source paths. Preflight remains before reconciliation removes or writes the installed Skill.
- **T02-C2 covering test:** Added an `update` CLI case with shared file `docs` and selected Python overlay file `docs/readme.md`. It asserts the actionable prefix-conflict diagnostic, the original installed `SKILL.md` remains unchanged, and the pre-existing `extra.txt` remains present.
- **T02-C2 RED evidence:** `just test::test tests/update.test.ts --test-name-pattern='file directory prefix'` failed because the unguarded path reached `EEXIST` while making the destination `docs` directory. After ordering preservation assertions first, the same RED test showed the installed Skill had already changed from version 1.0.0 to 2.0.0 before the filesystem failure.
- **T02-C2 GREEN evidence:** The targeted command passed 28/28 after preflight was added. The required pre-refactor baseline `just test::test tests/init.test.ts tests/update.test.ts tests/install.test.ts` passed 43/43.
- **T02-S2 disposition:** Extracted a shared `installFile` routine used by both `installDirectory` and `installPlannedBlueprintFiles`. Both now share identical file reading, text/binary detection, UTF-8 decoding, rendering, metadata validation, and copy/write behavior; traversal and mapped paths remain in their original callers. This was treated as a pure refactor, without adding a manufactured RED test.
- **T02-S2 behavior-preservation evidence:** Re-ran the identical `just test::test tests/init.test.ts tests/update.test.ts tests/install.test.ts` command after extraction; it passed 43/43.
- **Final fresh checks:** `just test::test tests/init.test.ts tests/update.test.ts tests/install.test.ts tests/reconciliation.test.ts` — **PASS**, 48 tests, 0 failures, 0 skipped. `git diff --check` — **PASS**.
- **Corrective snapshot:** Checkout `/home/sincore/source/spindle`; HEAD remains `3925308b7b15126d77c776283e294a4d55df640b`. After final tests, the binary diff fingerprint for the assigned round 2 files `src/install.ts` and `tests/update.test.ts` was `273196ce04184cda1d819a7ab9af56ccac22f94280d2193c829567c5b1cf2c5e`. Earlier ticket changes, round 1 work, tracker entry, and review reports remain preserved. No commit, index, branch, or tracker edits were made.
- **Checks not run:** Formatting, lint, type checks, and full ticket-wide regression gates remain controller-owned and were not scheduled for this corrective worker.

**Corrective hand-back:** Both round 2 findings are addressed within assigned scope. Prefix collisions are rejected before update mutation, and both installation paths share the file-processing routine. Targeted RED/GREEN, pre/post refactor checks, and final relevant tests are recorded above; return to controller review without committing.

## Controller verification after corrective round 2

- `just test::test` — **PASS**, 76 tests, 0 failures, 0 skipped.
- `just test::types` — **PASS**.
- `just lint::check` — **PASS**.
- `just format::check` on all changed source, test, tracker, and report files — **PASS** after formatting `02-task-review.md` with `just format::format`.
- `git diff --check` — **PASS**.
- The initial targeted formatting check identified only `02-task-review.md`; it was corrected with the repository formatter and the changed-file check then passed. Repository-wide formatting was not rerun; earlier ticket evidence identifies unrelated repository formatting issues.
- Controller correction to the original snapshot note: the user authorized commits for this delivery. Ticket 02 has not yet been committed; integration remains pending review and final verification.

The frozen snapshot for corrective-round-2 re-review uses HEAD `3925308b7b15126d77c776283e294a4d55df640b` plus the current tracked and untracked working-tree changes. No commit was made.
