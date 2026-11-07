# Ticket 04 — Corrective Round 2 Spec/Quality Review

## 1. Scope and snapshot

- **Scope/phase:** Corrective issue 04, round 2 (overall corrective attempt 2). Review of `04-R1-REV-03` and the missing/uninitialized known-Gitlink behavior called out in round 1, plus fix-induced regressions.
- **Snapshot:** Base/`HEAD` `cf65376bd338741aa4a533e8b8e2cd9b37ccdb4c`, plus the frozen issue-04 worktree changes. The fix-only comparison is from round-1 frozen source/test hashes `7d8cab79467c1eff51837b98eab5e67615bc4ea6efbafc9988ad0801164be235` and `538afe14ff1be420741b36425eae8a280a648523847d95ed37a72829f020b92f` to the current source/test files.
- **Verified current SHA-256 values:** `src/commands/sdd/sdd-command.ts` `56066c294f33235ddbffe00b622bc0159a91cbb18e9c4cf218d1eb11707398a5`; `tests/sdd-workflow.test.ts` `2f97511b6e3f0122a76c5b9c3384ef6d6ef052f62efacb77cd3ccfcb89317438`; `docs/agents/issue-tracker.md` `0a0df88a65568750f1524135ec091e1ff6c513a74193979b83f1c8a132ba2c8b`. Supporting test hashes match the supplied freeze: `tests/sdd-create-status.test.ts` `21925ad3e12785530a672f29fd137eac79d4fb417ccd89fa70ad8b29fb00a5c4`; `tests/sdd-issues.test.ts` `3a1033302afb8e04728fa89e3538eb5c8208d8d11c6ab0a23df9e297c6c82bd0`; `tests/stubs.test.ts` `5cb625569507c8397f26df652486c64cf6a9b927506c721ba5e45853e054ae7e`; `tests/packaged-cli.test.ts` `b833a623da78c12f4e43c0a1ad7c43ccb42e19915a7d0bda74440f96b4cf5777`.
- **Requirements/history:** Issue 04 and its comments; feature `spec.md` and `design.md`; `.github/instructions/testing.instructions.md` and `.github/instructions/code-commenting.instructions.md`; `docs/agents/issue-tracker.md` and `docs/agents/tooling.md`; initial review, round-1 review, and implementation report under `.scratch/2026-11-06-command-driven-sdd/reports/`.
- **Change reviewed:** Complete current source and test files and relevant surrounding `checksRecord`, content-identity collection, Gitlink validation, and persistence code. Relevant additions are the directory/non-file rejection in `sdd-command.ts:1820-1832`, known Gitlink checks in `1851-1920`, and public CLI regressions in `sdd-workflow.test.ts:381-534`. The provided workspace inventory is consistent; expected controller-owned issue, guidance/source/test changes and prior untracked report history are present. All supplied current file hashes match.

## 2. Evidence and limitations

I independently verified the listed current hashes and inspected the changed code, test fixtures/assertions, guidance, and review/implementation history. I did not edit implementation/tests, alter tracker state, or run project checks, as directed.

Controller-supplied evidence for this exact formatted snapshot (not run by me):

- Formatting, targeted lint, `just test::types`, and `just build` passed.
- `just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts` passed: 76 tests.
- After build, `just test::test tests/packaged-cli.test.ts` passed: 5 tests.
- `just tool::git diff --check` passed.
- The full project test suite was not run.

The implementation report records a pre-fix RED for nested repository content retaining an identity and final GREEN coverage. It explicitly reports that the missing-Gitlink fixture already failed closed before the round-2 implementation; the new assertion for the more specific missing/uninitialized diagnostic is a refinement, not a behavioral RED. That evidence is treated accordingly.

## 3. Spec

**Verdict: PASS**

