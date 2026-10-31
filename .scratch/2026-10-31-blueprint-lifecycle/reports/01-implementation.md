# Ticket 01 implementation report

**Status:** DONE_WITH_CONCERNS

## Snapshot

- **Checkout:** `/home/sincore/source/spindle`
- **Starting revision:** `d63e527fc49538f7d7586e7bada8ecf871a0680f`
- **Final revision:** `d63e527fc49538f7d7586e7bada8ecf871a0680f` (no commit authorized or created)
- **Tested snapshot:** the working tree at the revision above with the implementation and test changes listed below, plus the controller-owned issue execution/comments update. The fresh focused run completed before this report was created.
- **Starting dirty state:** only the controller-owned update to `.scratch/2026-10-31-blueprint-lifecycle/issues/01-migrate-skills-to-blueprint-lifecycle.md`; it was preserved and not edited by this worker.
- **Final dirty state:** controller-owned issue update, this report, and the implementation/test changes below. No index, branch, or HEAD changes were made.

## Criteria and changes

| Criterion                                                               | Change and evidence                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static TypeScript registry initially registers Skills only              | Added `src/blueprints/registry.ts`, shared handler typing in `src/blueprints/types.ts`, and `src/blueprints/skills/handler.ts`.                                                                                                                                                                                                             |
| Handler owns source, destination, metadata and lifecycle-specific rules | Skill handler declares its source under the colocated `src/blueprints/skills/` content, destination, `SKILL.md` metadata validation, and semver behavior. Shared discovery, install, rendering, conflict planning, and reconciliation are in `src/blueprints/lifecycle.ts`.                                                                 |
| Unified init/update and existing Skill lifecycle behavior               | `src/index.ts` and `src/update.ts` dispatch through the static registry. Existing overwrite/skip, new-Skill, warning, and version-aware lifecycle behavior remains covered by the focused suite.                                                                                                                                            |
| Handler and Markdown Blueprints together; no old-layout adapter         | Moved the Skill Markdown content from `src/stubs/skills/int-codebase-design/` to `src/blueprints/skills/int-codebase-design/`; removed the old `src/reconcile.ts` location and JSON Variable manifest. No old source-layout fallback was retained.                                                                                          |
| Explicit Config and shared typed Variables                              | Init passes its Config/context to the lifecycle. Update passes stored Config and resolves render context explicitly when needed. `src/variables.ts` now declares the shared Variable definitions as typed TypeScript values. CLI Config and Variable behavior remains covered in `init.test.ts`, `update.test.ts`, and `variables.test.ts`. |
| Nunjucks before gray-matter and kind-specific metadata                  | `src/version.ts` renders Markdown before `gray-matter` reads Skill version metadata. The Skill handler validates rendered `SKILL.md` frontmatter/version. A CLI update fixture verifies a templated version is rendered and parsed before reconciliation.                                                                                   |
| Nested text rendering and byte-preserving non-renderable files          | The CLI init fixture verifies selected-Stack conditionals, a Variable in nested Markdown and frontmatter, and exact binary bytes. Existing installer tests also pass.                                                                                                                                                                       |
| CLI-level fixture coverage                                              | Added the nested rendering/binary CLI init scenario and templated-version CLI update scenario; adapted fixture Blueprints and existing Config/lifecycle tests to the Blueprint source contract.                                                                                                                                             |

## Changed files

- `package.json` — authorized `files` metadata update from `src/stubs` to `src/blueprints`.
- `src/index.ts`
- `src/install.ts`
- `src/update.ts`
- `src/variables.ts`
- `src/version.ts`
- `src/reconcile.ts` — removed; lifecycle moved to `src/blueprints/lifecycle.ts`.
- `src/stubs/variables.json` — removed.
- `src/stubs/skills/int-codebase-design/DEEPENING.md` — moved to `src/blueprints/skills/int-codebase-design/DEEPENING.md`.
- `src/stubs/skills/int-codebase-design/DESIGN-IT-TWICE.md` — moved to `src/blueprints/skills/int-codebase-design/DESIGN-IT-TWICE.md`.
- `src/stubs/skills/int-codebase-design/SKILL.md` — moved to `src/blueprints/skills/int-codebase-design/SKILL.md`.
- `src/blueprints/lifecycle.ts`
- `src/blueprints/registry.ts`
- `src/blueprints/types.ts`
- `src/blueprints/skills/handler.ts`
- `tests/existing-repo.test.ts`
- `tests/init.test.ts`
- `tests/reconciliation.test.ts`
- `tests/update.test.ts`
- `tests/variables.test.ts`
- `.scratch/2026-10-31-blueprint-lifecycle/reports/01-implementation.md` (this report)

