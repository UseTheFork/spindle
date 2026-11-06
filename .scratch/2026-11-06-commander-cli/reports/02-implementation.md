# Ticket 02 implementation report — Migrate init to Commander

## Status

**DONE_WITH_CONCERNS** — the assigned init behavior is implemented and its
focused source CLI tests pass. Test-first sequencing was not captured for every
added behavior; see the TDD evidence below. Controller checks and acceptance
remain pending.

## Checkout and snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `f55ae659fae89c202dba120b300f4172720e82fe`
- Final revision: `f55ae659fae89c202dba120b300f4172720e82fe`; no commit or staging.
- Starting worktree: only the controller's update to
  `.scratch/2026-11-06-commander-cli/issues/02-commander-init.md` was dirty;
  it was preserved. No starting untracked changes were present.
- Final worktree: that controller-owned issue history remains dirty along
  with this implementation in `src/cli.ts`,
  `src/commands/init/init-command.ts`, `src/index.ts`, and
  `tests/init.test.ts`, plus this untracked report. No other untracked files
  were present.
- Exact final tested implementation snapshot: the final focused test passed
  with the unchanged HEAD above and these SHA-256 hashes:

  ```text
  68d4311128bf7383d6eb5ec95ae8ae21e129145975a03124050c2bd0c6db3870  src/commands/init/init-command.ts
  932d9c77ccc719ff58cc33fab4824c3a6db153d5ecd43870045634e5f4d087c8  src/cli.ts
  09ce0024b2e0373502edcd7b72a6e09070afcd75cea6eba3737062a9f4f7f9e3  src/index.ts
  4fc6459667503ddc43b62411f80727a16b46f421f489f68b56647a2825fa3c11  tests/init.test.ts
  ```

  The report was added after the test run and is not part of that tested code
  snapshot.

## Criteria, changes, and evidence

| Criterion | Implementation and evidence |
| --- | --- |
| Init owns its Commander declaration and explicitly selects shared options | Added `InitCommand.register`, declaring its name, description, `--stack`, `--var`, help text, argument policy, and action. It explicitly reuses `conflictPolicyOption` and `noInteractiveOption`. Removed the legacy init option/help declarations and dispatch path from `src/cli.ts`. |
| Repeatable Stack and Variable flags retain order | Stack options accumulate in order; the existing source CLI test verifies ordered Stack values in Config. Added repeated-Variable coverage: the later `owner` value reaches Config. |
| Reject invalid and inapplicable arguments | Commander rejects update-only `--include-new`, missing values for `--stack`/`--var`, invalid conflict choices, and extra positionals. The source CLI test checks each rejection. |
| Generated help and startup behavior | `init -h` uses generated Commander help. `init --help` and malformed init arguments are tested outside Git; invalid arguments fail before Git discovery. |
| Preserve workflow and application behavior | The action defers App creation until after parsing, resolves `InitCommand` with `App.get`, and calls the existing Commander-independent `run(stackArguments, variableArguments, interactive, policy)` unchanged. Existing tests plus new representative interactive coverage pass for prompt/conflict behavior, Config, Blueprint installation, Chalk output, and non-interactive behavior. |
| Transition compatibility | No update implementation/tests or SDD/setup-project implementation/tests were changed. Ticket-wide transition regression checks are pending with the controller. |

### TDD evidence and deviation

- Added the focused `init -h` behavior test before implementation.
  `RED: just test::test tests/init.test.ts` exited 1: the new test observed
  `Unknown option '-h'`. After registering init with Commander, the same
  command passed (13/13 at that stage).
- The malformed-argument, repeated-Variable, interactive, and outside-Git
  tests were added after the core registration was implemented; they were run
  and passed, but separate historical RED runs were not captured. This is the
  reason for `DONE_WITH_CONCERNS`.
- An initial interactive-test run timed out because the test did not answer
  TTY-mode Variable prompts. The test setup was corrected to pass explicit
  values; the final focused run passed.

## Changed files

