# Ticket 04 Code Review

## Strengths

- `src/blueprints/lifecycle.ts` coordinates catalog expansion, update decisions,
  rendered-file preparation, Config content, and staged Just changes before
  application. Removal targets are validated before application as well.
- The preparation-failure CLI tests in `tests/coordinated-preparation.test.ts`
  assert unchanged Config/import bytes, planned content, deletion targets, and
  outside-root sentinels. They cover both update and init.
- The new CLI tests cover application failures in Config writes, Agent writes,
  and removals, checking unsuccessful status, completed prior operations, and
  that rollback is not claimed. The mixed-success test checks exact outputs,
  cleanup, Just imports, outside-root preservation, and repeat-run behavior.
- `tests/packaged-cli.test.ts` exercises init and update outside the checkout
  using the bundled catalog and assets, verifies source-tree absence, and checks
  managed import names and recursive asset bytes.
- The glossary, authoring guidance, and proposed ADR explain authoritative
  directory membership, preparation/application boundaries, and packaged asset
  location. ADR-0003 remains proposed, preserving the approval boundary.

## Issues

### Critical

None.

### Important

- `src/blueprints/lifecycle.ts:502-510` — A selected Skill directory is applied
  file-by-file by `installPlannedBlueprintFiles`, but the code records only one
  completed-change entry after the entire call succeeds. If a later supporting
  file fails after an earlier file was written (or the Skill target was removed
  for replacement), the command reports the failed Skill but omits the newly
  applied files within that operation. This hides partial application progress,
  contrary to the required diagnostics. Record successful files as they are
  applied and identify the specific file whose application failed; add a real-CLI
  test that fails on a later Skill file and checks the partial-state diagnostic.

### Minor

None.

## Recommendations

None beyond the required fix above.

## Checks

- **Reviewed snapshot:** checkout `/home/sincore/source/spindle`, base and head
  `518a80414bcf32f3289f49785be9b18319c9b7f7`, plus the frozen uncommitted and
  untracked ticket 04 snapshot. The corrected frozen patch at
  `/home/sincore/.copilot/session-state/f792d69f-b5d3-4f08-8672-cff883b3dc10/files/ticket04-reviewed-snapshot.patch`
  was accessible. Supplied SHA-256 values for the listed implementation and
  test files matched. The worktree paths inspected were consistent with the
  assigned patch; no source files were changed during review.
- **Coverage:** inspected the ticket, specification, design, implementation
  report, complete frozen patch, changed lifecycle and Just handlers, package
  configuration, update flow, catalog mapping, relevant CLI tests, and related
  guidance/glossary/ADR. Prior tickets 01/02/03 were treated as integrated
  dependencies, as assigned, rather than independently reviewed.
- **Reviewer-run check:** `git diff --check HEAD` passed (exit 0).
- **Controller-reported checks inspected, not rerun:** `just test::test`
  (195/195), `just test::types`, scoped format/lint checks, focused packaged CLI
  tests (4/4), and the build report. Their reported exact snapshot is the
  assigned frozen worktree snapshot. I did not rerun the test suite or build.
- **Limitations:** the application-failure tests inspect completed operations
  across boundaries, but do not test a failure after partial writes within one
  multi-file Skill operation; this is the Important finding above. Findings are
  review recommendations, not controller acceptance decisions. A separate
  untracked `reports/04-task-review.md` appeared in final worktree status; it was
  not part of the assigned frozen patch and was not reviewed here.

## Declined to judge

None. No in-spec behavior was set aside as outside scope. Dependency behavior
from tickets 01/02/03 was not re-reviewed, per the assignment.

## Assessment

**Ready to merge? With fixes.** Fix the Important partial-progress diagnostic
gap and add the specified real-CLI regression test before merge.
