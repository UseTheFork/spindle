# Spec Compliance

**Verdict: FAIL**

| Criterion | Spec verdict | Quality verdict | Evidence |
|---|---|---|---|
| 1. Init and update remove retired entries irrespective of Stack filters, including source-less records. | PASS | PASS | `src/blueprints/catalog.ts:208-210` plans removed entries without source lookup; shared reconciliation handles both modes. `tests/removals.test.ts:96-240` exercises both CLI commands and source-less removals. |
| 2. Inapplicable entries are removed; multi-Stack any-match and empty-list semantics hold. | PASS | PASS | `src/blueprints/catalog.ts:258-260` records nonmatching entries; the existing `.some(...)` test is any-match. `tests/removals.test.ts:248-317` checks Stack transition and multi-Stack retention; the all-Stack baseline uses empty lists in `tests/removals.test.ts:30-78`. |
| 3. File removals affect only the file; directory removals recursively remove the owned subtree. | PASS | PASS | `src/blueprints/lifecycle.ts:393-415` validates target type; `src/blueprints/lifecycle.ts:434-450` applies recursive removal only for directory entries. `tests/removals.test.ts:120-220` checks edited targets and nested additions. |
| 4. Removals are unconditional, absence is a no-op, and reconciliation repeats reliably. | PASS | PASS | Deletions are planned separately from update decisions in `src/blueprints/lifecycle.ts:475-511`; missing targets are skipped in `src/blueprints/lifecycle.ts:424-438`. `tests/removals.test.ts:180-245` covers skip/include-new options, absent targets, and a repeated update. |
| 5. Retired/inapplicable Just Modules lose managed root imports while unrelated imports/content remain. | **FAIL** | **FAIL** | `src/blueprints/just.ts:90-92` removes an import by its declared module identifier, although removal records are derived from filename stems at `src/blueprints/just.ts:159-164`. A managed import whose valid identifier differs from the module filename survives while its target is deleted, leaving a dangling import. The common same-name case and preservation of unrelated content are tested at `tests/removals.test.ts:220-235`. See `T02-R1`. |
| 6. Missing catalog entries and path changes do not infer cleanup; explicit removal records can clean up. | PASS | PASS | Only catalog entries produce deletion records (`src/blueprints/catalog.ts:199-210, 258-260`). `tests/removals.test.ts:248-317` asserts an old target remains after the active path changes; source-less explicit removals are exercised at `tests/removals.test.ts:30-78, 96-240`. |
| 7. Unsafe targets/ancestors and overlapping ownership are rejected before unsafe side effects and remain within kind roots. | PASS | PASS | Target/ancestor checks precede application at `src/blueprints/lifecycle.ts:393-415, 510-511`, using `assertSafeInstallPaths` (`src/install.ts:60-105`). Catalog overlap validation is in `src/blueprints/catalog.ts:156-174`. CLI tests cover symlink and wrong-type targets without deleting other targets at `tests/removals.test.ts:320-416`. |
| 8. Actual removals are reported; failures are unsuccessful/actionable; planned deletions are exposed. | PASS | PASS | Planned deletion targets/reasons are exposed by `src/blueprints/lifecycle.ts:110-147`; failures include target and completed-removal details at `src/blueprints/lifecycle.ts:418-450`. CLI reporting is in `src/index.ts:71-72` and `src/update.ts:128-129`; failure behavior is exercised at `tests/removals.test.ts:418-516`. |
| 9. Real CLI coverage includes all kinds/commands, edits, nested additions, source-less/absent/repeated targets, Stack cases, options, and Just cleanup. | PASS | PASS | `tests/removals.test.ts:96-240, 248-317, 418-516` uses the real CLI fixture harness and covers these behaviors; controller reports the full suite green. |
| 10. CLI coverage verifies no inferred cleanup for missing entries/path changes and safe rejection without out-of-root effects. | PASS | PASS | Old/unlisted targets are preserved in `tests/removals.test.ts:288-317`; unsafe targets and outside content are checked at `tests/removals.test.ts:320-416`. |
| 11. Related removal documentation is updated and focused tests/types run through Just. | PASS | PASS | Removal behavior and no-inference guidance are updated in `docs/blueprints.md:12-25`. Verification evidence is summarized under Checks. |