- `src/commands/init/init-command.ts`
- `src/cli.ts`
- `src/index.ts`
- `tests/init.test.ts`
- `.scratch/2026-11-06-commander-cli/reports/02-implementation.md` (this report)

The controller-owned issue-history change was preserved. No update, SDD,
setup-project, shared option builder, or prior report files were changed.

## Fresh checks

Run through the approved Just recipe from `/home/sincore/source/spindle`:

- `just test::test tests/init.test.ts` — **passed**, 17 tests, 0 failures on
  the exact implementation snapshot above.

No formatting, lint, type-check, build, direct-service suite, or ticket-wide
regression checks were run by this worker. In particular, update, SDD
workspace, setup-project, and direct service checks remain with the controller.
Formatting, lint, type checks, and ticket-wide regression checks are pending
controller verification; those pending checks are not implementer failures or
evidence of ticket acceptance.

## Self-review and hand-back

- Init's Commander options are declared with `InitCommand`; `src/cli.ts` no
  longer contains init-specific option or help definitions.
- Invalid invocation parsing precedes Git-root discovery, while valid init
  resolves the application and service only when Commander invokes the action.
- No known workflow change is intended. Controller regression checks should
  confirm the untouched update, SDD workspace, and setup-project paths.
- No commit was authorized or created.

**Hand-back:** Init is registered through its service class, reuses the shared
option builders, and passes focused help, parsing, repeated-value,
interactive, and non-interactive CLI tests. Report:
`.scratch/2026-11-06-commander-cli/reports/02-implementation.md`.

## Controller verification addendum — final frozen review snapshot

After the corrective root-help change, the controller applied the configured
formatter to `tests/init.test.ts` and removed the now-unused
`parseConflictPolicy` import from `src/cli.ts`. These were mechanical changes
after the implementer's recorded file hashes. The controller reran all checks
below after those changes, so this is the current review snapshot:

- HEAD: `f55ae659fae89c202dba120b300f4172720e82fe`.
- `src/cli.ts` — SHA-256
  `5b49ab142c2f6af2fc225d232ba1ff30976d33228adbed73dfe25a8e26510880`.
- `src/commands/init/init-command.ts` — SHA-256
  `68d4311128bf7383d6eb5ec95ae8ae21e129145975a03124050c2bd0c6db3870`.
- `src/index.ts` — SHA-256
  `09ce0024b2e0373502edcd7b72a6e09070afcd75cea6eba3737062a9f4f7f9e3`.
- `tests/init.test.ts` — SHA-256
  `e8c824f2294314d1749d84ddb1de7ec9014dcee0b573d6f5228d65f2ef3d287c`.

Controller-run evidence on this exact snapshot:

- `just test::test tests/init.test.ts tests/update.test.ts tests/sdd-workspace.test.ts tests/setup-project.test.ts tests/computed-variables.test.ts` — passed, 72 tests, 0 failures.
- `just format::check src/commands/init/init-command.ts src/cli.ts src/index.ts tests/init.test.ts src/commands/shared-options.ts` — passed.
- `just lint::check src/commands/init/init-command.ts src/cli.ts src/index.ts tests/init.test.ts src/commands/shared-options.ts` — passed.
- `just test::types` — passed.
- `just tool::git diff --check` — passed.

The earlier corrective-round hash block identifies the implementer's
pre-cleanup test snapshot and must not be used as the current review identity.

## Corrective round 1 — TASK-02-001

**Status: DONE.** Root help is restored and the assigned focused tests pass.
Controller regression checks and acceptance remain pending.

### Finding and correction

- **TASK-02-001 — Preserve root help during the init migration.**
- Added a root-help composition path in `src/cli.ts`. It generates the root
  command list using Commander, registering init and update through their
  owning command classes and listing the existing SDD and setup-project routes
  without migrating their implementations.
- Preserved the tested guidance strings for `spindle sdd --help` and
  `spindle setup-project --help`, along with update/version pointers.