1. **`04-R1-REV-03` — nested repositories:** **ADDRESSED.** The collector rejects directory worktree entries before encoding a generic non-file marker (`sdd-command.ts:1820-1832`). An untracked embedded repository path collected by Git therefore cannot be represented by an identity that omits its contents. This fail-closed policy covers both tracked and untracked changes within that directory: the outer repository path is rejected regardless of nested file status.
2. **Known indexed and baseline Gitlinks, including missing/uninitialized paths:** The guard unions index Gitlinks and Gitlinks from the claim-baseline tree (`1851-1875`) and checks their worktree entries before relying on changed-path output (`1878-1889`). Missing entries get the explicit “worktree is missing or uninitialized” diagnostic; files and symlinks in place of a directory fail as unsupported. Changed Gitlink paths are rejected (`1891-1894`). For indexed Gitlinks, a failed `rev-parse` is normalized to the missing/uninitialized diagnostic (`1896-1907`); a nonzero submodule status command throws, and nonempty status or revision mismatch is rejected (`1908-1920`).
3. **Failure before evidence writes:** `checksRecord` computes identity before appending a record, and performs a second identity calculation before writing the ledger (`sdd-command.ts:1049-1098`). A failure from the nested-path or Gitlink checks therefore returns nonzero before durable check-result persistence. The public CLI regressions assert empty persisted `checks.records` after these failures.
4. **Typed length-framing collision correction:** The versioned, typed length-prefixed identity serialization and collision regression remain in place (`sdd-command.ts:1784-1798`; `sdd-workflow.test.ts:237-282`). No round-2 change reintroduces ambiguous framing; supplied focused regression evidence includes this test.
5. **Scope boundary:** The round-1 dispositions of `04-REV-01` and `04-REV-02` remain ADDRESSED for their supplied cases. This round confirms their relevant behavior is preserved but does not redo unrelated initial-review criteria or aggregate coverage.

## 4. Quality

**Verdict: PASS**

The policy is conservative and easy to reason about: unsupported directory worktrees and known Gitlink states fail closed rather than receiving incomplete identities. The public CLI tests create real temporary Git repositories/submodules and assert observable exit status, diagnostics, and ledger persistence rather than private helper behavior. The nested-repository test exercises both `resume` and `checks record`; the missing-Gitlink test exercises both paths after deinitializing and removing an actual local Gitlink. The fix does not alter the typed identity encoding.

Coverage limitation: tests do not separately fixture a file or symlink at a known Gitlink path, a Gitlink directory whose `rev-parse` fails while present, or a failing submodule `status` command. The corresponding source branches reject these cases, and `checksRecord` ordering prevents persistence; this limitation does not overturn the demonstrated fail-closed behavior. The nested-repository test directly changes a tracked nested file; rejection is at the containing directory path, so nested untracked content follows the same rejecting path.

No material unnecessary complexity or new blocking defect was found in the assigned scope.

## 5. Findings

### 04-R1-REV-03 — Nested untracked repositories can share an identity

- **Severity:** Important
- **Blocking:** Yes (original finding)
- **Disposition:** **ADDRESSED**
- **Location/evidence:** `src/commands/sdd/sdd-command.ts:1820-1832`; public CLI fixture/assertions at `tests/sdd-workflow.test.ts:381-455`.
- **Assessment/impact:** Changed-path directories and unsupported non-files now cause an explicit error before generic non-file serialization, preventing nested repository content changes from retaining a reusable parent identity. The test creates a nested local repository, verifies `resume` fails after changing tracked nested content, then verifies `checks record` fails and the ledger contains no result. Supplied evidence records an intended pre-fix failure and passing final tests.
- **Required correction:** None.

**New findings: NONE.**

## 6. Observations and remaining context

- **Missing/uninitialized known Gitlink behavior — ADDRESSED** (round-1 coverage gap; no separate stable finding ID was supplied). The test and source evidence are assessed in Sections 3 and 4. File/symlink substitutions and failed command branches lack individual public fixtures, as noted above; source inspection shows they fail before ledger persistence.
- Round-1 review history remains: `04-REV-01` and `04-REV-02` were marked ADDRESSED there. This scoped report preserves those dispositions and does not replace pending initial review coverage.
- Controller-supplied final checks pass on the current hashes; I ran no checks. Full-suite status remains unavailable.
- No aggregate acceptance, integration, or issue-state ruling is made here.
