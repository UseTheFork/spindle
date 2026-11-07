# Ticket 03 implementation report — Migrate SDD and project setup to Commander

## Status

**DONE_WITH_CONCERNS** — the SDD workspace and setup-project commands are
registered through Commander, and the final assigned focused regression set
passes. Test-first evidence was established for SDD group short help, but not
separately for every behavior added or expectation adapted during migration.

## Checkout and snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `1c51cccfae11981a0abd269946e4ba4d097f9c4b`
- Final revision: `1c51cccfae11981a0abd269946e4ba4d097f9c4b`; no commit or
  staging was performed.
- At start, the only dirty file was the controller's ticket 03 execution
  update in `.scratch/2026-11-06-commander-cli/issues/03-commander-workflow-commands.md`.
  It was preserved. No other pre-existing untracked changes were present.
- At hand-back, that controller-owned issue file remains dirty, along with
  this implementation in the six source/test files below and this report.
  No other untracked changes were present.
- The final combined test command passed on the unchanged HEAD above with these
  implementation file hashes. The SDD workspace command hash reflects the
  subsequent controller formatting pass; all checks below passed on these
  exact source hashes:

  ```text
  a8a204e8cf2ceced788deb2dd547fa320c8189d13f488731317544b179df0636  src/cli.ts
  1321753ec8516af577498eccffa4d60caee546e09f1a61e3ea463f4cdd02ebba  src/index.ts
  29ea4c43012b48285db0a90a236c86d4341829faf651f01d2382b57cf57fb5f7  src/commands/sdd-workspace/sdd-workspace-command.ts
  c9a9a7e77afe00741a9ea15763e71338450682b386b6300f009b60d6ca0a4ed4  src/commands/setup-project/setup-project-command.ts
  8dc5980836b7679156af00e9016efbe35220c0b65137186c2d53f31bed25a4a9  tests/sdd-workspace.test.ts
  5c6260dbc689f9787d205fa33cf0d2ca1bf2e9e36517c66d27b25ffe27d1f13b  tests/setup-project.test.ts
  273686fc15e2fe8066b6fd79c1f264ae658d208a0c3b2f4fa75a35d9cd8b3dbd  tests/git-root.test.ts
  ```

  This identifies the tested implementation snapshot. The report was written
  after that test run.

## Criteria, changes, and evidence

| Criterion | Change and evidence |
| --- | --- |
| Executable classes own Commander declarations; SDD remains a group | Added `SddWorkspaceCommand.register` and `SetupProjectCommand.register` with each command's description, options, action, and positional-argument policy. The central CLI creates the `sdd` grouping route and delegates workspace declaration to its class. |
| SDD required/optional options, validation, and duplicate rejection | Commander declares required `--workspace`, `--reports-dir`, `--ticket`, and optional `--round`. Existing path, ticket, and round validation is retained and run before application creation; option parsers retain duplicate-option errors. Existing CLI tests exercise valid results and invalid values, missing values, duplicates, unknown/inapplicable options, and positionals. |
| Setup-project option validation and duplicate rejection | Commander declares required `--workspace`; an absolute-path validation occurs before application creation, while the unchanged service `run` performs filesystem validation and setup. Duplicate options and extra positionals are rejected. Existing workflow tests verify creation, preservation, partial failures, target paths, and JSON output. |
| Generated help and preserved workflow behavior | Removed handwritten SDD/setup help and parsing from `src/cli.ts`; Commander generates root, SDD-group, and command help, including `-h` and help command routes. Subprocess tests cover generated help. Existing output-shape/order, side-effect, and workflow-failure tests pass. |
| Explicit targets remain distinct from invocation root; lifecycle and run APIs remain intact | The Commander actions resolve services with `createApp().get(...)` only after parsing and input validation. The service `run` signatures and workflow implementations remain Commander-independent. Existing subprocess tests confirm explicit SDD checkout and setup target behavior distinct from invocation repository. |
| CLI test seam and transition behavior | Reused `tests/sdd-workspace.test.ts`, `tests/setup-project.test.ts`, and `tests/git-root.test.ts`, plus init/update/computed-variable regression tests. All passed in the final combined run. |

