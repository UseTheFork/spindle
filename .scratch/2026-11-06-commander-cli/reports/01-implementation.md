# Ticket 01 implementation report

## Status

**DONE**

## Snapshot and checkout

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `3b684dfa306a6e670c9739926a5a5a462fd99a1e` on `feat/skill-agent-creation`
- Final revision: `3b684dfa306a6e670c9739926a5a5a462fd99a1e` (no commit was authorized or created)
- At start, the only dirty file was the controller's update to
  `.scratch/2026-11-06-commander-cli/issues/01-commander-update.md`; it was
  preserved. No other starting untracked changes were present.
- At hand-back, that controller-owned issue-history change remains. This work
  modifies `src/cli.ts`, `src/commands/update/update-command.ts`,
  `src/index.ts`, and `tests/update.test.ts`, and adds
  `src/commands/shared-options.ts` plus this report. HEAD is unchanged.
- The final focused tests were run on the working tree with the implementation
  above and the same HEAD revision. The report was created after those runs.

## Criteria, changes, and tests

| Criterion | Change and evidence |
| --- | --- |
| `update` owns its Commander declaration and central CLI does not repeat its options | Added `UpdateCommand.register(program, createApp)`, which declares the command, description, options, help, excess-argument handling, and action. `src/cli.ts` composes that declaration for update and no longer defines update-only options or dispatches update through the legacy parser. |
| Shared reusable option builders | Added `src/commands/shared-options.ts` for conflict policy choices and `--no-interactive`. Update supplies its own option descriptions; other commands are not migrated. |
| Preserve option behavior and reject inapplicable options/arguments | Commander accepts `--on-conflict overwrite|skip`, `--no-interactive`, and `--include-new`; it rejects invalid policy values, init-only `--stack`, and unexpected positionals. Subprocess coverage is in `tests/update.test.ts`; the existing workflow tests continue to exercise each supported option. |
| Preserve App/service lifecycle and Commander-independent run signature/default | The action resolves `UpdateCommand` with `App.get`. `UpdateCommand.run(interactive, policy, includeNew = false)` and its reconciliation implementation remain unchanged. App construction is deferred until the action runs. |
| Generate update help with Commander and preserve update behavior/help guidance | Commander generates update help and its built-in `-h` alias. `help update` and `update -h` work outside Git without creating project files. Existing guidance about Config sourcing, `init`, and skipped versions is retained in the generated help. Existing direct workflow tests continue to cover Config, conflict, interactive, non-interactive, Chalk/output, and Blueprint behavior. |
| Source CLI tests and transition workflows | Focused update tests pass, including the new help and invalid-argument tests. Targeted init, SDD workspace, and setup-project tests pass. No changes were made to those commands or their services. |

### Test-first evidence

- Added the `update -h` subprocess test first. RED: it failed with
  `Unknown option '-h'`; after Commander registration, GREEN passed.
- Added help-guidance assertions after reviewing the generated output. RED:
  the Commander output omitted the pre-existing Config/initialization guidance;
  after restoring the guidance through the command description/help text,
  GREEN passed.
- Added the invalid-invocation table as final passing coverage after the
  Commander migration. That table was not separately run against the old CLI
  for a historical RED result; the old parser already rejected those inputs.
- Existing update workflow tests were reused to protect the unchanged service
  behavior; no production workflow/service changes were made.

## Changed files

- `src/commands/update/update-command.ts`
- `src/commands/shared-options.ts` (new)
- `src/cli.ts`
- `src/index.ts`
- `tests/update.test.ts`
- `.scratch/2026-11-06-commander-cli/reports/01-implementation.md` (this report)

The controller-owned issue-history file was preserved and not edited.

## Fresh checks and results

Run through the approved Just recipes from `/home/sincore/source/spindle`:

- `just test::test tests/update.test.ts` — **passed**, 31 tests.
- `just test::test tests/init.test.ts tests/sdd-workspace.test.ts tests/setup-project.test.ts` — **passed**, 27 tests.
- `just tool::git diff --check` — **passed**.

These are focused results, not evidence that the full suite, packaged CLI, or
ticket-wide regression checks pass.

