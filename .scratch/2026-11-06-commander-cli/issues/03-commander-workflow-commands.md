# 03: Migrate SDD and project setup to Commander

Reporter: unknown
Category: enhancement
Status: ready-for-agent
Execution: integrated

**What to build:** Make `spindle sdd workspace` and `spindle setup-project`
Commander-backed commands with class-owned declarations, retaining their
existing report resolution and project setup behavior.

**Blocked by:** 01: Introduce Commander through update.

- [X] Each executable command class registers its own name, description, options, and action; the SDD group remains a grouping route rather than a new service.
- [X] SDD workspace requires `--workspace`, `--reports-dir`, and `--ticket`, accepts optional `--round`, and preserves existing value validation and duplicate-option rejection.
- [X] Setup-project requires `--workspace` and preserves its existing validation and duplicate-option rejection; both commands reject unknown options and unexpected positionals.
- [X] Commander generates group and command help, and both commands retain their existing JSON output shapes, ordering, side effects, and error handling for workflow failures.
- [X] Explicit target workspaces remain distinct from the invocation Git root, and application-owned service lifecycle and Commander-independent `run` interfaces remain intact.
- [X] Source CLI subprocess tests cover valid and invalid options, duplicate options, representative report and setup workflows, and help; existing direct service coverage remains valid.
- [X] Existing init and update behavior remains functional during the transition.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-11-07T04:45:00Z - @unknown**
Execution: claimed at base snapshot `1c51cccfae11981a0abd269946e4ba4d097f9c4b`; ticket 01 dependency is integrated.

**2026-11-07T04:46:00Z - @unknown**
Execution: implementing at base snapshot `1c51cccfae11981a0abd269946e4ba4d097f9c4b`; dispatched ticket 03 in the shared checkout.

**2026-11-07T05:10:00Z - @unknown**
Execution: in-code-review on base `1c51cccfae11981a0abd269946e4ba4d097f9c4b` plus the current worktree diff; controller formatting, lint, type, 81-test ticket regression, and whitespace checks passed.

**2026-11-07T05:30:00Z - @unknown**
Execution: changes-requested on the reviewed worktree snapshot; code-slop finding CS-01 requests sharing the duplicate-option helper, and Spec/Quality finding PKG-01 requires packaged CLI verification. Corrective round 1 dispatched for CS-01; controller will run the required build and packaged CLI checks on the fixed snapshot.

**2026-11-07T05:31:00Z - @unknown**
Execution: implementing for corrective round 1 on base `1c51cccfae11981a0abd269946e4ba4d097f9c4b`; one corrective implementation dispatch used.

**2026-11-07T05:45:00Z - @unknown**
Execution: changes-requested after round 1 checks on worktree diff `cd8ab7efab91a70c609582017f24041f0589a9e2b85b5e2929fc4d1936ca0957`. Shared option helper change passed format (after controller formatting), lint, type-check, 81 source regressions, and `just build`; packaged CLI had 3/5 tests pass. The two failures were stale expectations in `tests/packaged-cli.test.ts` for handwritten SDD/root-help text and `spindle:` error prefixes; update these assertions to cover Commander-generated help and nonempty CLI errors without pinning incidental formatting.

**2026-11-07T05:46:00Z - @unknown**
Execution: implementing for corrective round 2 on base `1c51cccfae11981a0abd269946e4ba4d097f9c4b`; two corrective implementation dispatches used.

**2026-11-07T06:05:00Z - @unknown**
Execution: in-review for corrective rounds 1 and 2 on the checked source snapshot. Controller format, lint, type, 81 source regression tests, build, 5 packaged CLI tests, and whitespace checks all passed; scoped re-review is pending.

**2026-11-07T06:06:00Z - @unknown**
Corrective review ledger: CS-01 was fixed in round 1 by sharing the duplicate-option helper. PKG-01 was verified in round 2 with `just build` and 5/5 packaged CLI tests. Controller finding PKG-02 was that two packaged tests still asserted handwritten help text and a `spindle:` error prefix; this was accepted as stale incidental formatting, and the assertions were updated without changing CLI behavior. All three findings are cleared by scoped re-review; Spec and Quality pass. Controller format, lint, type, 81 source regressions, build, 5 packaged tests, and whitespace checks passed on the final source/test hashes recorded in `../reports/03-implementation.md`.

**2026-11-07T06:10:00Z - @unknown**
Execution: integrated in commit `fec6157f37f875f4fe0ec8f969f9ea3180ece4b8`; all ticket criteria passed, initial and scoped reviews cleared, and required build/package verification succeeded. Full test suite is deferred to full-spec final verification. Reports: `../reports/03-code-review.md`, `../reports/03-code-slop-review.md`, `../reports/03-task-review.md`, `../reports/03-round-2-review.md`.
