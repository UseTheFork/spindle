# Ticket 02 corrective round 2 inputs

## Assignment and budget

- Ticket: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/issues/02-commander-init.md`
- Full spec: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/spec.md`
- Checkout: `/home/sincore/source/spindle`
- Starting HEAD: `f55ae659fae89c202dba120b300f4172720e82fe` plus the uncommitted ticket 02 implementation.
- Round: 2 of 5 permitted corrective dispatches. Round 1 (`TASK-02-001`, root help restoration) is complete and verified.
- Prior attempts: round 1 fixed root help; ticket 02 implementation and controller mechanical cleanup were verified in round 1 checks.
- Prior rulings: `TASK-02-001` addressed; initial code review PASS; code-slop identified one Minor simplification; initial Spec/Quality identified blocking `TASK-02-002`.

## Blocking finding to fix

### TASK-02-002 — Validate semantic init arguments before Git discovery

- **Impact:** Invalid user-supplied Stack or Variable values outside a Git working tree produce a Git-root error instead of the relevant argument-validation error, violating parse/validate-before-discovery behavior.
- **Evidence:** `InitCommand.register` action in `src/commands/init/init-command.ts` calls `createApp()` before `InitCommand.run`; its factory in `src/index.ts` discovers Git. Stack validation and Variable flag parsing occur later in `run`. Existing outside-Git coverage tests only Commander-level unknown-option parsing.
- **Required correction:** Perform deterministic, input-only validation of Stack values and Variable flag syntax before calling the App factory, while preserving the public `run` method and workspace-dependent workflow. Add source CLI tests outside Git for an unsupported Stack and malformed Variable value, asserting those errors rather than Git-root discovery.
- **Blocking:** Yes.

## Related code-slop finding to address in the same round

- `src/index.ts` duplicates the same lazy Git-root discovery and `App` construction closure in the `init` and `update` registration branches.
- Review's proposed behavior-preserving simplification: define one local `createApp` closure and pass it to both registrations, keeping command-specific registration and parsing intact.
- This is Minor and not an independent blocker; the corrective assignment requests fixing it alongside `TASK-02-002` if it remains a small, clean change. If the worker finds a concrete reason not to do so, return the reason and controller will rule it.

## Review history and evidence

- Initial code review (after snapshot reconciliation): PASS, no findings. Report: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/02-code-review.md`.
- Initial code-slop review: Minor duplicate App factory wiring; report: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/02-code-slop-review.md`.
- Initial Spec/Quality review: FAIL only on `TASK-02-002`; report: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/02-task-review.md`.
- Root help corrective finding `TASK-02-001` and its evidence are in `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/02-implementation.md`.
- Prior controller checks on round 1 snapshot: ticket tests 72/72 (including direct service), format/lint/type/types/diff-check all passed.

## Scope and permissions

Modify only `src/commands/init/init-command.ts` for pre-App validation, `src/index.ts` for the shared App factory, directly relevant `tests/init.test.ts`, and append-only `02-implementation.md`. Preserve all previous changes and history. No other commands or workflow services are in scope. No tracker execution edits, stage/commit/publish.

## Verification

Use the source CLI subprocess seam and project Just recipes from `/home/sincore/source/spindle`. TDD: first add one outside-Git test covering unsupported `--stack` and malformed `--var` (separate invocations/assertions are acceptable) and run it RED; then implement and run GREEN. Also run `just test::test tests/init.test.ts` after the correction. Controller will rerun the ticket-wide suite including update, SDD/setup, direct service tests, formatting, lint, type-check, and diff check.
