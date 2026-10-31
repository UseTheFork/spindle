Spec Compliance: PASS

| Acceptance criterion | Spec verdict | Diff evidence |
| --- | --- | --- |
| 1. Interactive update offers new Skills with all selected by default; none may be selected and unchecked Skills count as skipped. | PASS | `src/prompts.ts:51-60` configures the multiselect with `initialValues: skills` and `required: false`; `src/reconcile.ts:96-109,151-155` plans selections and emits skipped outcomes. `tests/update.test.ts:977-1018` exercises default selection and selecting none. |
| 2. `--include-new` selects all new Skills and skips selection prompts in either mode; non-interactive default does not install them. | PASS | `src/index.ts:98-125` parses and forwards the option and `src/update.ts:70-77` only enables the selection callback when interactive and not opted in. `src/reconcile.ts:96-109` selects all when enabled and otherwise only prompts in interactive mode. CLI coverage: `tests/update.test.ts:936-975,1157-1198`. |
| 3. `--include-new` does not replace outdated-Skill conflict policy. | PASS | Conflict decisions remain separately resolved in `src/reconcile.ts:111-130`; `tests/update.test.ts:842-865` verifies the non-interactive error occurs without updating or adding Skills. |
| 4. New-Skill selection and outdated conflict decisions complete before writes; prompt cancellation leaves installed Skills unchanged. | PASS | Selection and conflict decisions precede `willInstall`/context resolution and the install loop in `src/reconcile.ts:96-145`. `tests/update.test.ts:1199-1238` cancels the outdated-Skill prompt after accepting new Skills and checks no filesystem change. |
| 5. Required Variables resolve only when installs/replacements will occur; Config values precede defaults and prompts; missing non-interactive values fail before writes; no-op does not prompt/fail. | PASS | Config parsing is separated from `resolveVariables` in `src/update.ts:10-68`; reconciliation invokes the deferred resolver only when `willInstall` is true in `src/reconcile.ts:135-145`. Resolution applies Config, defaults, then interactive prompts in `src/update.ts:49-68`. Tests cover no-op modes, defaults, and missing values: `tests/update.test.ts:867-910,581-603`. |
| 6. Prompted values apply to all changed Skills and merge into Config only after successful installs, preserving Stacks and other values. | PASS | One resolved context is used by the reconciliation install loop; the `afterInstall` callback runs only after it completes (`src/reconcile.ts:135-145,179-201`). `src/update.ts:79-102` merges prompted values into the existing Config. `tests/update.test.ts:1020-1090` verifies shared rendering and preservation. |
| 7. First installation failure stops later installs without rollback; Config-write failure is surfaced without rollback or saving prompted values after failed installation. | PASS | The install loop awaits each install and reaches Config persistence only after all installs complete (`src/reconcile.ts:157-201`); no rollback is introduced. CLI tests exercise rendering failure and Config-write failure at `tests/update.test.ts:1092-1155,1157-1198`, using `tests/fail-config-write.mjs`. |
| 8. Summary separates added and updated Skills, includes one skipped total, and retains invalid-version warnings. | PASS | Warning emission and separate added/updated/skipped counts are in `src/update.ts:104-125`. `tests/update.test.ts:912-934` checks the combined skipped count and both warnings; other summary assertions cover add/update distinctions. |
| 9. CLI tests cover selection, `--include-new`, cancellation, Variable prompting/persistence, failure behavior, and summaries. | PASS | End-to-end CLI tests in `tests/update.test.ts:842-1238` exercise these behaviors through the node:test harness; the interactive cases are explicitly Linux-gated. |

Unverifiable requirements and required controller checks: None. The supplied controller verification covers the frozen task snapshot; no acceptance criterion depends on a check unavailable in the diff or evidence.

Quality: PASS

