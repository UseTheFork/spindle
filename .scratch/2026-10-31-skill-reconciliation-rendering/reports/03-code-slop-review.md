# Ticket 03 Code-Slop Review

## Findings

### Important

None.

### Minor

- **`src/reconcile.ts:24,202-203`; `src/update.ts:115-129` — one-use post-install callback.** `afterInstall` is an optional callback in the shared reconciliation options, but `rg` shows it is used only by `update` to persist prompted Config values after the install loop. This adds a caller-specific hook and makes the success-ordering flow cross the reconciliation boundary without adding behavior: `reconcileSkills` already returns only after all installs succeed and throws if an install fails. Remove `afterInstall` from reconciliation and perform the prompted-value Config write immediately after `await reconcileSkills(...)` returns in `update`; leave the write conditional on prompted values. This preserves delayed persistence, failure behavior, and error reporting while making the caller own its Config side effect.

## Checks and Snapshot

- **Reviewed snapshot:** workspace `/home/sincore/source/spindle`; `HEAD` `47738fa9b474524af8d0640d35d970026d3f5a1d`, matching the assigned base and head. The tracked worktree diff hash was `7cc0ddceda9ba1d1c48da600d8a964449a393fa247d91fa0f3f10636bade31d3`; untracked `tests/fail-config-write.mjs` hash was `767c48963d72642ed14e0a56945b5dfa2ae684999f4f5316042f81ba472ceb5e`. Both hashes and the revision were rechecked before reporting and match the assignment.
- **Changes covered:** `src/index.ts`, `src/prompts.ts`, `src/reconcile.ts`, `src/update.ts`, `tests/helpers.ts`, `tests/update.test.ts`, and `tests/fail-config-write.mjs`. The tracked diff also contains the listed controller-owned ticket change. The implementation report was consulted for context but not treated as an independently verified review.
- **Evidence inspected:** ticket 03; relevant spec stories 13–31 and Testing Decisions; required code-slop and verification-before-completion skills; changed implementation and test files, including PTY and Config-write-failure helpers; callback call sites; and applicable repository instructions (no `AGENTS.md` was found).
- **Reviewer commands:** read-only `git status --short`, `git rev-parse HEAD`, `git diff --binary | sha256sum`, `sha256sum tests/fail-config-write.mjs`, `rg` callback/call-site search, `nl` line-reference check, and `find . -name AGENTS.md -print`. Snapshot checks matched. No implementation or test commands were run by this reviewer.
- **Assigned verification evidence (not rerun here):** scoped `just format::check`, `just lint::check`, `just test::types`, full `just test::test` (65/65 passed, 0 failures, 0 skipped), and `git diff --check` were reported as passing on this exact snapshot. The implementation report was also read.
- **Coverage limits:** review was limited to code slop/maintainability in the assigned diff. At dispatch, the independent general code review and controller rulings were supplied as `NONE — parallel review pending`. Untracked `reports/03-task-review.md` and `reports/03-code-review.md` appeared in the final status check; they are parallel report artifacts outside the supplied implementation snapshot and do not change the verified source/test diff fingerprints. This review does not incorporate their findings, and no acceptance decision is made here.

## Assessment

**Code slop found? Yes.** One minor, behavior-preserving simplification is supported: move the single-use Config persistence callback to the `update` caller after successful reconciliation. The remaining reviewed additions provide direct CLI behavior coverage and no other concrete material slop was identified.

### Code Slop Ledger

| File | Verdict | Top finding | Suggested action |
|---|---|---|---|
| `src/reconcile.ts` | SUSPICIOUS | Update-only `afterInstall` callback exposed in shared options and invoked after installation | Remove hook; let the caller persist after successful reconciliation |
| `src/update.ts` | SUSPICIOUS | Config write is routed through the one-use callback | Persist prompted Config values after the awaited reconciliation returns |
| `src/index.ts` | CLEAN | — | — |
| `src/prompts.ts` | CLEAN | — | — |
| `tests/helpers.ts` | CLEAN | PTY helper supports real interactive CLI coverage | — |
| `tests/update.test.ts` | CLEAN | Assertions verify command output and filesystem/Config outcomes | — |
| `tests/fail-config-write.mjs` | CLEAN | Narrow test-only Config write failure injection | — |
