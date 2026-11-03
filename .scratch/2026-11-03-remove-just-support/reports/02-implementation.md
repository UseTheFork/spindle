# Ticket 02 Implementation Report

**Status:** DONE_WITH_CONCERNS

## Snapshot

- **Checkout:** `/home/sincore/source/spindle`
- **Starting revision:** `567d6780223b295cd986ff80f4622f9d760cfcac`
- **Final revision:** `567d6780223b295cd986ff80f4622f9d760cfcac` (no commit authorized)
- **Exact tested snapshot:** the starting `HEAD` plus the final catalog, registry, source, test, and documentation changes described below. The final passing suite ran after all implementation changes. The only subsequent filesystem cleanup removed the empty `src/blueprints/just` directory; the report itself was created after verification.
- **Controller-owned change preserved:** `.scratch/2026-11-03-remove-just-support/issues/02-retire-just-blueprint-kind.md` was already modified by the controller's execution/comment update. I did not edit it.
- **Final dirty/untracked changes:** the controller-owned issue update; this ticket's source, test, and documentation changes; and this new report. No commit was made. Existing generated `build/` output is ignored and was not regenerated.

## Criteria and changes

1. **Catalog, lifecycle, sources, and assets**
   - Removed `"just"` from `CatalogKind`, the catalog kind list, shipped catalog, and handler registry. Removed the Just-specific path pattern, validation message, output-name compatibility logic, handler implementation, and four shipped `.just` Blueprint files.
   - The generic input-key check remains first in catalog parsing; a `just` key now reaches the ordinary `Unknown Blueprint Catalog kind '<key>'.` diagnostic. No Just-specific compatibility branch remains.
   - Package inputs under `src/blueprints` no longer contain the retired handler or `.just` assets. The checkout has no build recipe in the supplied tooling guidance, so generated `build/` output was not regenerated.

2. **Tests and fixtures**
   - Removed Just Module, import-reconciliation, and Just-prerequisite product assertions and Just-only catalog fixtures. Removed the fake Just executable fixture; retained tests use a generic PATH-prefix fixture.
   - Preserved non-Just assertions, including catalog selection, transactional preparation, cross-kind removals, CLI workflows, and other Blueprint kinds. The existing preparation tests now exercise a non-Just Agent source failure.
   - Added no tests asserting retired behavior, unmanaged project files/imports, or a replacement for removed Just behavior.

3. **Documentation**
   - Updated `docs/blueprints.md` to document the three remaining catalog kinds and remove Just Module behavior.
   - Removed Just product decisions from ADR-0001 and ADR-0003 while preserving unrelated lifecycle, catalog, and reconciliation decisions. ADR-0002 had no Just-specific material to remove.
   - Left repository developer Just guidance, the root `justfile`, and `.github/scripts/just-modules/` untouched.

## Verification

Fresh final command, run from the repository root through the approved Just recipe:

```text
just test::test tests/catalog.test.ts tests/init.test.ts tests/update.test.ts tests/coordinated-preparation.test.ts tests/removals.test.ts tests/packaged-cli.test.ts tests/agents.test.ts tests/instructions.test.ts tests/directory-membership.test.ts tests/existing-repo.test.ts tests/variables.test.ts tests/stubs.test.ts tests/sdd-workspace.test.ts tests/setup-project.test.ts
```

**Result:** exit 0; 148 passed, 0 failed.

Additional fresh checks:

- `git diff --check` — exit 0.
- `git diff --exit-code -- justfile .github/scripts/just-modules` — exit 0; developer Just workflow has no diff.
- Searches of the changed catalog, handler registry, tests, current Blueprint documentation, and ADRs found no remaining Just Module or `.just` product references.

## Concerns and pending checks

- No direct test was added or run with a former `just` catalog key, as explicitly prohibited. The generic unknown-kind path was verified by code review of the unchanged generic key-validation loop and the reduced `catalogKinds` list.
- Existing ignored generated `build/` output may contain artifacts from an earlier build. It was not regenerated because the supplied tooling guidance defines no build recipe in this checkout. A fresh package build should be performed by the controller if needed.
- Formatting, lint, type checks, and ticket-wide regression checks were not run; they are pending with the controller and are not implementer failures.

## Changed files

- `src/blueprints/catalog.ts`, `src/blueprints/catalog.yaml`, `src/blueprints/registry.ts`
- Deleted `src/blueprints/just.ts` and `src/blueprints/just/{format,lint,test,tool}.just`
- Updated tests: `agents.test.ts`, `catalog.test.ts`, `coordinated-preparation.test.ts`, `directory-membership.test.ts`, `existing-repo.test.ts`, `helpers.ts`, `init.test.ts`, `instructions.test.ts`, `packaged-cli.test.ts`, `removals.test.ts`, `sdd-workspace.test.ts`, `setup-project.test.ts`, `stubs.test.ts`, `update.test.ts`, `variables.test.ts`
- Updated `docs/blueprints.md`, `docs/adr/0001-blueprint-lifecycle.md`, and `docs/adr/0003-catalog-selected-blueprints.md`

## Hand-back