## Checks

Fresh approved focused command, run from the repository root:

```text
just test::test tests/init.test.ts tests/update.test.ts tests/variables.test.ts tests/reconciliation.test.ts tests/existing-repo.test.ts tests/install.test.ts tests/rendering.test.ts
```

Result: **60 passed, 0 failed, 0 skipped**, exit code 0.

The behavior-changing templated Skill version scenario was checked RED before implementation (CLI reported that the shipped Skill had no valid semver version), then GREEN after the implementation. The later fresh focused run also passed that test.

## Self-review and concerns

- **Packaging follow-up needed:** the authorized `package.json` `files` metadata now includes `src/blueprints`, and the runtime can locate this source directory from the compiled `build` location. However, the existing `build` script still runs `cp -R src/stubs/. build/stubs/`, while `src/stubs` was removed as part of this migration. That command now references a removed path. The controller explicitly did not authorize build-script changes, so I did not edit the script. Please authorize and make the narrow build-script migration before relying on the package build.
- The focused run did not exercise a package build or package contents.
- No dependencies or lockfiles were changed.
- No other self-review findings.

## Checks not run / controller gates

- Formatting, lint, type checking, and ticket-wide regression checks were not run; they remain with the controller as assigned.
- Package build / distribution inspection was not run and has the packaging follow-up described above.

## Hand-back

The Blueprint registry, shared lifecycle, Skill handler, typed shared Variables, rendered-frontmatter version handling, and focused CLI evidence are in the checkout. The authorized packaging metadata adjustment is included, but a separate controller-authorized build-script change remains necessary because the existing build recipe still copies the removed `src/stubs` path. No commit was made.

---

## Corrective round 1 — finding C1

**Round status:** DONE_WITH_CONCERNS  
**Finding:** `C1` — `package.json`'s build script copied from the removed `src/stubs` path.

### Correction

Changed only the `build` script's Blueprint asset copy paths in `package.json`:

```text
mkdir -p build/blueprints && cp -R src/blueprints/. build/blueprints/
```

The existing authorized `files` entry remains `src/blueprints`. No dependencies, versions, or other script/manifest fields were changed in this round.

### Fresh verification

Ran from `/home/sincore/source/spindle`:

```text
just test::test tests/init.test.ts tests/update.test.ts tests/variables.test.ts tests/reconciliation.test.ts tests/existing-repo.test.ts tests/install.test.ts tests/rendering.test.ts
```

Result: **60 passed, 0 failed, 0 skipped**, exit code 0.

### Build limitation

The assignment approves only Just recipes, and the project's tooling guidance provides no package-build Just recipe. The package build was not run; no underlying build command was invoked outside Just. The corrected copy source/destination are therefore unverified by an actual package build in this round.

### Round 1 snapshot and hand-back

- **Base/final revision:** `d63e527fc49538f7d7586e7bada8ecf871a0680f`; no commit, index, branch, or HEAD change.
- **Tested snapshot:** current shared working tree after the `package.json` build-script correction and the focused run above.
- **Dirty state:** existing ticket 01 implementation/test changes, controller-owned issue execution/comments update, this appended report, and the authorized `package.json` changes. All were preserved; no tracker edits were made.
- Finding C1 is corrected in the manifest. The package build itself remains unrun due to the lack of an approved Just recipe. Formatting, lint, type, and ticket-wide regression gates remain with the controller.

---

## Corrective round 2 — finding C2

**Round status:** DONE  
**Finding:** `C2` — production-content tests retained the removed `src/stubs/skills` source path and did not supply the typed required Variable.

### Correction and preserved coverage

