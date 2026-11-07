# Ticket 04 — Corrective Round 1 Spec/Quality Review

## 1. Scope and snapshot

- **Scope/phase:** Corrective issue 04, round 1, attempt 1; review of supplied findings `04-REV-01` and `04-REV-02`, including affected behavior regressions.
- **Snapshot:** Base and `HEAD` are `cf65376bd338741aa4a533e8b8e2cd9b37ccdb4c`; reviewed content is that revision plus the frozen corrective worktree changes. The comparison is the round-1 frozen snapshot against the initial issue-04 snapshot identified in the prior review and implementation reports.
- **Verified final SHA-256 values:**
  - `src/commands/sdd/sdd-command.ts`: `7d8cab79467c1eff51837b98eab5e67615bc4ea6efbafc9988ad0801164be235`
  - `tests/sdd-workflow.test.ts`: `538afe14ff1be420741b36425eae8a280a648523847d95ed37a72829f020b92f`
  - `docs/agents/issue-tracker.md`: `665b2ebdb076cdfc225ab9416dbfd6885cd66f953efab3b4284505d31bb63a24`
  - Unchanged regression inputs: `tests/sdd-create-status.test.ts` `21925ad3e12785530a672f29fd137eac79d4fb417ccd89fa70ad8b29fb00a5c4`; `tests/sdd-issues.test.ts` `3a1033302afb8e04728fa89e3538eb5c8208d8d11c6ab0a23df9e297c6c82bd0`; `tests/stubs.test.ts` `5cb625569507c8397f26df652486c64cf6a9b927506c721ba5e45853e054ae7e`; `tests/packaged-cli.test.ts` `b833a623da78c12f4e43c0a1ad7c43ccb42e19915a7d0bda74440f96b4cf5777`.
- **Requirements and history:** Issue 04 and its comments, feature `spec.md` and `design.md`, applicable testing/commenting instructions, `docs/agents/issue-tracker.md`, and `docs/agents/tooling.md`. Prior coverage and supplied finding text are in `reports/04-review.md`; corrective implementation and verification evidence are in `reports/04-implementation.md`.
- **Change reviewed:** The frozen source, public CLI regression tests, and agent guidance; surrounding content-identity collection, submodule validation, and `checks record` validation/persistence flow. Controller-owned tracker updates and the preserved initial report are not part of the fix review.

## 2. Evidence and limitations

I independently verified the listed file hashes and inspected the relevant source, tests, guidance, and reports. The worktree contains the expected issue-04 and round-1 files; base and `HEAD` match the supplied identity. I did not edit implementation/tests, change tracker state, or run project checks.

Controller-supplied evidence for the final formatted snapshot (not run by me):

- Formatting, targeted lint, `just test::types`, and `just build` passed.
- `just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts` passed: 74 tests.
- After build, `just test::test tests/packaged-cli.test.ts` passed: 5 tests.
- `just tool::git diff --check` passed.

The full project suite was not run. Supplied TDD evidence reports a RED for the serialization collision regression before its production fix and GREEN after it. The submodule safeguard preceded its test, so there is no pre-fix RED for `04-REV-01`; the final tests/checks are fresh for the frozen snapshot, but do not establish historical test-first sequencing.

## 3. Spec

**Verdict: FAIL**

1. **`04-REV-01` — known changed/dirty Gitlinks: ADDRESSED.** The collector rejects Gitlink paths changed from the claim baseline; for indexed Gitlinks it rejects a mismatched checked-out revision and any reported tracked, untracked, or otherwise dirty submodule status. It no longer assigns a Gitlink-only identity to those detected states. Public CLI tests cover a dirty tracked submodule, an untracked submodule file, and a changed checked-out revision. The check-record test verifies the dirty-state rejection leaves the ledger's check-record list empty. A nested-repository identity gap is recorded as new finding `04-R1-REV-03`. Missing/uninitialized Gitlink coverage remains unverified: the guard skips absent paths, and no supplied test establishes that every such state is surfaced by Git's changed-path/status commands.
2. **`04-REV-02` — ambiguous framing: ADDRESSED.** The code identity uses a versioned domain separator and length-prefixed typed fields for record markers, paths, index state/content, worktree state/mode/type, file bytes, and symlink targets. The adversarial public CLI test contrasts one untracked file whose payload contains the former second-record encoding with the corresponding two-file state and asserts distinct code identities. The implementation report records that the pre-fix public test observed the same code identity for both states, followed by a passing focused test after the fix.
3. **Check-record failure semantics: PARTIAL.** `checksRecord` computes identity and checks the supplied snapshot before appending a record or writing the ledger. Its final identity recheck also occurs before persistence. Detected unsupported submodule states therefore cannot persist a passing or stale record; the test directly checks the ledger remains empty for dirty tracked content. The nested-repository case in finding `04-R1-REV-03` is not detected, and missing/uninitialized-state behavior is unverified.
4. **Semantics/provenance and affected regressions: PASS for reviewed paths, subject to the blocking gap above.** The correction changes code-hash serialization and submodule admissibility; the `requirementsSnapshot` inputs, combined snapshot construction, `.scratch` exclusion, and separate `headSha` provenance remain intact. No material regression was found in the reviewed `checks record` path.

