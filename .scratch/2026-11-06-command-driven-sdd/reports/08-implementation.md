# Ticket 08 implementation hand-back

## Status

**DONE** — the issue-08 issue-scoped correction lifecycle and assigned public
behavior are implemented. Delivery-scoped correction is explicitly assigned
to issue 10, which must reuse these contracts with independent attempts,
rulings, and evidence. This report does not claim delivery implementation or
ticket acceptance; the controller owns review and acceptance.

## Checkout and snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `264cecaeca20097d7a1964ef957df424eb33592b`
- Final revision: `264cecaeca20097d7a1964ef957df424eb33592b`
- No staging or commit was performed.
- At start, the only dirty path was the controller-owned issue 08 tracker;
  there were no untracked files. That tracker change was preserved.
- The final tested worktree was the above HEAD plus the worker changes listed
  below and the preserved controller tracker edit. No untracked implementation
  files were present; this report is the only assigned report path written.
- Final `just tool::git status --short` showed the controller-owned issue file
  and these worker-modified paths:
  `docs/agents/issue-tracker.md`,
  `docs/agents/tooling.md`,
  `src/blueprints/agents/sdd-reviewer.agent.md`,
  `src/blueprints/skills/int-subagent-driven-dev/references/corrective-rounds.md`,
  `src/blueprints/skills/int-subagent-driven-dev/references/implementer-corrections.md`,
  `src/commands/sdd/sdd-command.ts`, and `tests/sdd-workflow.test.ts`.
  The assigned report itself is untracked at
  `.scratch/2026-11-06-command-driven-sdd/reports/08-implementation.md`.

## Criteria and evidence

- **Issue-scoped dispatch and progress history:** `correct` requires confirmed
  actionable findings or a currently recorded non-mechanical failed check;
  persists an objective/attempt before returning an assignment; and reuses a
  pending assignment idempotently. Public workflow coverage includes check-
  driven dispatch, finding-driven dispatch, repeat dispatch, explicit
  productive continuation beyond five attempts, adjudication pause, and
  resume without duplicate dispatch.
- **Issue submission, checks, review, and acceptance:** corrective reports use
  the implementation assignment contract. Corrective reviews retain attempt
  and finding provenance. Initial-review coverage remains independently
  required for acceptance, and the current corrective review cannot substitute
  for it. Current test coverage exercises check-driven correction before
  initial review, missing initial-review acceptance rejection, and acceptance
  with retained initial plus corrective review evidence.
- **Evidence freshness and scope:** recorded check coverage is tied to explicit
  paths/content and requirements identity. Tests cover reuse for unchanged
  covered inputs and staleness when covered content or requirements change.
- **Persistence and adjudication:** issue attempts retain assignments, checks,
  review assignments/outcomes, and progress assessments; status/resume expose
  the gate without resetting history. No attempt-count acceptance limit is
  imposed.
- **Delivery scope — issue 10 follow-up, not an issue-08 blocker:** issue 08
  establishes correction lifecycle contracts and public behavior for issue
  scope. Per the controller's recorded scope ruling, issue 10 introduces
  delivery-scoped operations and must reuse these contracts while maintaining
  independent delivery attempts, rulings, and evidence. The current CLI
  exposes `--issue`, not `--scope delivery`; this implementation intentionally
  makes no delivery-scope claim.
- Per-attempt outcomes are preserved through the recorded implementation
  assignment/report, check records, and review assignments/results, with
  explicit progress assessments. No independent semantic success inference
  or attempt-count acceptance rule is introduced.

## Changed files

- `src/commands/sdd/sdd-command.ts` — issue correction lifecycle, evidence
  validation, status/resume behavior, and accurate issue-scoped CLI help.
- `tests/sdd-workflow.test.ts` — public CLI correction, progress, review,
  evidence, acceptance, and persistence coverage.
- `src/blueprints/skills/int-subagent-driven-dev/references/corrective-rounds.md`
  — issue command usage and the issue-10 delivery-scope follow-up with
  independent-history/anti-contamination guidance.
