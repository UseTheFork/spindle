# Code Review: Ticket 01 — Standard Nunjucks Rendering

## Strengths

- `src/render.ts:1-14` replaces the global Nunjucks lexer mutation and custom delimiters with a native `Environment` and a text-in/text-out `renderText` function. Autoescaping remains disabled and undefined values still throw.
- `src/install.ts:11-30,74-98` keeps the recognized-extension policy with installation, rejects NUL-containing and invalid-UTF-8 files from rendering, and copies non-renderable inputs without text decoding/re-encoding.
- Tests are separated by behavior: `tests/rendering.test.ts:8-38` covers standard Nunjucks syntax, raw blocks, escaping, undefined values, and literal legacy delimiters; `tests/install.test.ts:9-43` covers nested rendered files and byte-preservation paths. Existing update and Variable fixtures were migrated to standard syntax.
- The added Just formatting, lint, and type-check commands are non-mutating check recipes, and the full test suite verifies the shipped-Stubs roster adjustment in `tests/stubs.test.ts`.

## Issues

### Critical

None.

### Important

None.

### Minor

- **T01-Q-001 — NUL-preservation test does not isolate the NUL condition; non-blocking per controller ruling.**
  **Location:** `tests/install.test.ts:16`.
  **Defect:** The `assets/nul.txt` fixture contains `[0x41, 0x00, 0x42, 0xff]`. Since `0xff` is invalid UTF-8, the file would still be copied byte-for-byte if the NUL guard were removed.
  **Impact:** The test does not independently protect the NUL-detection behavior for an otherwise valid UTF-8 file with a recognized text extension.
  **Correction:** Add a recognized-extension fixture with a NUL and otherwise valid UTF-8 (for example, `Buffer.from("A\0B")`) and assert byte-for-byte preservation. The controller confirmed this finding and assigned it to a corrective round.

- **CS-T01-001 — Existing lint fix recipe was replaced rather than preserved; non-blocking per controller ruling.**
  **Location:** `.github/scripts/just-modules/lint.just:3-5`.
  **Defect:** The base recipe exposed `lint *args` running `pnpm lint:fix`; the change removes that entry point and defines only `check *args` running `pnpm lint`.
  **Impact:** The tooling repair removes an existing Just command and changes the available developer workflow beyond adding a check-only recipe.
  **Correction:** Retain the existing `lint *args` recipe and add the check-only `check *args` recipe alongside it. The controller confirmed this finding and assigned it to a corrective round.

## Recommendations

- Complete the controller-assigned corrective round for T01-Q-001 and CS-T01-001, then rerun the affected tests and recipe listing/checks.
- Keep formatting verification scoped to changed source and test files unless the repository-wide formatting backlog is separately authorized for repair.

## Checks

- **Reviewed snapshot:** Workspace `/home/sincore/source/spindle`; base and HEAD are both `d8fdab23663a028cb0af96a3f485d4eeb0431a18`. HEAD is unchanged, and the supplied implementation diff and untracked `tests/install.test.ts` match the assignment. The reports directory additionally contains the referenced prior task-review and code-slop-review reports and the implementation report. No implementation or index changes were made by this review.
- **Coverage:** Inspected the complete tracked diff, the untracked installation test, rendering and installation source, affected rendering/update/Variable/Stubs tests, Just modules and root Justfile, package scripts, ticket 01 and comments, the relevant full-spec sections, related update ticket, implementation report, prior task-review and code-slop reports, repository glossary, and applicable tooling/testing instructions.
- **Reviewer-run checks on this snapshot:**
  - `just test::test` — passed; 48 tests, 48 passed, 0 failed.
  - `just lint::check` — passed.
  - `just test::types` — passed.
  - `just format::check src/install.ts src/render.ts tests/rendering.test.ts tests/install.test.ts tests/update.test.ts tests/variables.test.ts tests/stubs.test.ts` — passed; all 7 matched changed TypeScript source/test files formatted.
  - `git diff --check` — passed.
- **Other evidence:** The implementation report documents the 41-test focused suite and an initial RED/then-GREEN rendering test. These are reported evidence, not separately rerun here. An earlier unscoped formatting check was reported to fail on formatting issues in 28 repository files; this review reran only the scoped changed-source/test check and did not verify or alter the unrelated files.
- **Limitations:** No package build was run. The assigned ticket concerns rendering and installation; this review did not perform a story-by-story acceptance review of the broader reconciliation requirements (spec stories 1–31).

## Declined to judge

- The broader reconciliation behaviors in spec stories 1–31 are outside the assigned Ticket 01 scope. Although the full suite was run for regression evidence, their implementation and acceptance are not judged in this report.
- No behavior within Ticket 01 was declined as a speculative feature or left for controller interpretation. The two Minor findings above have explicit controller rulings and are assigned to a corrective round.

## Assessment

Ticket 01’s rendering and file-classification changes align with the assigned requirements, and current reviewer-run checks provide sufficient evidence. There are no Critical or Important findings. T01-Q-001 and CS-T01-001 are confirmed Minor, non-blocking findings assigned by the controller for correction.

**Ready to merge? Yes — review recommendation only, not a controller acceptance decision.** The controller-assigned Minor corrections remain to be completed in their corrective round; no unresolved declined-behavior decision blocks this initial review.
