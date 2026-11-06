# Spec Compliance: FAIL

Snapshot reviewed: checkout `/home/sincore/source/spindle`, HEAD/base `3b684dfa306a6e670c9739926a5a5a462fd99a1e` plus the frozen uncommitted implementation changes. The implementation inventory is `src/commands/shared-options.ts` (untracked), `src/commands/update/update-command.ts`, `src/cli.ts`, `src/index.ts`, and `tests/update.test.ts`. The supplied tracked diff reports 91 insertions and 39 deletions across four files; the new shared-options file is separate from that tracked stat.

| Requirement | Verdict | Evidence |
|---|---|---|
| `update` owns its Commander declaration; central CLI composes it without duplicating update options | PASS | `UpdateCommand.register` declares the update command, description, options and action (`src/commands/update/update-command.ts:91-119`); the CLI dispatches update through that registration. |
| Existing update options retain behavior; inapplicable options, invalid policy values, and unexpected arguments fail explicitly | PASS | The Commander declaration accepts the conflict policy, `--no-interactive`, and `--include-new`, restricts conflict choices, and disallows excess arguments (`src/commands/update/update-command.ts:100-119`). The updated source-CLI tests cover rejected `--stack`, an unexpected positional, and an invalid conflict choice (`tests/update.test.ts`, added invalid-invocation cases). Controller-supplied ticket-wide tests passed. |
| Reusable shared option builders support options shared with other commands without requiring their migration | PASS | `conflictPolicyOption` and `noInteractiveOption` are reusable builders (`src/commands/shared-options.ts:1-8`); update selects them, with command-specific descriptions (`src/commands/update/update-command.ts:100-102`). |
| Application-owned lifecycle and Commander-independent `run` signature/default remain intact | PASS | The registered action resolves `UpdateCommand` from the application and calls `run`; the existing `run(interactive, policy, includeNew = false)` service interface and implementation remain unchanged in the diff (`src/commands/update/update-command.ts:91-119`, and unchanged `run` body). |
| Commander generates update help; update workflow output, styling, Config, conflict and interactive/non-interactive behavior remain intact | PASS | The update declaration supplies generated help and retains Config/init guidance (`src/commands/update/update-command.ts:93-109`). Existing update workflow tests are retained; controller-supplied focused update tests passed. |
| Source CLI tests cover update help, valid/invalid options and representative workflow; direct service tests continue to pass | UNVERIFIED | The diff adds source-CLI help and invalid-invocation cases and retains workflow tests. Controller-supplied tests passed for the four named CLI test files (58 total), but neither the package nor implementation report identifies which direct service tests ran. Request the controller to identify and provide passing evidence for the existing direct service tests on the corrected snapshot. |
| Init, SDD workspace and setup-project remain functional during transition | PASS | No other command implementation was migrated. Controller-supplied targeted transition tests passed (27 tests). |
| Applicable full-spec startup constraint: parse and validate CLI arguments before Git-root discovery, so argument errors do not require Git | **FAIL** | `runExecutable` discovers the Git root for every invocation except those recognized as informational (`src/index.ts:31-39`). An invalid update invocation such as `update --stack python` outside a Git working tree therefore fails at Git discovery before Commander can report the unknown option. Existing invalid-option tests exercise a Git-backed fixture, not this required outside-Git case. |

Unverifiable requirement and required controller check: identify and provide passing current-snapshot evidence for the existing direct service tests that protect the Commander-independent `run` contract. The separate outside-Git malformed-update behavior is a failing requirement, not merely an evidence gap; TASK-01-001 requires the correction and a corresponding source-CLI test.

# Quality

**Quality verdict: FAIL**

The class-owned registration and shared option builders are small and maintain the application-owned service boundary. The update action defers application/service resolution until execution, and the change does not alter the service's `run` contract. The source-CLI tests exercise help and argument rejection, while the supplied controller checks cover the update and transition test sets. The supplied test list does not identify direct service tests, so that criterion remains unverified.

The startup ordering defect in `src/index.ts:31-39` makes malformed update commands produce a misleading Git-root failure outside a repository, contrary to the specified parsing/validation behavior. It also leaves this important startup contract without a test. No other correctness, maintainability, error-handling, regression, or test-quality issue was identified from the assigned diff.

# Strengths

- Shared option construction is isolated and reusable without forcing out-of-scope command migrations (`src/commands/shared-options.ts:1-8`).
- Update's Commander declaration is colocated with its service, and the action retrieves that service through `App` rather than constructing it outside the application lifecycle (`src/commands/update/update-command.ts:91-119`).
- The implementation adds user-visible help and invalid-invocation coverage while retaining the existing workflow tests (`tests/update.test.ts`, added source-CLI cases and retained workflow cases).

# Issues

## Critical

None.

## Important

### TASK-01-001 — Parse update arguments before Git-root discovery

- **Impact/severity:** Important; blocks Spec and Quality approval.
- **Location:** `src/index.ts:31-39`.
- **Evidence:** `runExecutable` calls `discoverGitRoot(startingDirectory)` before dispatch unless the arguments match its informational allowlist. Invalid update invocations are not on that allowlist. Consequently, running `spindle update --stack python` (or another malformed update invocation) outside a Git working tree reports a Git-root error instead of Commander's argument error.
- **Required correction:** Arrange for Commander to parse and validate update arguments before Git-root discovery, while still requiring a discovered root before executing a valid update. Add a source-CLI subprocess test from a non-Git temporary directory asserting that an invalid update invocation reports the Commander argument error rather than a Git-root failure.
- **Blocking:** Yes.

## Minor

None.

# Checks

- **Reviewer-run checks:** None. No suite was rerun; the supplied evidence is legible and covers the reviewed snapshot.
- **Controller-supplied evidence:** On snapshot `3b684dfa306a6e670c9739926a5a5a462fd99a1e` plus the frozen uncommitted implementation changes, the controller reports:
  - `just test::test tests/update.test.ts tests/init.test.ts tests/sdd-workspace.test.ts tests/setup-project.test.ts` — passed, 58 tests, 0 failures.
  - `just format::check src/commands/update/update-command.ts src/commands/shared-options.ts src/cli.ts src/index.ts tests/update.test.ts` — passed.
  - `just lint::check src/commands/update/update-command.ts src/commands/shared-options.ts src/cli.ts src/index.ts tests/update.test.ts` — passed.
  - `just test::types` — passed.
  - `just tool::git diff --check` — passed.
- **Implementer-reported evidence:** The implementation report records its focused update and transition test runs and RED/GREEN notes, but predates the controller gate checks; those later controller results are the current check evidence.
- **Limitations:** No full suite or package build is claimed or required by this ticket's acceptance criteria. The outside-Git malformed-update behavior fails the specified startup contract and requires the correction/check specified in TASK-01-001. Existing direct service-test evidence also remains unverified; the controller must identify and check those tests on the corrected snapshot.

# Assessment

**Spec Compliance: FAIL. Quality: FAIL. Task quality: Needs fixes.**

This is a review recommendation, not controller acceptance. Resolve blocking finding TASK-01-001 and provide fresh check evidence for the corrected snapshot before approval.