- `src/blueprints/skills/int-subagent-driven-dev/references/implementer-corrections.md`
  and `src/blueprints/agents/sdd-reviewer.agent.md` — distinguish issue-08
  scope from issue 10 while requiring separate delivery history and evidence.
- `docs/agents/issue-tracker.md` and `docs/agents/tooling.md` — document the
  issue correction command, progress decision inputs, and issue-10 delivery
  boundary.
- `.scratch/2026-11-06-command-driven-sdd/reports/08-implementation.md` —
  this implementation hand-back.

## TDD and verification

- The issue-scoped workflow implementation and its behavioral groups were
  developed test-first in the preceding work session; its focused public suite
  passed 61/61 before this resumed verification. This continuation changes
  guidance/report wording only; no behavior or tests were altered.
- During this session, a proposed assertion for initial coverage first exposed
  stale-check setup, then proved inapplicable because that scenario already
  had a submitted initial review and correctly required a corrective review.
  The invalid assertion was removed rather than weakening workflow behavior.
- Final scheduled command:
  `just test::test tests/sdd-workflow.test.ts tests/sdd-issues.test.ts tests/sdd-create-status.test.ts tests/catalog.test.ts tests/install.test.ts`
  — **109 passed, 0 failed** on the final source and guidance snapshot.
- Final formatting:
  `just format::format src/commands/sdd/sdd-command.ts tests/sdd-workflow.test.ts docs/agents/issue-tracker.md docs/agents/tooling.md src/blueprints/skills/int-subagent-driven-dev/references/corrective-rounds.md src/blueprints/skills/int-subagent-driven-dev/references/implementer-corrections.md src/blueprints/agents/sdd-reviewer.agent.md`
  — passed.
- Final formatter verification:
  `just format::check src/commands/sdd/sdd-command.ts tests/sdd-workflow.test.ts docs/agents/issue-tracker.md docs/agents/tooling.md src/blueprints/skills/int-subagent-driven-dev/references/corrective-rounds.md src/blueprints/skills/int-subagent-driven-dev/references/implementer-corrections.md src/blueprints/agents/sdd-reviewer.agent.md`
  — passed; all seven paths matched.
- Final lint:
  `just lint::check src/commands/sdd/sdd-command.ts tests/sdd-workflow.test.ts`
  — passed.
- Final types: `just test::types` — passed.
- Final build: `just build` — passed.
- Final patch check: `just tool::git diff --check` — passed.
- `just format::check .scratch/2026-11-06-command-driven-sdd/reports/08-implementation.md`
  — could not run because the formatter excludes this `.scratch` report path;
  the report was written with manually wrapped Markdown. This does not affect
  the passing format check for the seven implementation/guidance paths.
- No worker-scheduled project check was unavailable. The formatter excludes
  the `.scratch` report itself; all seven assigned implementation/guidance
  paths passed formatter verification. The controller should independently
  rerun final gates, including packaged CLI checks.

## Self-review and remaining concerns

- No unresolved issue-08 implementation blocker is known. Delivery-scoped
  operations and independent-history tests are issue 10 follow-up scope, as
  recorded in the controller's ruling; they are not claimed here.
- Formatting, lint, types, build, and the scheduled regression pass for the
  tested snapshot. The controller's independent final gates remain pending and
  are not implementer failures or evidence of acceptance.

## Hand-back

Issue-scoped correction work and its scheduled checks are complete. Issue 10
owns delivery-scoped operations and must reuse the issue-08 contracts with
separate histories; no delivery implementation is claimed here. The controller
owns independent final verification, review, and acceptance. No files were
staged or committed.

## Corrective attempt 1 — I08-R1

### Status and snapshot

**Status: DONE** for the authorized fix. This hand-back does not constitute
review or ticket acceptance.

- Checkout: `/home/sincore/source/spindle`
- Starting and final HEAD: `264cecaeca20097d7a1964ef957df424eb33592b`
- Exact tested snapshot: the same HEAD plus the two corrective changes listed
  below, with the pre-existing controller and issue-08 changes preserved.
