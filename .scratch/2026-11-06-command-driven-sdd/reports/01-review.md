# Issue 01 — Initial Spec and Quality Review

## 1. Scope and snapshot

- **Scope / phase:** Initial review of issue 01, “Create and inspect feature workspaces.”
- **Snapshot:** Base and HEAD `3c0ff211946361acf29db516c4eb47dcf68be901` plus the frozen dirty/untracked implementation inventory recorded in the issue comment and assignment. I independently confirmed the listed SHA-256 values for the added command and test and modified CLI/guidance files. Controller-owned issue comments and this report are tracker records, not implementation inputs.
- **Compared changes:** `src/cli.ts`; added `src/commands/sdd/sdd-command.ts`; removal of `src/commands/sdd-workspace/sdd-workspace-command.ts`; added `tests/sdd-create-status.test.ts`; removal of `tests/sdd-workspace.test.ts`; `docs/agents/tooling.md`; and `docs/blueprints.md`.
- **Canonical requirements:** `issues/01-create-and-inspect-feature-workspaces.md`, applicable creation/status and persistence sections of `spec.md`, and selected design in `design.md`, all under `.scratch/2026-11-06-command-driven-sdd/`. Applicable repo guidance: `docs/agents/issue-tracker.md`, `docs/agents/tooling.md`, `.github/instructions/code-commenting.instructions.md`, `.github/instructions/testing.instructions.md`, `GLOSSARY.md`, and ADRs 0003 and 0004. No separate comments file or additional repository `AGENTS.md` was supplied/found.
- **Implementation report:** `reports/01-implementation.md`. No prior findings or rulings.

## 2. Evidence and limitations

**Controller-supplied evidence** for the frozen implementation snapshot: formatting completed; `just test::test tests/sdd-create-status.test.ts tests/packaged-cli.test.ts` reported 18 passing tests; targeted lint, `just test::types`, `just build`, and `just tool::git diff --check` passed. The implementer separately reports an earlier 13-test focused pass. I did not run these checks.

**Personally run:** After the supplied build, I ran `just test::test tests/packaged-cli.test.ts`. It failed 2 of 5 tests: the bundled workflow test and packaged help test still invoke/expect the removed `sdd workspace` command (`unknown command 'workspace'`). The other 3 packaged CLI tests passed. This run used the rebuilt packaged CLI and is the current evidence for that regression.

The implementation report lists different command/test hashes (`424a1e…` and `b6d8d3…`) from the frozen inventory (`debac2…` and `89a3de…`). I do not rely on the report’s earlier source/test hash listing or its historical RED claims for current coverage. The controller’s source/test checks are reported on the frozen source snapshot, but its packaged test result preceded the supplied build in the recorded sequence and did not reveal the rebuilt-package failures above.

Coverage is limited to issue 01’s creation/status scope, not the later workflow command family or aggregate delivery. No complete test run was performed by me.

## 3. Spec

**Verdict: FAIL**

| Applicable criterion | Assessment |
|---|---|
| Named creation inputs; initial spec, issue/report directories and one versioned ledger; no overwrite | Implemented. The source CLI test asserts the exact result shape and created directory contents. |
| Repository-wide ID allocation, descriptive slug, historical/unrelated directory exclusion, temporary lock and concurrency | Implemented. The allocator scans matching directory names under the lock; source tests cover dated/unrelated entries, large numeric IDs, concurrent processes, and lock cleanup. |
| Stored built-in policy and retrospective choice; no default substitution on status | Implemented. The created ledger records policy version 1 and issue/delivery reviewer requirements; tests cover both retrospective values and a stored non-default policy. |
| Explicit, structured, read-only status; no active feature or legacy migration | Implemented for valid initial ledgers. It selects by `--spec`, returns the stored state, and tests assert unchanged ledger bytes and Git status, explicit feature selection, and legacy-layout rejection. |
| Service/root patterns and explicit schema/version/path validation | **Not fully met.** Path, version, required top-level fields, several value types and execution enum are checked, but nested `issues` and delivery `history` records are accepted as `unknown[]`; only that each container is an array is validated. See `01-S-001`. |
| Safe creation and recoverable failure/interruption behavior | The staging-then-rename path avoids publishing partial workspaces. Abandoned staging and stale locks are preserved with manual inspection/removal instructions; this is fail-closed and recoverable, though it intentionally requires manual cleanup. |
| Public CLI coverage and updated guidance; project Just tooling; no automatic agents/checks/Git mutations | New public CLI tests cover exact outputs, help, required/named inputs, defaults, allocation/concurrency, selected status and read-only behavior, and relevant path safety. Guidance describes the new surface. Commands do not dispatch agents, run checks, or mutate Git. The stale packaged CLI test is a Quality finding below; it does not mean the removed command should be retained. |

## 4. Quality

**Verdict: FAIL**

Strengths: creation uses a temporary lock over scanning and publication, stages the complete workspace before atomic directory publication, avoids destructive cleanup of abandoned artifacts, and gives recovery instructions. Status uses explicit feature selection, validates containment and regular-file/directory paths, rejects dated legacy layouts, and does not rewrite stored policy. Tests exercise public CLI behavior and meaningful concurrency and safety cases rather than private methods.

The packaged CLI regression tests still assert the intentionally removed resolver. The personally run post-build test fails on those obsolete expectations, so current packaged CLI verification is not green. Nested ledger records also pass without structural validation, as detailed under Spec.

No separate behavior-preserving simplification is recommended; the lock, staging, path checks, and numeric precision handling have concrete safety or contract purposes.

## 5. Findings

### 01-S-001

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:48,51,344,362`
- **Defect:** The ledger models `issues` and `delivery.history` as `unknown[]`, and `#validateLedger` only checks that those values are arrays. For example, an otherwise valid version-1 ledger containing `issues: [null]` or `delivery.history: [null]` passes status validation and is returned as valid structured state.
- **Impact:** `status` can report success for malformed persisted workflow state, contrary to the explicit schema-validation contract and undermining trustworthy inspection/recovery.
- **Required correction:** Define and validate the supported v1 element shapes (at minimum reject non-record entries and validate their required fields/types); add public CLI cases proving malformed nested entries fail without modifying the ledger.

### 01-Q-001

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `tests/packaged-cli.test.ts:96-107,214-225`
- **Defect:** The packaged workflow and help tests still invoke and require `sdd workspace`, even though this change intentionally removes that command. After the supplied build, the packaged test run failed 2/5 tests with `unknown command 'workspace'`.
- **Impact:** The packaged CLI regression check fails on the rebuilt implementation and its prior reported pass does not verify the current bundled SDD surface.
- **Required correction:** Replace obsolete packaged resolver assertions with packaged `sdd create`/`sdd status` contract checks (including help and observable output), then run the packaged and focused SDD tests against the rebuilt snapshot.

## 6. Observations and remaining context

- The manually preserved stale-lock/abandoned-staging policy is conservative and consistent with safe recovery: it avoids guessing whether artifacts are still owned, blocks retry, and gives the maintainer an explicit inspection/removal path.
- The frozen implementation report’s command/test hashes differ from this assignment’s exact frozen hashes; current controller-provided checks and the post-build packaged test result are recorded above.
- This report does not verify later workflow operations, full-spec behavior, or aggregate review coverage.