### Test-first evidence and deviation

- Added the focused `sdd -h` subprocess test before implementing these
  declarations. RED: `just test::test tests/sdd-workspace.test.ts` exited 1
  because the handwritten router rejected `-h`. After migration, the same
  focused test passed.
- Subsequent focused runs exposed existing assertions coupled to handwritten
  help/error behavior. Those assertions were updated to cover generated
  Commander help and nonempty CLI errors without pinning incidental layout.
- The additional outside-Git help and malformed-argument-precedence cases were
  added after the main migration; they were run as passing regression checks,
  not against the pre-migration implementation for historical RED evidence.

### Direct-service coverage

I searched the test sources for `SddWorkspaceCommand` and
`SetupProjectCommand` references and found no direct `run` tests. The
controller clarified that the current SDD/setup CLI integration suites are
the confirmed primary seam and that no direct-service tests should be added
for this ticket. This is recorded as a pre-existing direct-service coverage
gap, not a blocker. Both `run` interfaces were retained.

## Changed files

- `src/commands/sdd-workspace/sdd-workspace-command.ts`
- `src/commands/setup-project/setup-project-command.ts`
- `src/cli.ts`
- `src/index.ts`
- `tests/sdd-workspace.test.ts`
- `tests/setup-project.test.ts`
- `tests/git-root.test.ts`
- `.scratch/2026-11-06-commander-cli/reports/03-implementation.md` (this report)

The controller-owned issue-history file was preserved and not edited by this
worker. No init or update implementation/tests were changed.

## Fresh checks and results

Run through the approved Just recipe from `/home/sincore/source/spindle`:

- `just format::check src/commands/sdd-workspace/sdd-workspace-command.ts src/commands/setup-project/setup-project-command.ts src/cli.ts src/index.ts tests/sdd-workspace.test.ts tests/setup-project.test.ts tests/git-root.test.ts`
  — **passed**.
- `just lint::check` on the same seven files — **passed**.
- `just test::types` — **passed**.
- `just test::test tests/sdd-workspace.test.ts tests/setup-project.test.ts tests/git-root.test.ts tests/init.test.ts tests/update.test.ts tests/computed-variables.test.ts`
  — **passed**, 81 tests, 0 failures.
- `just tool::git diff --check` — **passed**.

These checks apply to the implementation snapshot identified by the hashes
above. The full suite, packaged executable, and build were not run.

## Self-review, concerns, and pending controller checks

- Service `run` methods remain independent of Commander and application-owned
  service resolution remains inside the actions.
- The handwritten parser/help for SDD and setup-project was removed from the
  central CLI. Git-root discovery remains lazy behind valid workspace actions,
  allowing help and argument errors outside Git.
- No directly related help documentation was found to require correction.
- No commit was authorized or created.
- The full suite, packaged executable, and build remain unverified.

## Hand-back

Ticket 03 implementation is ready for controller review. The SDD workspace
and setup-project CLI declarations are owned by their service classes; their
existing explicit-target workflows and Commander-independent `run` methods
remain intact. The assigned combined focused test set passed. Report:
`.scratch/2026-11-06-commander-cli/reports/03-implementation.md`.

## Corrective round 1 — CS-01

**Status: DONE_WITH_CONCERNS.** The assigned code-slop finding is fixed and
the focused repeated-option regression tests pass. PKG-01 remains a
controller-owned verification gate; this report does not claim that build or
packaged CLI checks passed.

- **Finding:** CS-01 identified duplicate `once(option)` callback factories
  and identical duplicate-option errors in the SDD workspace and setup-project
  command modules.
- **Correction:** Moved the callback factory unchanged to
  `src/commands/shared-options.ts`, exported it as `once`, and imported it
  from both command modules. The single-use state, returned value, and exact
  error text (`Option '<option>' may only be provided once.`) remain
  unchanged. No test, service interface, validation, or workflow code was
  changed.
- **Test approach:** Pure refactor. The existing source CLI suites were
  established as a passing baseline before editing; no RED phase was
  appropriate. Both pre- and post-refactor runs exercised SDD repeated-option
  rejection and setup-project duplicate `--workspace` rejection.
