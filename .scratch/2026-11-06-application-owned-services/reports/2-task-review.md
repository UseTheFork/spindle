# Spec Compliance: PASS

Scope is ticket 02 only. Ticket 01 is the integrated dependency. Setup-project and SDD command-class migrations remain on later ticket paths; this review checks their required Git discovery, not those later migrations.

| Ticket 02 criterion | Spec verdict and evidence |
|---|---|
| Introduce application dispatch and a thin executable bootstrap without running CLI startup when application modules are imported. | **PASS** — `src/index.ts:10-47` exposes discovery/runner functions and guards startup behind the executable check. `tests/git-root.test.ts:135-153` verifies importing the bootstrap has no output or workspace writes. |
| Move Init and Update into separate command classes in their own folders, receiving the application through the shared base contract and resolving dependencies during boot. | **PASS** — `src/commands/init/init-command.ts:13-28` and `src/commands/update/update-command.ts:84-99` extend `Service`, accept `App`, and initialize handlers in `boot()`. |
| Transfer command workflow ownership into the classes rather than retaining command-function compatibility wrappers; migrate affected imports and tests directly. | **PASS** — each class owns its `run()` workflow (`src/commands/init/init-command.ts:30-105`, `src/commands/update/update-command.ts:100-178`); `src/update.ts` is deleted, and `src/cli.ts:6-9,239-256` dispatches to the classes. |
| The executable may read the current directory only to seed Git working-tree root discovery; Init and Update use the application's immutable root for project paths. | **PASS** — `src/index.ts:29-43` seeds discovery from `process.cwd()`; the only production `process.cwd()` match is that bootstrap call. Init and Update derive `.github` from `this.app.workspaceRoot` (`src/commands/init/init-command.ts:30`, `src/commands/update/update-command.ts:100`). |
| Workspace-operation dispatch requires successful Git-root discovery, including while remaining commands await their class migration. Missing Git, unsuccessful discovery, and non-Git execution fail explicitly without current-directory fallback or workspace writes. | **PASS** — `src/index.ts:10-27,31-33` fails on command error or empty root and dispatches no workspace command without discovery. `tests/git-root.test.ts:95-109` covers missing Git and non-Git execution with no writes; root discovery is performed before dispatch for all non-informational commands. |
| Help and version bypass Git discovery and remain usable outside Git and when Git is unavailable. | **PASS** — `src/index.ts:31-34` and `src/cli.ts:186-195` handle informational commands without discovery; `tests/git-root.test.ts:111-133` verifies top-level and command help plus version outside Git with Git unavailable. |
| Resolve the Blueprint source root at the application boundary, preserving source overrides and packaged lookup behavior; command services use the immutable application-owned value. | **PASS** — `src/cli.ts:225-228` supplies `blueprintsRoot()` to `App`; the override and source/package lookup remain in `src/install.ts:43-48`. Handlers consume the supplied root (`src/blueprints/{agents,instructions,skills}/handler.ts:9`), and source/package tests exercise overrides and packaged assets. |
| Preserve Init/Update arguments, prompts, output, Config behavior, and reconciliation policies except for the agreed Git-root targeting change. | **PASS** — command workflows retain those behaviors in the new classes; controller-reported `just test::test` passed all 193 tests, including existing Init/Update and packaged CLI tests. |
| Keep existing shared installation and reconciliation workflows operational until their dedicated migrations, without creating obsolete command export adapters. | **PASS** — Blueprint lifecycle/reconciliation remains shared (`src/blueprints/lifecycle.ts:642-645`); the old Update module is deleted without an adapter. Controller-reported full suite passed. Later setup-project/SDD service migrations are out of scope. |
| Migrate affected workspace CLI fixtures to real temporary Git working trees that cannot accidentally resolve to the surrounding repository; retain deliberately non-Git failure and informational fixtures. | **PASS** — `tests/helpers.ts:29-65` initializes an isolated Git root for normal workspace fixtures while retaining raw runners; `tests/git-root.test.ts:95-132` keeps non-Git and informational cases. Packaged setup success invokes from a separate Git root while retaining the explicit non-Git target (`tests/packaged-cli.test.ts:150-190`). One malformed-argument fixture coverage gap is recorded as Minor below. |
| Existing CLI integration tests verify equivalent root and nested-directory results, no unintended nested output, discovery failures, and informational exceptions. | **PASS** — `tests/git-root.test.ts:11-93,95-133` covers root/nested Init and Update equivalence, no nested output, discovery failures, and informational exceptions. |
| Include directly related user documentation for mandatory Git discovery and nested-directory behavior, and run focused command tests and type checking through Just. | **PASS** — `docs/blueprints.md:3-10` documents the behavior. The implementation report records `just test::test tests/git-root.test.ts tests/init.test.ts tests/update.test.ts` (46 passing) and `just test::types` passing; controller evidence also records formatting, lint, build, and the complete suite passing. |

