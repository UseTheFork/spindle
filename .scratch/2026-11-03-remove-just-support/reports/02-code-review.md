# Code Review — Ticket 02: Retire Just Blueprint kind

## Strengths

- `src/blueprints/catalog.ts` now recognizes only `agents`, `instructions`, and `skills`; its Just-only path validation and output-name handling are removed. Former catalog keys fall through the generic unknown-kind path.
- `src/blueprints/registry.ts` registers only the remaining three handlers. The Just handler and four shipped Just recipe assets are deleted.
- The `package.json` build script removes only stale generated `build/blueprints/just.ts`, `build/blueprints/just.js`, and `build/blueprints/just/` outputs before copying current assets. This addresses prior finding `T02-INT-1` without broad cleanup.
- `docs/blueprints.md` and ADR-0001/0003 remove Just Blueprint product decisions while retaining unrelated lifecycle, catalog, and reconciliation material. The root developer `justfile` and `.github/scripts/just-modules/` are unchanged.
- Controller-reported changed-file formatting, lint, type checks, and 148 regression tests passed on this fixed snapshot. The test edits remove retired-feature fixtures/assertions while retaining non-Just CLI and Blueprint coverage.

## Issues

### Critical

None.

### Important

- `src/blueprints/skills/int-subagent-driven-dev/SKILL.md:113` — This active, shipped skill still says “The CLI retains its global Just prerequisite, including for help, so `just` must be installed and on `PATH`.” That claim is now false and contradicts the core requirement that Spindle commands run without Just. It can cause users to install an unnecessary dependency or avoid using the CLI. Remove the obsolete prerequisite claim and retain only accurate guidance about invoking workflow commands.

### Minor

None.

## Recommendations

- When an approved package-build recipe is available, run it against a disposable or otherwise safe build output and verify the stale generated Just files/directories are absent. No approved root build recipe was available for this review, so this is optional follow-up verification rather than a code finding.

## Checks

- **Reviewed snapshot:** `HEAD` `567d6780223b295cd986ff80f4622f9d760cfcac` plus the assigned uncommitted and untracked changes. The status and changed paths matched the supplied snapshot description; no additional changes were observed.
- **Coverage:** Reviewed the requirements and ticket comments; production diffs for catalog parsing, registry, and package cleanup; shipped catalog; documentation and ADR diffs; deletions and representative test/fixture changes; the remaining Just references in source/docs/tests; and the prior scoped review for `T02-INT-1`.
- **Controller-reported checks inspected:** `just format::check` on the retained changed files, `just lint::check`, `just test::types`, and the listed regression tests (148/148) passed. `just tool::git diff --check` and the check that `justfile` and `.github/scripts/just-modules` have no diff passed. These results were supplied by the controller; exact command lines for the first four checks are not reproduced here.
- **Reviewer-run checks:** `git diff --check` passed; `git diff --exit-code -- justfile .github/scripts/just-modules` passed. No test, build, formatter, linter, or type-check command was run by this reviewer.
- **Limitations:** No approved root build recipe exists in the supplied tooling guidance. The ignored `build/` tree was not regenerated; package-build cleanup behavior therefore has not been freshly exercised. The spec prohibits tests of retired Just behavior, so the generic unknown-kind behavior was assessed by code inspection rather than a new former-`just` test.
- **Repository state:** Review was read-only except for this assigned report. Implementation files, index, `HEAD`, branches, and execution states were not changed.

## Declined to judge

- Existing project Just Module files and root `justfile` imports are explicitly unmanaged and must remain untouched. Their runtime behavior or migration is outside this ticket; the relevant implementation and test changes do not claim to migrate them.
- The repository's own Just developer workflow is explicitly retained and outside the product removal. Its unchanged paths were checked for diffs, but its behavior was not re-evaluated.
- Retired Just behavior (including a former `just` catalog key and the removed prerequisite) is explicitly not to be tested or replaced with new tests. The generic validation path was inspected statically instead.

## Assessment

**Ready to merge? No.** The catalog/handler removal and targeted generated-output cleanup align with the stated requirements, and the reported checks cover the supplied snapshot. Fix the Important stale prerequisite statement in the shipped `int-subagent-driven-dev` skill, then obtain a scoped re-review. The package build was not exercised because no approved recipe is available; this limitation is recorded above.