Changed only `tests/stubs.test.ts` in this round (apart from this report append):

- Pointed `shippedSkills` at `src/blueprints/skills`.
- Updated the nonempty-source assertion message and production-init test description to use Blueprint terminology.
- Supplied `--var needed=production-test` to the real CLI production `init` invocation, as required by the typed Variable definitions.
- Preserved the nonempty shipped Skill metadata assertion, semver validation, exact directory and recursive file-set comparisons, and byte-for-byte assertions for every production Skill file. No production source or other test files were changed in this round.

### RED and fresh GREEN evidence

All commands ran from `/home/sincore/source/spindle` using approved Just recipes.

1. **RED:** `just test::test tests/stubs.test.ts` — 0 passed, 2 failed, exit code 1. Failures reproduced the empty shipped-content assertion and CLI error requiring `--var needed=<value>`.
2. **GREEN after final test edit:** `just test::test tests/stubs.test.ts` — **2 passed, 0 failed, 0 skipped**, exit code 0.
3. **Assigned full-suite GREEN after final test edit:** `just test::test` — **67 passed, 0 failed, 0 skipped**, exit code 0.

### Round 2 snapshot and self-review

- **Checkout:** `/home/sincore/source/spindle`.
- **Starting/final revision:** `d63e527fc49538f7d7586e7bada8ecf871a0680f`; no commits or index/branch/HEAD edits.
- **Starting dirty state:** prior ticket 01 source/test migration, package metadata and round 1 build-path correction, controller-owned issue execution/comments update, and existing report.
- **Final/tested snapshot:** all starting changes preserved, plus the narrow `tests/stubs.test.ts` correction above; the report append followed the successful test runs. No other changes were made by this worker in round 2.
- Self-review confirmed behavior assertions were not removed or weakened. C2 is addressed with fresh focused and full-suite evidence.

### Remaining controller checks

- The **controller-reported format check failure remains controller-owned**; no formatter, linter, or type-check gates were run in this round.
- Package build/distribution verification remains unrun as recorded in round 1; this round did not authorize a new build recipe.
- Full-suite success is evidence for this tested snapshot, not controller acceptance of ticket 01.

**Hand-back:** C2 corrected; focused production Blueprint tests pass 2/2 and the explicitly assigned full suite passes 67/67. No tracker edits or commit were made.

---

## Corrective round 3 — T01-R3, T01-S1, T01-S2

**Round status:** DONE

### Snapshot and scope

- **Checkout:** `/home/sincore/source/spindle`.
- **Starting/final revision:** `d63e527fc49538f7d7586e7bada8ecf871a0680f`; no commit, index, HEAD, or branch changes.
- Starting dirty state contained the ticket implementation, C1 package correction, C2 test migration, existing reports, and controller-owned issue execution/comments. These changes were preserved.
- The controller extended scope to remove the obsolete flag and Config expectation from `tests/existing-repo.test.ts`; its conflict/content/file-set assertions remain unchanged.
- **Files edited in round 3:** `src/variables.ts`, `src/version.ts`, `src/blueprints/types.ts`, `src/blueprints/lifecycle.ts`, `src/blueprints/skills/handler.ts`, `tests/init.test.ts`, `tests/variables.test.ts`, `tests/update.test.ts`, `tests/stubs.test.ts`, `tests/existing-repo.test.ts`, and this report append.
- **Exact tested snapshot:** the shared working tree at the revision above after those source/test edits, before this append. The final focused command below tested all six named files. No source/test edits followed that run.

### T01-R3 — unused required Variable breaks normal init

- Removed the test-only `needed` production Variable. Remaining shared product Variables, `owner` and `lint_command`, have defaults; no replacement required Variable was introduced.
- Removed injected `needed` flags and Config expectations from CLI fixtures, including production init. Production tests still assert valid shipped versions, identical recursive installed file sets, and byte-for-byte production content without unrelated flags.
- Preserved malformed/unknown Variable errors, missing/invalid Stack errors, repeated flags, default/override rendering, and conflict tests.
- Required-Variable prompt/error scenarios were artificial once no product Variable was required. Rather than introduce another required production value, changed these scenarios to verify shared defaults across changed Skills, unchanged Config, installation failure stopping later Skills, and no Config write when using defaults. The underlying required-Variable resolution logic in `src/index.ts` and `src/update.ts` was not changed.
- Added real CLI interactive-init characterization coverage: both product Variable prompts are shown, defaults are accepted, and Config plus generated content contain the expected values. Existing new-Skill/conflict/cancellation prompts remain covered.