- Root help remains informational and does not discover Git. The `init`
  command action remains deferred, so malformed init arguments are still
  parsed before Git-root discovery.

### Snapshot and verification

- Checkout: `/home/sincore/source/spindle`
- Starting and final HEAD: `f55ae659fae89c202dba120b300f4172720e82fe`.
  No staging or commit.
- Preserved the initial implementation and controller changes. The corrective
  round changed only `src/cli.ts` and appended this report.
- Exact final tested implementation snapshot is that HEAD plus the existing
  ticket 02 implementation and these file hashes:

  ```text
  27cf1c1578a5cbb33bd91755fe2a2b1fa58cee5f490b5dc7018897011fe411b6  src/cli.ts
  68d4311128bf7383d6eb5ec95ae8ae21e129145975a03124050c2bd0c6db3870  src/commands/init/init-command.ts
  09ce0024b2e0373502edcd7b72a6e09070afcd75cea6eba3737062a9f4f7f9e3  src/index.ts
  4fc6459667503ddc43b62411f80727a16b46f421f489f68b56647a2825fa3c11  tests/init.test.ts
  ```

- **RED:** Before the correction,
  `just test::test tests/sdd-workspace.test.ts tests/setup-project.test.ts`
  exited 1: 13 passed, 2 failed. The failures were the existing SDD-help and
  top-level-help tests, which received the generic usage error instead of
  successful help.
- **GREEN:** After the correction,
  `just test::test tests/sdd-workspace.test.ts tests/setup-project.test.ts tests/init.test.ts`
  passed: 32 tests, 0 failures. This verifies the root-help regressions and
  focused init coverage on the exact snapshot above.
- An intermediate correction attempt still failed the two root-help
  assertions because Commander `helpInformation()` did not include its
  appended help text. The final correction appends the existing route guidance
  to the generated help output; the fresh GREEN run above covers that final
  version.

### Limitations and hand-back

- No full ticket-wide tests, update/direct-service regressions, format, lint,
  type-check, build, or `git diff --check` were run in this corrective round.
  These remain controller-owned checks; their absence is not evidence of
  acceptance.
- The controller-provided untracked
  `.scratch/2026-11-06-commander-cli/reports/02-round-1-context.md` and the
  controller-owned issue history were preserved.
- No commit was made. Root help is restored with init options still class-owned;
  focused init, SDD workspace, and setup-project tests pass.

## Corrective round 2 — TASK-02-002 and Minor code-slop finding

**Status: DONE.** Semantic init argument errors are now reported before Git
discovery; the focused source CLI suite passes. Controller checks and ticket
acceptance remain pending.

### Findings addressed

- **TASK-02-002 — Validate semantic init arguments before Git discovery.**
  The Commander action now calls `validateStacks` and parses `--var` flags with
  `loadVariableDefinitions`/`parseVariableFlags` before invoking `createApp()`.
  It also checks the deterministic missing-Stack case for non-interactive
  invocations, and any missing non-default Variable required for a
  non-interactive run. Existing validation in the Commander-independent
  `run` service remains intact. Interactive invocations with no Stack continue
  to reach the Stack prompt.
- **Minor duplicate App factory wiring.** `runExecutable` now defines one lazy
  `createApp` factory and passes it to both InitCommand and UpdateCommand
  registration. Git discovery remains deferred until the action runs.

### TDD evidence

- Added the outside-Git source CLI regression before implementation. With
  `PATH` empty, the cases cover unsupported Stack, malformed Variable,
  unknown Variable, and missing Stack under `--no-interactive`; each asserts
  the intended argument error, absence of the Git-root error, and no files in
  the temporary project.
- **RED:** `just test::test tests/init.test.ts` exited 1 with 17 passing and
  one failing test. The first case (`--stack cobol`) received
  `Unable to discover the Git working-tree root...` instead of
  `Invalid stack 'cobol'`, confirming the reported ordering defect.