Unverifiable requirements and required controller checks: None.

# Quality

**Verdict: FAIL**

The removal planner separates deletion records from applicable selections, validates all planned deletion targets before reconciliation applies changes, treats absent targets as no-ops, and reports application failures with actionable paths and completed work (`src/blueprints/lifecycle.ts:110-147, 393-450, 510-511`). Real CLI tests cover the principal destructive cases, and the controller reports fresh full-suite, type, scoped format, and scoped lint checks as green. One edge case leaves a Just root file referencing a module that has just been deleted; this is a correctness defect and blocks approval.

# Strengths

- Deletion plans include kind, catalog key, path, target, type, and reason for downstream coordination (`src/blueprints/lifecycle.ts:89-147`).
- Deletion target type and ancestry are checked before changes, with actual removal revalidated before execution (`src/blueprints/lifecycle.ts:393-415, 510-511`).
- Real CLI tests verify edits and nested additions are removed while unrelated project content, baseline content, and unlisted Just imports/modules survive (`tests/removals.test.ts:96-240`).
- The implementation reports actual removals in both commands and makes injected filesystem failures unsuccessful with completed-work diagnostics (`src/index.ts:71-72`, `src/update.ts:128-129`, `tests/removals.test.ts:418-516`).

# Issues

## Critical

None.

## Important

### T02-R1 — Managed Just import can survive deletion of its module

- **Impact/severity:** Important — a legal managed import identifier that differs from the module filename is retained after the referenced file is deleted, leaving the project's root Just configuration broken.
- **File/line:** `src/blueprints/just.ts:90-92` (deletion matching); `src/blueprints/just.ts:239-248` (module deletion).
- **Evidence:** `removedNames` is built from deletion path stems (`src/blueprints/just.ts:159-164`), but import cleanup checks `removedNames.has(name)` where `name` is the declaration identifier. The matched managed target path is available as `importPath`, but is not used to associate the import with the deletion. Existing tests only exercise identical module identifiers and filenames (`tests/removals.test.ts:220-235`).
- **Required correction:** Match a managed import to a removal by its resolved target path (or the managed filename stem), while retaining unrelated imports. Add a real CLI test where a root import identifier differs from the deleted module's filename and assert that neither the module nor its import remains.
- **Blocking:** Yes.

## Minor

None.

# Checks

- **Reviewed snapshot:** checkout `/home/sincore/source/spindle`, base and head `e1623d6536cda346245fe86b4b5963ac8ea2612a`, plus the uncommitted ticket-02 changes and disclosed tracker update. The complete task diff and untracked test/report artifacts were reviewed. No checkout state, index, HEAD, or branches were changed.
- **Implementer-reported:** focused RED run had two expected failures; focused GREEN suites passed 116/116; `just test::types` passed. These are recorded in `reports/02-implementation.md`.
- **Controller-reported current evidence on this snapshot:** `just test::test` passed 182/182 (exit 0); `just test::types` passed (exit 0); scoped `just format::check` and `just lint::check` passed (exit 0). Test output summary is at `/tmp/1793727916214-copilot-tool-output-4563-fc7697aa-7189-4e22-a071-0cbf0f458fd3.txt`.
- **Reviewer-run checks:** None. Fresh controller evidence and the implementation report were sufficient.
- **Limitations:** Full-repository formatting was not run because unrelated baseline files are known to be unformatted; the assigned scope's format check passed. No other required current check was unavailable.

# Assessment

**Task quality: Needs fixes.** Spec compliance and Quality are both **FAIL** due to blocking finding `T02-R1`. This is a review recommendation, not controller acceptance.