**RED:** `just test::test tests/stubs.test.ts` after removing the artificial production-init flag: 1 passed, 1 failed, exit 1. The failure named the missing `needed` Variable.

**GREEN:** after removing the definition and adapting fixtures, the six-file focused command passed 56/56; the final expanded focused run passed 58/58, including default production init and the interactive product-Variable prompt test.

### T01-S1 — Skill semver imposed on every handler

- Removed mandatory `metadataFile`, version readers, template detection, validity checks, and comparison callbacks from the universal handler contract.
- Added a small optional `planUpdate` policy returning a common lifecycle decision. Metadata validation is also optional. Handlers without a policy use common new/conflict decisions; no future content kind or registry entry was added.
- Moved shipped Skill validation, installed Skill warning/version comparison, `SKILL.md` naming, and semver-specific messages into `src/blueprints/skills/handler.ts`.
- Shared lifecycle retains discovery, conflict decisions, context resolution, recursive installation, and outcomes; it no longer assumes semver or `SKILL.md`.

This was a behavior-preserving separation backed by the existing passing Skill lifecycle tests rather than a fabricated RED. Fresh post-refactor CLI/reconciliation runs cover newer/equal/older versions, missing/non-semver installed metadata, invalid shipped versions, new-Skill selection, overwrite/skip decisions, and warnings. Final focused result: 58/58 passed.

### T01-S2 — unrelated templated frontmatter resolves context prematurely

- Template detection now inspects only the actual `version` value parsed by gray-matter. For an unquoted Nunjucks expression interpreted by YAML as a mapping, it examines template syntax only in the raw top-level version field supplied by gray-matter. It does not scan unrelated metadata.
- Static version reads do not render unrelated description/body templates, even when a context is already available. Templated versions continue to render before their version metadata is interpreted.
- Detection requests an uncached gray-matter parse because its cached clone omits the non-enumerable raw metadata field; the first intermediate GREEN attempt exposed that issue and it was corrected before the successful reruns.
- Added CLI regression `static Skill versions ignore unrelated templated metadata during no-op update`, with an undefined description Variable on both a current and an unselected new Skill. It verifies successful no-op status, unchanged installed content/Config, and no new installation.

**RED:** `just test::test --test-name-pattern='static Skill versions ignore unrelated templated metadata' tests/update.test.ts`: 0 passed, 1 failed, exit 1, reporting undefined output from the unrelated description.

**GREEN:** `just test::test --test-name-pattern='static Skill versions ignore unrelated templated metadata|update reads a templated Skill version' tests/update.test.ts`: 2 passed, 0 failed, exit 0. Both also pass in the final focused run.

### Final fresh verification

Working directory: `/home/sincore/source/spindle`.

```text
just test::test tests/init.test.ts tests/variables.test.ts tests/update.test.ts tests/stubs.test.ts tests/reconciliation.test.ts tests/existing-repo.test.ts
```

Result: **58 passed, 0 failed, 0 skipped**, exit code 0.

### Self-review, unrun checks, and hand-back

- Self-review confirmed no `needed` references remain in production definitions or the scoped CLI fixtures. No unrelated source, package, tracker, or review-report changes were made in round 3.
- C1's package path correction and C2's Blueprint source-path/byte-preservation assertions are retained; only C2's unintended required-Variable workaround was removed under T01-R3.
- Formatting (including the controller-reported format failure), lint, type, ticket-wide regression, and package-build/distribution checks remain with the controller and were not run in this round. The prior 67/67 full-suite result is historical, not a claim about the round 3 snapshot.
- T01-R3, T01-S1, and T01-S2 are addressed with the evidence above. No remaining round 3 self-review finding. This hand-back does not constitute controller acceptance of ticket 01.
