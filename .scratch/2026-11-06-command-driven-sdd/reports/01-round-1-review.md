# Issue 01 — Round 1 Corrective Spec and Quality Review

## 1. Scope and snapshot

- **Phase:** Corrective issue review, Round 1.
- **Scope:** Fix-only review for `01-S-001` and `01-Q-001`, including fix-induced regressions. This updates the affected parts of the initial review; it does not repeat unaffected issue 01 coverage.
- **Base:** `3c0ff211946361acf29db516c4eb47dcf68be901` (unchanged HEAD).
- **Fixed snapshot identities:** `src/commands/sdd/sdd-command.ts` `b7723e821d661cae1acaa4dd98d15b72be8f084b5dacaecd2d58e3195e778ccf`; `tests/sdd-create-status.test.ts` `db3bbc0153b6989af9302e4e40fc9be53dcd184e4e2b1fb5293919292f931490`; `tests/packaged-cli.test.ts` `d0abeb8576465389c58f79ca8f88643579ed3a45a82123d19872263000f747f3`. I independently verified these three file hashes.
- **Correction scope:** Nested v1 ledger validation and its public CLI tests; replacement of obsolete packaged `sdd workspace` assertions with packaged create/status and help coverage. The complete tracked test patch was inspected with `just tool::git diff`. The command and source test are untracked additions from the initial implementation; their frozen contents and corrective change summary were inspected alongside the prior findings.
- **Requirements:** Issue 01, the relevant schema-validation, read-only status, public CLI and packaged-test requirements in `spec.md`, and selected design in `design.md`, all under `.scratch/2026-11-06-command-driven-sdd/`. Applicable repository instructions, glossary and ADRs are identified in `reports/01-review.md`. No separate comments source applies.
- **History:** Prior review `reports/01-review.md` returned Spec/Quality `FAIL` with blocking findings `01-S-001` and `01-Q-001`. Initial issue coverage for unaffected criteria remains as documented there; no other findings or controller rulings were supplied.

## 2. Evidence and limitations

**Controller-supplied evidence** for the frozen fixed snapshot:

- `just build` passed before packaged tests.
- `just test::test tests/sdd-create-status.test.ts tests/packaged-cli.test.ts` passed: 19 tests, 0 failures.
- Targeted lint, `just test::types`, formatting and `just tool::git diff --check` passed.

I did not run these checks. I inspected the current validator and public CLI assertions, inspected the complete tracked packaged-test diff, and verified the three source/test hashes against the supplied frozen identities. The controller reports the packaged bundle was rebuilt from the corrected source before the test run. The report updates behavior covered by the focused tests; it does not claim a full-suite run or independently repeat the build.

## 3. Spec

**Scoped verdict: PASS.**

- **Nested ledger records / `01-S-001`:** The supported v1 shapes are now typed and checked: each issue-progress record requires an `I-` numeric ID and a supported execution state; each delivery-history record requires a parseable timestamp and non-empty author and action. `status` rejects malformed elements before returning state. The public CLI test covers null and incomplete/wrong-type entries in both arrays and invalid history timestamps, and confirms the ledger bytes remain unchanged on rejection. A supported nested record is also accepted without rewriting the ledger. These are appropriately bounded shapes for the scaffold; they do not impose later workflow behavior.
- **Packaged surface / `01-Q-001`:** The obsolete packaged resolver assertions were replaced with packaged create/status output and persisted-state assertions, read-only status checks, and packaged `sdd`, `create`, and `status` help checks. This aligns with the intentional removal of `sdd workspace`; no compatibility command is required.
- Unaffected issue 01 requirements and their initial-review assessments remain covered only by `reports/01-review.md`; this report does not re-review them.

## 4. Quality

**Scoped verdict: PASS.**

The schema checks enforce required fields and types without adding a broad ledger framework. The malformed-record test exercises the public CLI and persistence boundary, with independent malformed fixtures and byte-for-byte non-mutation assertions. The packaged test checks exact observable JSON and spec contents, recorded policy/progress, help, and unchanged ledger/Git state after status. The new cases fit the established `node:test` CLI-test style.

I found no fix-induced regression in the inspected changes. No behavior-preserving simplification is warranted by this scoped change.

## 5. Findings

### 01-S-001 — ADDRESSED

- **Severity:** Important; **Blocking:** Yes (as supplied).
- **Location:** `src/commands/sdd/sdd-command.ts:48-57, 366-407`; public CLI test at `tests/sdd-create-status.test.ts:393-467`.
- **Disposition:** `ADDRESSED`. The validator now rejects non-record elements, missing required values, wrong types and unsupported execution values; fresh controller-supplied focused tests passed on the fixed snapshot and include unchanged-ledger assertions.
- **Correction required:** None remaining for this finding.

### 01-Q-001 — ADDRESSED

- **Severity:** Important; **Blocking:** Yes (as supplied).
- **Location:** `tests/packaged-cli.test.ts:83-190, 193-226, 388-427`.
- **Disposition:** `ADDRESSED`. Obsolete packaged `workspace` invocations and resolver expectations are gone. Packaged create/status contract and help assertions are present, and the fresh packaged test run passed after `just build` on the fixed snapshot.
- **Correction required:** None remaining for this finding.

**New findings: NONE.**

## 6. Observations and remaining context

- The initial review's unaffected criteria and surrounding implementation are not re-reviewed here; retain their coverage from `reports/01-review.md`.
- The prior initial Spec/Quality `FAIL` verdicts are updated only for the assigned blockers by this scoped report. This report is not an acceptance or integration ruling.
- No additional blockers, unrelated observations, or required controller decisions were identified.