Ticket 02's source catalog and registered Blueprints now include only Agents, Instructions, and Skills. Retired Just product tests and assets are removed; unrelated regression coverage and repository developer Just tooling are preserved. No commit was created. Controller-owned mechanical and ticket-wide checks remain pending.

## Corrective round 1 — `T02-INT-1`

**Status:** DONE_WITH_CONCERNS

- **Finding correction:** Updated only `package.json`'s `build` script to remove `build/blueprints/just.ts`, `build/blueprints/just.js`, and `build/blueprints/just/` after TypeScript compilation and before the existing blueprint source copy. No broad build cleanup, test, or developer Just workflow change was added.
- **Starting/final revision:** `567d6780223b295cd986ff80f4622f9d760cfcac` for both; no commit was authorized.
- **Starting snapshot:** The ticket-02 source, test, documentation, and controller-owned issue changes listed above were already dirty; the original implementation report was untracked. `package.json` had no starting diff. Ignored `build/` contained all six stale outputs named by the finding.
- **Final dirty/untracked changes:** All starting changes were preserved; `package.json` now contains the corrective build cleanup, and this report has this appended addendum. The ignored build outputs were left in place.
- **Exact checked snapshot:** Starting `HEAD` plus the pre-existing ticket-02 changes, the `package.json` build-script edit, and this report addendum. No package build or project tests ran.
- **Verification:** `node -e "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8'))"` and `git diff --check` both exited 0. Reviewed `git diff -- package.json`; cleanup names and ordering are exactly as specified. `find build/blueprints/just -maxdepth 1 -type f -print | sort` and `ls -ld build/blueprints/just.ts build/blueprints/just.js` confirmed the ignored outputs remain untouched.
- **Tests/build:** No test was added or run, as required by the spec and ruling. A package build was not run: `docs/agents/tooling.md` has no usable root build recipe, and direct `pnpm` invocation is prohibited.
- **Self-review/concerns:** The change is limited to the specified three paths and precedes source copying. Runtime package-build behavior has not been freshly exercised; the static inspection is the available implementer evidence.
- **Pending controller checks:** Formatting, lint, type checks, and ticket-wide tests remain with the controller. No commit was made.

**Corrective hand-back:** `T02-INT-1` is addressed in the package build script. Static validation passed; package build verification remains unavailable under the supplied tooling rules.

## Corrective round 2 — `C02-1`

**Status:** DONE_WITH_CONCERNS

- **Finding correction:** Removed only the false sentence claiming a global Just prerequisite from `src/blueprints/skills/int-subagent-driven-dev/SKILL.md`. Retained the accurate direction to invoke Spindle workflow commands directly, and left all other skill guidance, including repository developer Just workflow instructions, unchanged.
- **Starting/final revision:** `567d6780223b295cd986ff80f4622f9d760cfcac` for both; no commit was authorized or created.
- **Starting snapshot:** The existing ticket-02 source, test, documentation, package, issue, and report changes described above were already present. The assigned skill had no prior diff. Controller-owned ticket comments and the controller-owned issue update were preserved.
- **Final dirty/untracked changes:** All pre-existing changes were preserved. This corrective round changes only the assigned shipped skill and appends this report section. No other paths were changed by this round.
- **Exact checked snapshot:** Starting `HEAD` plus the pre-existing ticket-02 dirty/untracked changes and the one-sentence skill edit. The baseline scenario was reported by the controller as run before editing and failed by requiring Just installation. No fresh post-edit behavior scenario or project test was run by this worker; the controller owns the fresh scenario retest.
- **Self-review:** `git diff -- src/blueprints/skills/int-subagent-driven-dev/SKILL.md` showed only the obsolete prerequisite sentence removed. A fresh read and search confirmed the direct-invocation sentence remains and the false global-prerequisite wording is absent. Repository Just developer workflow guidance remains outside the edited sentence and unchanged.
- **Fresh inspection commands/results:** `git rev-parse HEAD && git status --short` confirmed the starting revision and supplied dirty/untracked snapshot. `git diff -- src/blueprints/skills/int-subagent-driven-dev/SKILL.md && git status --short` showed the single-line target diff and expected worktree paths. `rg -n 'Spindle workflow commands are invoked directly|global Just prerequisite|just must be installed|repository.*Just|Just-based developer' src/blueprints/skills/int-subagent-driven-dev/SKILL.md` found the retained direct-invocation instruction and no obsolete prerequisite claim. These are snapshot/content inspections, not behavior-test evidence.
- **Tests and checks:** No behavior test was authorized for this worker. The fresh frozen-scenario retest is pending with the controller; no GREEN result is claimed. Formatting, lint, type checks, and ticket-wide regression checks were not run and remain pending with the controller. No commit was made.
- **Remaining concern:** Until the controller runs the same frozen scenario against the edited skill, post-edit behavior remains unverified. Controller-owned mechanical and regression checks also remain pending; these are not implementer failures or evidence of ticket acceptance.

**Corrective hand-back:** `C02-1` is addressed by deleting only the false Just-prerequisite claim and preserving direct CLI invocation and repository developer workflow guidance. The controller must run the fresh scenario and its scheduled mechanical/regression checks.