The change preserves the CLI/workflow boundary: prompt orchestration and summary output remain in `src/update.ts` and `src/prompts.ts`, while `reconcileSkills` returns per-Skill outcomes (`src/reconcile.ts:1-10,157-201`). Variable resolution is deferred until a write is planned, and the post-install callback avoids persisting prompted values after an installation error (`src/reconcile.ts:135-145,179-201`; `src/update.ts:49-102`). The code retains the existing safe-path preflight before reconciliation (`src/update.ts:67-69`) and the reconciliation safety assertion (`src/reconcile.ts:39-50`); the retained implementation checks `.github`, `skills`, `spindle.json`, and each Skill path (`src/install.ts:46-66`). The added CLI tests assert resulting files, Config, output, and errors rather than internal collaborator calls (`tests/update.test.ts:842-1238`).

Strengths

- All nine ticket criteria have direct implementation evidence and corresponding CLI-level coverage.
- Prompt and conflict decisions precede writes, and Variable persistence is sequenced after successful installs.
- Failure tests verify partial success is retained and subsequent Skills/Config are not written (`tests/update.test.ts:1092-1198`).
- CLI output distinguishes additions from updates while retaining invalid-version diagnostics (`src/update.ts:104-125`).
- The implementation uses the repository's existing node:test/tsx test harness and follows the glossary's Stub, Skill, Variable, Stack, and Config vocabulary (`tests/update.test.ts:1-5`; `GLOSSARY.md`).

Issues

Critical: None.

Important: None.

Minor: None.

Checks

- Reviewer-run, read-only snapshot check: working-tree tracked diff SHA-256 is `7cc0ddceda9ba1d1c48da600d8a964449a393fa247d91fa0f3f10636bade31d3`, matching the assignment; `tests/fail-config-write.mjs` SHA-256 is `767c48963d72642ed14e0a56945b5dfa2ae684999f4f5316042f81ba472ceb5e`, also matching. The supplied base and HEAD are both `47738fa9b474524af8d0640d35d970026d3f5a1d`, with no commits in the range. The observed paths match the supplied snapshot, including the controller-owned ticket edit and the two untracked files.
- Reviewer-run, focused source check: the retained `assertSafeInstallPaths` validates `.github`, `.github/skills`, `.github/spindle.json`, and affected Skill paths (`src/install.ts:46-66`).
- Reviewer-run test/lint/format checks: None; the supplied controller has already run fresh checks on this snapshot, so suites were not redundantly rerun.
- Implementer-reported focused result: `just test::test tests/update.test.ts` passed 22/22, with 0 failures and 0 skipped.
- Supplied fresh controller results for this snapshot: scoped `just format::check src/index.ts src/prompts.ts src/reconcile.ts src/update.ts tests/helpers.ts tests/update.test.ts tests/fail-config-write.mjs` passed; `just lint::check` passed; `just test::types` passed; `just test::test` passed 65/65 with 0 failures and 0 skipped; `git diff --check` passed.
- Test-first evidence: the implementation report records RED results for `--include-new` parsing and no-op Variable resolution. It does not provide archived RED output for every new behavior slice; absence of those archives alone does not block this review. The supplied final GREEN evidence is fresh for the stated snapshot.
- Snapshot/report limitation: the implementation report states tracked diff SHA-256 `b86610b3f9bcb9862976e56487c3ef1a6b4ca2da0abe10c4c224936965002f91`, which differs from both the assignment's and reviewer-verified current fingerprint. Its later controller-gate section reports checks rerun after corrections. The current checkout matches the assigned fingerprint, and the fresh controller results are explicitly supplied for this snapshot; the earlier report fingerprint is therefore treated as stale traceability metadata, not as evidence of a current checkout mismatch.
- Peer-review status: NONE — parallel review pending. No peer report was awaited or incorporated.
- Snapshot and limitations: reviewed working tree at HEAD/base `47738fa9b474524af8d0640d35d970026d3f5a1d`, with the exact tracked/untracked state and fingerprints above. Interactive PTY tests are Linux-only; all ran in the supplied Linux verification environment.

Assessment

Spec: PASS. Quality: PASS. Task quality: Approved.

This is a review recommendation only; controller acceptance remains the orchestrator's responsibility.