- **Fresh covering evidence:** From `/home/sincore/source/spindle`,
  `just test::test tests/sdd-workspace.test.ts tests/setup-project.test.ts`
  passed both before and after the extraction: 16 tests passed, 0 failed on
  each run. After the change, `just tool::git diff --check` also passed.
- **Snapshot:** Starting and final revision are both
  `1c51cccfae11981a0abd269946e4ba4d097f9c4b`; no commit or staging was
  performed. The controller-confirmed starting tracked diff SHA-256 was
  `10e8fb692a25c3fa331a9404a513eb647c8f32376a1e108b54b2022d09b20f45`.
  The final tracked diff SHA-256 is
  `6623c49c727d3bbba42b93b7cb08af55714d24f222e63a38840b427f34ddbfa2`.
  Existing dirty controller/source/test changes were preserved. The four
  pre-existing untracked review/implementation reports were preserved; only
  this assigned implementation report was appended.
- **Changed files for this correction:** `src/commands/shared-options.ts`,
  `src/commands/sdd-workspace/sdd-workspace-command.ts`, and
  `src/commands/setup-project/setup-project-command.ts`. Tests were not
  changed. The assigned report was updated with this section.
- **Exact tested content hashes:**

  ```text
  981ee904f14babb47f1ec6e5db1ac30dbf80bdb0e7036b6d0244e4d9492efcdd  src/commands/shared-options.ts
  f73aebade005f77d5edb5d3ec5db318ea1fc03efbcd40c3136d3c1727392955b  src/commands/sdd-workspace/sdd-workspace-command.ts
  e5316614086299fa9e59ffcc2d15bddcf5486d036ef25be63bce7f246fdf6ffc  src/commands/setup-project/setup-project-command.ts
  8dc5980836b7679156af00e9016efbe35220c0b65137186c2d53f31bed25a4a9  tests/sdd-workspace.test.ts
  5c6260dbc689f9787d205fa33cf0d2ca1bf2e9e36517c66d27b25ffe27d1f13b  tests/setup-project.test.ts
  ```

- **Checks not run:** Formatting, lint, type checks, broader ticket regression,
  build, and packaged executable tests were not run by this worker. Per
  assignment, the controller owns the broader checks and specifically will run
  `just build` followed by
  `just test::test tests/packaged-cli.test.ts` for PKG-01.
- **Self-review:** Both registrations now use the same exported callback
  factory; the behavioral tests pass unchanged. No concerns remain for CS-01.
  PKG-01 is pending controller verification, not an implementation failure.

**Corrective hand-back:** CS-01 is addressed with passing pre/post focused
regressions. Controller checks, especially the build and packaged CLI test,
remain pending. No commit was authorized or created.

## Corrective round 2 — PKG-01 and PKG-02

**Status: DONE_WITH_CONCERNS.** The stale packaged CLI assertions are corrected,
and the assigned packaged CLI test command passes 5/5. The controller must
rerun the build and required checks on this final test snapshot; this worker
did not rebuild the package.

- **Finding CS-01:** Verified the prior round's fix is present: both
  `SddWorkspaceCommand` and `SetupProjectCommand` import and use the shared
  `once` callback from `src/commands/shared-options.ts`. No source changes
  were needed.
- **Findings PKG-01 and PKG-02:** Updated root help checks to assert that the
  generated root help lists `sdd` and `setup-project`; nested help checks now
  assert command and option presence without pinning generated usage layout.
  Malformed-input checks require nonzero status, empty stdout, nonempty
  stderr, no Git-root error, and no setup/Git side effects, without requiring
  Commander's errors to use a `spindle:` prefix. Removed
  `setup-project --workspace <path> --help` from the malformed-input list
  because it is a valid Commander help request, not a workflow failure.
- **TDD evidence:** The initial assigned package test run was RED (3/5):
  failures were the stale root help expectation and the `spindle:` prefix
  assertion. The first corrected run was 4/5 and exposed the valid help
  request incorrectly classified as malformed; after removing that case,
  the final run was GREEN (5/5). No production behavior was changed.