- Starting state: the controller-owned issue 08 tracker was modified; the
  issue-08 product paths in `docs/agents/issue-tracker.md`,
  `docs/agents/tooling.md`, `src/blueprints/agents/sdd-reviewer.agent.md`,
  `src/blueprints/skills/int-subagent-driven-dev/references/corrective-rounds.md`,
  `src/blueprints/skills/int-subagent-driven-dev/references/implementer-corrections.md`,
  `src/commands/sdd/sdd-command.ts`, and `tests/sdd-workflow.test.ts` were
  modified; and `reports/08-implementation.md` and `reports/08-review.md`
  were untracked. All were preserved.
- Final state: the same pre-existing paths remain modified/untracked, with
  this appended report evidence. The build created no additional worktree
  changes. Nothing was staged or committed.
- Starting hashes for the assigned product files matched the controller's
  frozen values: `sdd-command.ts`
  `3c8defb06252bde227f3cc08c0dbabea03f937bc8cfb65a2ba98c02cfc569c07`;
  `sdd-workflow.test.ts`
  `faaa21a18c3f9a98ea53f0089e2e37c5f4e892bc449788d3ab9d56fc0fe7092f`.
- Final hashes: `sdd-command.ts`
  `fcbaff8e0c27673c6ad9441f049ccf0236242ef9e01482209ff865ec1b8a746c`;
  `sdd-workflow.test.ts`
  `e62c6b7b6531b82099bbc3eaf1521a9e6b49f66c4738d8d37e941eb5b3f928a4`.

### Finding, changes, and test evidence

- **I08-R1:** `resume()` now selects the corrective review assignments for the
  attempt matching the current corrective implementation assignment. The
  selected set drives review-blocker evaluation, the assignments returned to
  callers, and `#nextAction`; stale initial assignments are no longer used for
  that corrective-resume state.
- Added public CLI regression
  `resume returns pending corrective reviews after initial review coverage is submitted`.
  It submits a failed initial review with a confirmed finding, submits a
  content-changing corrective implementation, records its passing check,
  dispatches a pending corrective review, and verifies that `resume` returns
  that review, no stale blocker, and `await-review-report`.
- **RED:** the first regression run reached the intended behavior and failed
  with actual `resolve-review-blocker` versus expected `await-review-report`
  (the command ran the full workflow file: 61 passed, 1 failed). The initial
  focused rerun after implementation exposed a mismatch in the test's compared
  object shapes; the assertion was corrected to compare the same public
  fields.
- **GREEN:** `just test::test --test-name-pattern='resume returns pending corrective reviews after initial review coverage is submitted' tests/sdd-workflow.test.ts`
  passed, 1/1.
- **Scheduled regression batch:** `just test::test tests/sdd-workflow.test.ts tests/sdd-issues.test.ts tests/sdd-create-status.test.ts tests/catalog.test.ts tests/install.test.ts`
  passed, 110/110 on the exact tested snapshot.

### Checks and remaining work

- `just format::format src/commands/sdd/sdd-command.ts tests/sdd-workflow.test.ts`
  completed; `just format::check src/commands/sdd/sdd-command.ts tests/sdd-workflow.test.ts`
  passed.
- `just lint::check src/commands/sdd/sdd-command.ts tests/sdd-workflow.test.ts`
  passed.
- `just test::types` passed.
- `just build` passed.
- `just tool::git diff --check` passed.
- No additional fix-only scope or unresolved implementation concern was
  identified. No delivery-scope behavior was added.
- The full project suite and packaged CLI checks were not run by this worker.
  Controller-owned independent verification, review of this corrective
  snapshot, and acceptance remain pending; those pending gates are not worker
  failures or evidence of ticket acceptance.

### Hand-back

The authorized resume-selection fix and public regression are complete and
green. Only the assigned source and test paths were edited for this attempt;
the implementation report was appended as authorized. No staging or commit
was performed. Return this snapshot for the assigned round-1 review.