- **GREEN:** After the fix,
  `just test::test tests/init.test.ts` passed: 18 tests, 0 failures. The new
  outside-Git cases all passed. The existing valid init outside Git check in
  `tests/git-root.test.ts` remains unchanged; it verifies valid init still
  requires Git and leaves the target unchanged.

### Snapshot, scope, and checks

- Checkout: `/home/sincore/source/spindle`
- Starting and final HEAD: `f55ae659fae89c202dba120b300f4172720e82fe`.
  No staging or commit.
- Exact tested code snapshot is that HEAD plus the final contents of:

  ```text
  a2bbdddb19f87b260f1373c568563bf8d1f90531c0d24241d1bedb0c9246ff61  src/commands/init/init-command.ts
  8e059db38e2560e3edc5140643e1ab6d1a59ac23f33c073b9d60c986c24e3982  src/index.ts
  dbdf5500db499a26d537b0b3f5ad87622479b776ce303a8323d1e30f26ef941f  tests/init.test.ts
  ```

- Round-2 implementation/test changes: `src/commands/init/init-command.ts`,
  `src/index.ts`, and `tests/init.test.ts`; this report was appended. Existing
  `src/cli.ts`, controller issue history, prior report history, and other
  controller artifacts were preserved. The final worktree also contains the
  previously assigned ticket changes and controller artifacts listed in
  round-2 context; no unrelated files were edited.
- Fresh check run by implementer: `just test::test tests/init.test.ts` —
  **passed**, 18 tests, 0 failures, on the snapshot above.
- Not run by implementer: formatting, lint, type checks, `git diff --check`,
  ticket-wide regression tests, update/SDD/setup-project tests, and direct
  service tests. These checks are pending with the controller and are not
  implementer failures or evidence of acceptance.

### Self-review and hand-back

- Both Stack and Variable validation happen before `createApp()`, while the
  service-level `run` validations remain, and valid service callers retain
  their existing interface.
- Non-interactive missing-Stack validation is performed before Git discovery;
  the interactive path is not preempted and keeps its prompt behavior.
- No other deterministic option-validation changes or out-of-scope fixes were
  made. No findings were declined.
- No known limitations beyond the controller-owned checks above. No commit was
  authorized or created.

**Hand-back:** `TASK-02-002` and the Minor shared-factory simplification are
implemented. Focused init CLI coverage is GREEN; controller-wide verification
and acceptance remain pending.

## Controller verification addendum — corrective round 2 snapshot

The controller formatted `tests/init.test.ts` after the worker's final focused
run; it then reran the complete ticket and direct-service test set on the
formatted source. This addendum is the authoritative round-2 verified identity:

- HEAD: `f55ae659fae89c202dba120b300f4172720e82fe`.
- `src/cli.ts` — `5b49ab142c2f6af2fc225d232ba1ff30976d33228adbed73dfe25a8e26510880`.
- `src/commands/init/init-command.ts` —
  `a2bbdddb19f87b260f1373c568563bf8d1f90531c0d24241d1bedb0c9246ff61`.
- `src/index.ts` —
  `8e059db38e2560e3edc5140643e1ab6d1a59ac23f33c073b9d60c986c24e3982`.
- `tests/init.test.ts` —
  `2e62d086a31d815f90c77da7d3e4d62063157a083452130dfafdf9ecb028f798`.

Controller-run evidence on these exact hashes:

- `just test::test tests/init.test.ts tests/update.test.ts tests/sdd-workspace.test.ts tests/setup-project.test.ts tests/computed-variables.test.ts` — passed, 73 tests, 0 failures.
- `just format::check src/commands/init/init-command.ts src/cli.ts src/index.ts tests/init.test.ts src/commands/shared-options.ts` — passed.
- `just lint::check src/commands/init/init-command.ts src/cli.ts src/index.ts tests/init.test.ts src/commands/shared-options.ts` — passed.
- `just test::types` — passed.
- `just tool::git diff --check` — passed.

These controller results supersede the earlier round-2 pending-check statement
and apply to the exact hashes above.