Unverifiable requirements and required controller checks: **None.**

# Quality: PASS

No blocking correctness or maintainability defect was found. The nonblocking test-coverage issue below does not change the verified behavior or block this recommendation.

# Strengths

- The bootstrap centralizes discovery and leaves both command workflows on the immutable application root (`src/index.ts:10-34`; command paths cited above).
- Root/nested behavior and failure/no-write behavior are tested through CLI subprocesses with isolated Git fixtures (`tests/git-root.test.ts:11-109`).
- Source-root ownership is explicit at the application boundary, while the existing override and packaged lookup are preserved (`src/cli.ts:225-228`; `src/install.ts:43-48`).
- The full controller-reported verification includes formatting, lint, type checking, build, and 193 passing tests on the final implementation snapshot.

# Issues

## Critical

None.

## Important

None.

## Minor

### TR02-Q-01 — Packaged setup argument cases fail before reaching argument validation

- **Impact:** Minor; reduces regression-test confidence for the setup-project parser, but no production behavior defect is demonstrated.
- **File:line:** `tests/packaged-cli.test.ts:357-381,384-390`.
- **Evidence:** `setupWorkspace` is deliberately non-Git, and every setup-project invalid case is paired with it as the process working directory (`:357-381`). The executable now performs Git discovery before dispatch (`src/index.ts:31-34`), while the test only asserts a nonzero status, empty stdout, and a `spindle:` prefix (`:384-390`). Thus these cases can all pass on the discovery error without testing malformed, duplicate, or inapplicable setup arguments.
- **Required correction:** Run these invalid-argument cases from a valid temporary Git invocation workspace, keeping any explicit `--workspace` argument pointed at its intended target; assert the expected argument/usage error (or otherwise distinguish it from a discovery failure).
- **Blocking:** No.

# Checks

- **Reviewed snapshot:** checkout `/home/sincore/source/spindle`; base and HEAD `d78367fbe923ef3e422e1ff741e6c1ed9ccb4168`. The reviewed implementation identity is that revision plus the exact working-tree changes listed in `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/2-review-inputs.md`: modified `docs/blueprints.md`, five Blueprint source files, `src/index.ts`, `tests/helpers.ts`, `tests/packaged-cli.test.ts`; deleted `src/update.ts`; and new `src/cli.ts`, both command modules, and `tests/git-root.test.ts`. All 13 supplied current-file SHA-256 values matched. No binary changes. The controller ticket marker and review-package/report files are workflow-only and excluded from the implementation snapshot.
- **Reviewer-run:** Read the complete supplied tracked diff, deletion, and new-file contents; checked the diff inventory/stat and snapshot hashes. A focused search found `process.cwd()` only in `src/index.ts:43`. No tests or mutating commands were run.
- **Controller-reported evidence:** The implementation report records `just format::check` and `just lint::check` over all assigned files, `just test::types`, and `just build` as passing; `just test::test` passed with 193 tests and 0 failures after a fresh build, including packaged CLI tests. The earlier fixture-related failure was corrected in the packaged test fixtures; the earlier concurrent build/test artifact race was avoided by running the final suite sequentially after build completion.
- **Implementer-reported evidence:** Focused root/Init/Update tests passed (46 tests) and type checking passed. The report records an initial RED for nested Init followed by GREEN; later discovery/help/import and nested-Update assertions were added after implementation and have current passing evidence but no separate historical RED run. Per TDD review guidance, that disclosed history does not invalidate current GREEN evidence.
- **Limitations:** Verification results above are supplied controller/implementer evidence, not reruns by this reviewer. No snapshot mismatch or unavailable review material was found.

# Assessment

- **Spec:** PASS
- **Quality:** PASS
- **Task quality:** Approved
- **Recommendation:** Approve ticket 02; retain Minor finding `TR02-Q-01` as a nonblocking test-coverage correction.

This is the reviewer recommendation, not controller acceptance.