- **Fresh check run by this worker:** From
  `/home/sincore/source/spindle`, `just test::test
  tests/packaged-cli.test.ts` passed: 5 tests, 0 failures. It used the existing
  successful build output; this worker did not run `just build`.
- **Snapshot:** Starting and final revision are both
  `1c51cccfae11981a0abd269946e4ba4d097f9c4b`; no commit or staging was
  performed. At dispatch, the tracked diff SHA-256 was
  `732c74ce65849f346845cdbb48e4f8fb0386c9070e81ecb39a43769232901aa9`.
  The exact tested final tracked diff SHA-256 was
  `b48e9f5fcde1704408b95ab26fbe91f0e108917de1f66541b40ff0d9e4e02b04`.
  The tested `tests/packaged-cli.test.ts` SHA-256 was
  `e6ad2893d2e05ef738a3aa3ec1caf4f5e108ec02d48b29a39764529221a3eca5`.
  Pre-existing dirty source/test files and controller issue history were
  preserved. Other untracked files remain the four prior review/implementation
  reports; this implementation report remains untracked. No other changes
  were made by this round.
- **Changed files for this correction:** `tests/packaged-cli.test.ts` and
  this assigned implementation report only.
- **Self-review:** Root command checks are independent of descriptions or
  usage formatting; nested help verifies the expected commands/options;
  malformed workflow checks retain the meaningful exit, output, root-error,
  and side-effect assertions. No remaining concern was found in the assigned
  test change.
- **Checks not run by this worker:** `just build`, formatting, lint, type
  checks, and broader ticket regression checks. They remain pending with the
  controller, which will rerun the build and packaged test for this final
  snapshot. These pending controller checks are not implementer failures and
  do not establish ticket acceptance.

**Corrective hand-back:** PKG-02 assertions are updated and the current
packaged test passes; PKG-01's focused packaged test requirement is met on the
existing build output. Controller build and broader checks remain pending. No
commit was authorized or created.

## Controller verification after corrective round 2

The controller reran the required gate after all source/test changes and the
formatting fix. These checks cover base/head
`1c51cccfae11981a0abd269946e4ba4d097f9c4b` plus the tracked worktree diff
SHA-256 `519b5d4651f5921ae034c52a730dc5bac19186151868f34adf27c09a3e083395`.

- `just format::check` on the changed source and test files — passed.
- `just lint::check` on the same files — passed.
- `just test::types` — passed.
- `just test::test tests/sdd-workspace.test.ts tests/setup-project.test.ts tests/git-root.test.ts tests/init.test.ts tests/update.test.ts tests/computed-variables.test.ts` — passed, 81/81.
- `just build` — passed.
- `just test::test tests/packaged-cli.test.ts` after the build — passed, 5/5.
- `just tool::git diff --check` — passed.

The checks cover the following final content hashes:

```text
a8a204e8cf2ceced788deb2dd547fa320c8189d13f488731317544b179df0636  src/cli.ts
1321753ec8516af577498eccffa4d60caee546e09f1a61e3ea463f4cdd02ebba  src/index.ts
981ee904f14babb47f1ec6e5db1ac30dbf80bdb0e7036b6d0244e4d9492efcdd  src/commands/shared-options.ts
57e479f8e83308cfae8b8665826a23e948a9b223be9c5fce753e23b4af2c9d4b  src/commands/sdd-workspace/sdd-workspace-command.ts
e5316614086299fa9e59ffcc2d15bddcf5486d036ef25be63bce7f246fdf6ffc  src/commands/setup-project/setup-project-command.ts
8dc5980836b7679156af00e9016efbe35220c0b65137186c2d53f31bed25a4a9  tests/sdd-workspace.test.ts
5c6260dbc689f9787d205fa33cf0d2ca1bf2e9e36517c66d27b25ffe27d1f13b  tests/setup-project.test.ts
273686fc15e2fe8066b6fd79c1f264ae658d208a0c3b2f4fa75a35d9cd8b3dbd  tests/git-root.test.ts
fd65dfe88aa0e3fa5af859ce9d23a1a37d503438dfea3f45c4c6088c70f03ddc  tests/packaged-cli.test.ts
```

Full test suite was not run. No commit or staging was performed.