## Self-review, concerns, and pending checks

- Self-review confirmed update options/actions are declared only by
  `UpdateCommand.register`; the central legacy parser retains only the options
  needed by init.
- No separate CLI documentation file needed updating; the generated update
  help retains the existing command guidance.
- No known implementation concern remains. No build, package test, full
  regression suite, formatting, lint, or type check was run.
- Formatting, lint, type checks, and ticket-wide regression checks remain
  pending with the controller. These pending controller checks are not
  implementer failures or evidence of ticket acceptance.

## Hand-back

Ticket 01 implementation is ready for controller review. Update is registered
through its command class, its supported options use reusable builders, and
focused update plus transition tests pass. No commit was made.

## Corrective round 1 — TASK-01-001

**Status: DONE_WITH_CONCERNS.** The assigned finding is fixed and focused
tests pass; the controller owns the remaining checks and acceptance.

### Snapshot and scope

- Checkout: `/home/sincore/source/spindle`; starting and final HEAD:
  `3b684dfa306a6e670c9739926a5a5a462fd99a1e`. No commit or staging.
- Starting state: the uncommitted Ticket 01 implementation identified in
  `01-review-inputs.md`, including untracked `src/commands/shared-options.ts`,
  plus the controller-owned dirty ticket history and untracked reports.
  No completed dependencies; no prior corrective attempts or rulings.
- Round 1 changed only `src/index.ts`, `tests/update.test.ts`, and this
  appended report. All pre-existing changes and report history remain.
- Exact final tested implementation snapshot is the HEAD above plus the
  uncommitted implementation inventory with these SHA-256 file hashes:

  ```text
  638d468d49209ce629dbf4bc64e331b92b55f1cd3f2ca43c63fa018a98f9a98b  src/cli.ts
  26088d48af16e8d4c8e43e5c9a32a67fbedad95c2890afc06a9fbae869901207  src/commands/shared-options.ts
  90208645fe19991b1b700c7b765b6af27de9fc33d413212e22cf3059b8bc93d1  src/commands/update/update-command.ts
  9777a2e1db8fb80e48e5424b70ae8f97071ec4f8d4e21ff11be005b695907565  src/index.ts
  a479a1330a326bc240724de058db211637ebc276c750265bfc874d3f8869bdf8  tests/update.test.ts
  ```

### Finding, correction, and evidence

- `TASK-01-001`: the executable now registers the update command with a
  deferred application factory. Commander parses and validates update first;
  only a valid action discovers the invocation Git root and constructs the
  application. Other executable command paths remain unchanged.
- Added a source-CLI subprocess test using `runCliRaw` from a temporary
  directory outside Git with an empty PATH. It checks that `update --stack
  python` fails with the Commander unknown-option error, not a Git-root error,
  and leaves the directory unchanged.
- Added passing characterization that valid `update --no-interactive` still
  fails with the Git-root error outside a working tree, both with the normal
  PATH and with Git unavailable. Existing focused workflow tests exercise valid
  update execution inside project working trees.
- RED, run from the checkout: `just test::test tests/update.test.ts` exited 1
  before the fix: 31 passed, 1 failed, and the new assertion observed
  `Unable to discover the Git working-tree root` instead of the expected
  unknown-option error.
- GREEN, same command after the fix: 32 passed, 0 failed. After adding the
  retained-valid-update characterization, the same command was rerun on the
  final tested snapshot: 33 passed, 0 failed.

### Self-review and pending controller checks

- The scoped executable fix duplicates the update registration and application
  construction already present in `src/cli.ts`; this is a maintenance concern
  for later CLI migration/review. It avoids changes outside the assigned scope.
- This focused run does not establish ticket-wide or packaged-CLI coverage.
  The controller must run ticket-wide regression tests, including the direct
  service coverage in `tests/computed-variables.test.ts`, and post-fix
  formatting, lint, type checks, and `git diff --check`. None was run by this
  corrective worker; they are pending controller checks, not acceptance.

**Hand-back:** malformed update options now fail before Git discovery; valid
update execution still requires the invocation working-tree root. Focused
tests pass on the identified uncommitted snapshot. No commit was made.
