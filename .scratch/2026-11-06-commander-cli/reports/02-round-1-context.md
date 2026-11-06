# Ticket 02 corrective round 1 inputs

## Assignment and budget

- Ticket: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/issues/02-commander-init.md`
- Canonical spec: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/spec.md`
- Checkout: `/home/sincore/source/spindle`
- Starting HEAD: `f55ae659fae89c202dba120b300f4172720e82fe`, plus uncommitted ticket 02 implementation described in `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/02-implementation.md`.
- Dependency ticket 01 is integrated. Prior corrective attempts: NONE. Round 1 of 5.
- Prior rulings: NONE. Initial review batch has not started.

## Finding to fix

### TASK-02-001 — Preserve root help during the init migration

- **Impact/severity:** Important; blocks ticket transition regression verification.
- **Locations:** `src/cli.ts` (root help fallback removed) and existing root-help CLI tests in `tests/sdd-workspace.test.ts` and `tests/setup-project.test.ts`.
- **Evidence:** Controller command `just test::test tests/init.test.ts tests/update.test.ts tests/sdd-workspace.test.ts tests/setup-project.test.ts tests/computed-variables.test.ts` exited 1: 70 passed, 2 failed. Failures are `SDD help discovers workspace and rejects malformed or inapplicable arguments` and `setup-project and top-level help describe the public command`; both fail because `--help` produces `spindle: Usage: spindle <command> [options]. See --help.` instead of successful root help. Before ticket 02, the root `--help` path was accepted by the legacy init parser and displayed the command guidance expected by these tests. The init migration removed that fallback without adding a root route.
- **Required correction:** Restore a successful, useful root `--help` route while retaining init's Commander-owned help/options. Root help must list the available command routes and preserve existing guidance tested by SDD/setup tests. Keep malformed `init` arguments parsed before Git discovery. Update/add source CLI behavior coverage if needed. Avoid migrating other executable commands beyond this focused help-composition requirement.
- **Blocking:** Yes, because the required existing transition suite fails.

## History and evidence

- Implementer report: `/home/sincore/source/spindle/.scratch/2026-11-06-commander-cli/reports/02-implementation.md` (records focused init tests 17/17 and TDD limitation).
- Controller observed failures: the 72-test run output identified 70 pass and the two failures named above. Targeted failure traces assert zero exit status and show the usage error.
- No review reports exist yet for ticket 02.

## Scope and permissions

Fix only root help behavior and its directly related existing CLI test(s); preserve ticket 02 changes and user work. Allowed files are `src/cli.ts`, `src/index.ts` only if required for root informational startup, relevant existing tests, and append-only update to the ticket 02 implementation report. Do not edit update command/service/tests or unrelated SDD/setup behavior, tracker execution state, or prior ticket reports. Do not commit or publish. Source CLI subprocess seam is confirmed.

## Verification

Use the established Just recipe from `/home/sincore/source/spindle`: `just test::test tests/sdd-workspace.test.ts tests/setup-project.test.ts tests/init.test.ts`. The controller will rerun the full ticket regression set including update and direct service tests, formatting, lint, type-check, and `git diff --check`.