The initial review's coverage and findings for unaffected criteria remain as documented in `reports/04-review.md`; this scoped corrective review does not repeat that review or independently re-verify unaffected criteria.

## 4. Quality

**Verdict: FAIL**

The typed length framing is compact and addresses the demonstrated collision without changing requirements/provenance semantics. Tests exercise the public CLI and test state transitions and persisted ledger content rather than private helpers. The submodule validation is an explicit fail-closed policy for indexed Gitlinks, and its failure occurs before durable check recording. However, the guard does not discover arbitrary nested repositories/worktrees; the generic non-file marker cannot represent their contents. This leaves an identity-evasion path in the behavior being corrected. The absent/uninitialized Gitlink path is skipped by the guard, and supplied evidence does not establish whether Git's changed-path/status collection blocks that case.

No material unnecessary complexity was identified. The full project suite remains unrun, as noted above.

## 5. Findings

### 04-REV-01 — Submodule worktree content is not represented

- **Severity:** Important
- **Blocking:** Yes
- **Disposition:** **ADDRESSED** for the supplied defect and required coverage.
- **Evidence/location:** `src/commands/sdd/sdd-command.ts:1871-1902`; public CLI regression in `tests/sdd-workflow.test.ts:284-379`.
- **Assessment:** Changed Gitlink paths are rejected; initialized Gitlinks whose checked-out revision differs from the index, or whose status contains tracked/untracked changes, are rejected with explicit submodule diagnostics. `checks record` calls this identity computation before its durable write, and the dirty-submodule regression verifies no result was persisted. The missing/uninitialized and nested-repository gap is separately reported below and means the overall submodule policy is not yet complete.
- **Required correction:** None for the supplied cases. See `04-R1-REV-03` for remaining unsupported states.

### 04-REV-02 — Code hash serialization is ambiguous

- **Severity:** Important
- **Blocking:** Yes
- **Disposition:** **ADDRESSED**.
- **Evidence/location:** `src/commands/sdd/sdd-command.ts:1784-1833`; adversarial public CLI regression in `tests/sdd-workflow.test.ts:248-282`; supplied RED/GREEN and final verification in `reports/04-implementation.md`.
- **Assessment:** Each serialized field includes an explicit tag length, tag, value length, and value; the versioned domain separator distinguishes the new encoding. The adversarial test's two file layouts now assert different identities, and supplied pre-fix evidence reports that they previously collided.
- **Required correction:** None.

### 04-R1-REV-03 — Nested untracked repositories can share an identity

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:1815-1830` and `1845-1885`.
- **Defect/impact:** The guard builds its known-path set only from Gitlinks in the index and baseline tree (`1846-1870`); a nested repository/worktree not represented by one of those Gitlinks is not checked. Git reports an untracked embedded repository as its directory path; when that path is collected, `#contentIdentity` records only the generic `worktree-type=nonfile` marker (`1822-1829`), not its contents. Changes within that nested repository can consequently retain the same identity and allow `checks record` to persist coverage.
- **Required correction:** Detect/reject unsupported nested repository/worktree paths rather than representing them as generic non-files. Add public CLI regressions proving nested repository content changes cannot retain an identity or persist check coverage. Also supply focused coverage/evidence for missing or uninitialized known Gitlinks; the current code skips absent entries (`1879-1885`), but whether the surrounding Git path/status collection always blocks them is not established by this review's evidence.

## 6. Observations and remaining context

- Controller-supplied passing checks cover the formatted fix snapshot; full-suite coverage remains unavailable. No additional checks were run by me, as directed.
- The submodule test-first omission is disclosed rather than treated as evidence against the working behavior; it does not replace the required fresh final tests.
- No other blocking issue was found within the assigned corrective scope. Unaffected initial-review criteria and their coverage remain pending only to the extent recorded in the initial report; this report makes no aggregate or acceptance ruling.
