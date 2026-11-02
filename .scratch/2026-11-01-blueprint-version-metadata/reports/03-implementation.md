# Ticket 03 implementation hand-back

- **Status:** `DONE_WITH_CONCERNS`
- **Checkout:** `/home/sincore/source/spindle`
- **Starting revision:** `f5a7619c049f2372e1a4e14a9daaebbf2cbe5e85`
- **Final revision:** `f5a7619c049f2372e1a4e14a9daaebbf2cbe5e85` (no commit authorized)
- **Tested snapshot:** the final implementation and test edits in this worktree at the final revision above. The only post-test change was this report.

## Changes and evidence

- The shared version reader and metadata validator now use only
  `meta.spindle.version`. Top-level and other-namespace values do not act as
  fallbacks. The CLI test confirms a templated nested version updates and
  preserves a separate `meta.vendor.version`; a legacy top-level-only source
  is rejected and an installed legacy-only version is skipped.
- Update planning always resolves context and renders the whole entry before
  parsing frontmatter. If a shipped entry has no resolved context, planning
  fails explicitly. CLI coverage verifies an up-to-date static entry still
  renders its body and raises on an undefined variable.
- The source-change guard remains enforced; a real-CLI test mutates an entry
  after planning and confirms the update aborts without replacing the installed
  file.
- Migrated 83 shipped/installed Blueprint frontmatter files. Updated the
  installed authoring guidance to describe the nested convention. ADR 0001
  already recorded `meta.spindle.version`, so no ADR edit was needed.
- Updated Skill, Agent, and Instruction lifecycle fixtures/assertions for the
  nested path, including invalid/missing installed versions. Removed redundant
  YAML/Nunjucks syntax-permutation tests while retaining representative
  template, context-isolation, undefined-variable, and source-guard behavior.
- TDD evidence: the nested-version CLI test first failed with “no valid semver
  version” under top-level-only extraction, then passed after the shared lookup
  changed. The static-entry render test first passed without rendering (the
  expected RED), then passed after unconditional rendering was implemented.

## Checks

- `just test::test tests/update.test.ts tests/agents.test.ts tests/instructions.test.ts tests/init.test.ts tests/reconciliation.test.ts tests/variables.test.ts tests/existing-repo.test.ts`
  — **109 passed, 0 failed**.
- `just test::test --test-name-pattern='every shipped skill has a semver version|init installs every production Blueprint' tests/stubs.test.ts`
  — **8 passed, 0 failed**. This filter omits the controller-identified
  baseline failure `only author-blueprint remains a local skill`; an earlier
  attempt to exclude it with a negative filter still ran it and reproduced the
  known inventory mismatch.
- Focused source-change guard test through `just test::test` — **1 passed**.
- Focused nested-template and unconditional-static-render tests through
  `just test::test` — **1 passed each** after implementation.

Formatting, lint, type checks, and ticket-wide regression checks were not run;
they remain with the controller. No commit, push, publication, or ticket state
change was made. The pre-existing controller-owned ticket claim remains
untouched. No other untracked files were present before writing this report.

## Changed files

- `src/version.ts`, `src/blueprints/versioned.ts`
- 83 Blueprint metadata files under `src/blueprints/` and managed `.github/`
  copies
- `.github/skills/author-blueprint/SKILL.md`
- Related lifecycle tests: `tests/update.test.ts`, `tests/agents.test.ts`,
  `tests/instructions.test.ts`, `tests/init.test.ts`,
  `tests/reconciliation.test.ts`, `tests/variables.test.ts`,
  `tests/existing-repo.test.ts`, and `tests/stubs.test.ts`
- This report

## Hand-back

The assigned implementation work and fresh worker checks are complete.
Formatting, lint, type checks, broad regression, and acceptance remain under
controller ownership; the baseline inventory test is excluded by the
controller's exact-name rule.

## Corrective round 1 — T03-CR-01

- **Status:** `DONE`
- **Checkout:** `/home/sincore/source/spindle`
- **Starting and final revision:** `f5a7619c049f2372e1a4e14a9daaebbf2cbe5e85`
  (no commit authorized or made).
- **Starting snapshot:** the supplied dirty ticket 03 implementation, controller
  ticket comments/execution changes, and four untracked review/implementation
  reports were present. Preserved all existing changes and report history.
  The review-artifact discrepancy is resolved by the supplied controller ruling.
- **Round-only changed files:** `src/blueprints/skills/int-codebase-design/SKILL.md`,
  `tests/rendering.test.ts`, and this append-only report.

### Correction and behavioral evidence

- Restored three-space continuation indentation on all six conditional example
  fences and their contents. Indented the Nunjucks conditional tags into the
  numbered entries too, with separating blank lines, so Markdown formatting
  recognizes their list context rather than stripping the fence indentation.
- The installed `.github/skills/int-codebase-design/SKILL.md` already retained
  correct TypeScript example indentation in the supplied snapshot. Preserved it
  unchanged and added explicit coverage.
- Extended the existing rendering seam, exercising actual Nunjucks-rendered
  Markdown for all seven nonempty Stack combinations. Assertions verify the
  three numbered entries, expected languages and closing fences within each
  example-bearing entry, and continuation indentation on every nonblank line
  (including fence contents). The same assertions cover the installed copy.
  No new parser dependency or production rendering change was needed.
- **RED:** `just test::test tests/rendering.test.ts` — exit 1, **6 passed,
  7 failed**. Every Stack combination failed on an unindented opening fence
  under list entry 1; installed-copy coverage passed.
- **Causal formatter diagnostic:** `just format::format src/blueprints/skills/int-codebase-design/SKILL.md tests/rendering.test.ts`
  — exit 0. Scoped to the fix and its test because formatting caused the defect;
  inspection confirmed the formatter retained all nested source fences and
  conditional tags. No ignore directives were necessary.
- **GREEN after formatting:** `just test::test tests/rendering.test.ts` —
  exit 0, **13 passed, 0 failed**.
- **Self-review:** scoped diff retains nested metadata and all original example
  content, changes only the testability list's layout in the source, and leaves
  the already-correct installed copy untouched. No outstanding round finding.

### Exact tested snapshot and pending controller checks

The final GREEN run tested these SHA-256 contents; only this report was edited
afterward:

| File | SHA-256 |
| --- | --- |
| `src/blueprints/skills/int-codebase-design/SKILL.md` | `51eab57c0e0a5b3de48de522e1e834067468836b4cacdd5e5f5d0685d2cc5ee7` |
| `.github/skills/int-codebase-design/SKILL.md` | `2f172bfc95bfc8829b1180ed33109a83401226ef668b66ced43b825d633ba18f` |
| `tests/rendering.test.ts` | `0e7be65369030148f519780aa5f01c33691234e9b58bf43986b01cca3f437b61` |

Final status inspection showed the original dirty/untracked paths plus the
newly modified `tests/rendering.test.ts`; no unrelated files were edited.
Lint, type checks, full/ticket-wide regression tests, and the controller's
changed-file formatting/diff gates were not run in this round and remain with
the controller. The focused formatter diagnostic above is not a ticket-wide
formatting claim. No push, publication, or ticket state changes were made.

**Hand-back:** T03-CR-01 corrected with verified RED/GREEN rendering coverage;
controller review, mechanical gates, and ticket acceptance remain pending.
