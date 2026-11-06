# Ticket 03 code review

## Strengths

- Setup and SDD are separate `Service` subclasses in their own command folders (`src/commands/setup-project/setup-project-command.ts:19` and `src/commands/sdd-workspace/sdd-workspace-command.ts:33`). `src/cli.ts:153-160,205-206` resolves them through `App.get()` before running and printing their existing result shapes.
- The setup command retains the explicit target path and its previous validation, file-preservation, and copy behavior. SDD retains its explicit checkout/report inputs and path validation. The extracted `isPathInside` helper (`src/utilities/is-path-inside.ts:3`) preserves the previous predicate as a focused standalone utility.
- CLI bootstrap behavior is consistent with the requirements: `src/index.ts:31-34` skips Git discovery for informational requests and requires discovery otherwise; `src/cli.ts:84-91` rejects a missing root rather than falling back. Production `process.cwd()` usage is confined to the executable bootstrap at `src/index.ts:43`.
- Tests cover explicit setup and SDD paths distinct from the invocation repository (`tests/setup-project.test.ts:71-86`, `tests/sdd-workspace.test.ts:105-116`) and discovery failure before either explicit path is used (`tests/git-root.test.ts:112-153`). Documentation describes the mandatory discovery and preserved explicit-path semantics (`docs/blueprints.md:5-16`, `docs/agents/tooling.md:44-47`).
- No production imports of the deleted `setupProject` or `resolveWorkspace` exports remain. The catalog expectation updates are limited to the authorized test files; the 15 expected Agent names and installed count match the 15 entries in `src/blueprints/catalog.ts:22-58`, without weakening the exact-list assertions.

## Issues

### Critical

None.

### Important

None.

### Minor

- **REV-03-01 — `tests/git-root.test.ts:156-167`; helper behavior at `tests/helpers.ts:29-36`.** The test named “help and version work outside Git” calls `runCli`, which invokes `ensureGitWorkspace(project)` and initializes a Git worktree before starting the CLI. Consequently, it checks that help/version work when Git is absent from the child process `PATH`, but does not check the separate outside-a-worktree condition claimed by the test and required by the spec. This leaves a small regression-coverage gap, not an observed runtime defect: `src/index.ts:31-34` visibly bypasses discovery for these requests. Use the already imported `runCliRaw` helper for this case so the temporary directory remains outside Git.

## Recommendations

No additional recommendations beyond the test correction in REV-03-01.

## Checks

- **Snapshot inspected:** base/HEAD `a65c33bfb13fe1d374e6114d5aad9ef261331536`; the supplied review package identifies the reviewed dirty snapshot as `a30f751b505be4f6b3b7b5475aeb670a63897abb461e23a3c76b393d2a13e28b`. I confirmed the supplied hashes for every listed modified/new implementation, documentation, and test file; the two listed workflow modules are deleted. The controller-owned issue marker and `.scratch` inputs/reports are excluded from the reviewed code changes.
- **Coverage inspected:** the complete manifest inventory and tracked diff, all three new source files, both deleted modules, the changed setup/SDD/root-discovery/catalog tests, dispatch/bootstrap and App context, catalog entries, documentation, and the required ticket/spec/guidance/implementation evidence.
- **Controller-supplied verification** (not rerun by this reviewer): format check and lint check passed for ticket 03 files; `just test::types` passed; focused setup/SDD/root/packaged tests passed (25); catalog/stubs tests passed (20); `just build` passed after the final production-code edit; and `just test::test` passed (196 tests, 0 failures) after the authorized catalog expectation updates. The build preceded only those test-only expectation changes.
- **Reviewer-run checks:** none. No reviewed checkout files were changed; the review report is the only file written by this review.
- **Limitations:** verification results are controller-supplied rather than independently rerun. The outside-Git informational-command case is evident in the bootstrap control flow but is not actually exercised by the test named above.

## Declined to judge

None. No considered behavior was set aside as outside the ticket scope.

## Assessment

**Ready to merge? Yes.** No Critical or Important findings remain, and there are no unresolved declined-behavior decisions. The supplied checks cover the reviewed snapshot. REV-03-01 is a Minor coverage correction; it does not indicate a production defect or block readiness.
