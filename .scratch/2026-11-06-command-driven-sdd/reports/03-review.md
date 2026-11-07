# Ticket 03 — Initial Spec/Quality Review

## Scope and snapshot

- **Scope/phase:** Initial review of issue 03, “Claim, dispatch, and resume
  implementation,” including regressions in the assigned SDD command, related
  tests, and guidance.
- **Identity:** base and HEAD `fd1cc60604cebe97dc4e14ebf76332af35d461b7`,
  plus the frozen issue 03 dirty and untracked changes. I verified the supplied
  SHA-256 values for the command, all listed tests, guidance, and both shipped
  Blueprint Markdown files; they match the assignment and implementation
  report. The worktree inventory also matches the supplied inventory. The
  controller-owned issue 03 and implementation report are preserved.
- **Canonical requirements:** issue 03; relevant claim/dispatch/submit/resume,
  read-only query, persistence/recovery, path-safety, and testing requirements
  in `spec.md` and `design.md`; applicable testing, commenting, Blueprint
  reference instructions; `docs/agents/issue-tracker.md` and
  `docs/agents/tooling.md`.
- **Change inspected:** workflow implementation in
  `src/commands/sdd/sdd-command.ts` with relevant surrounding command,
  issue/ledger, path-validation, lock, and write-recovery code; new
  `tests/sdd-workflow.test.ts`; updated create/status and packaged CLI tests;
  changed tracker/tooling guidance and shipped workflow skill/example; and
  ticket comments. No prior issue 03 findings or rulings.

## Evidence and limitations

- **Supplied controller verification** on the frozen code snapshot: formatting,
  targeted lint, typecheck, build, and the final ticket regression command
  passed; the final command covered 59 tests across the workflow,
  create/status, issue, stubs, and packaged CLI suites. `git diff --check`
  passed. The report states the full project test suite was not run.
- **Personally performed:** verified the supplied hashes and HEAD; inspected
  the sources and tests. I did not run project checks, as instructed.
- The passed tests establish the tested current behaviors, not crash recovery
  at a partially completed multi-file write. That specific acceptance
  criterion remains unverified by tests.

## Spec

**Verdict: FAIL**

| Issue 03 criterion | Assessment |
| --- | --- |
| 1. Readiness, dependencies, competing ownership, and dirty checkout | **PASS.** `claim` checks unstarted state, ready triage, integrated dependencies, and Git status before recording ownership. The public CLI tests cover staged, unstaged, untracked preparation content, dependencies, and concurrent claims. |
| 2. Clean-claim author and baseline; failed claims do not alter them | **PASS.** Claim records the explicit author and verified `HEAD` only after the clean-status and readiness gates. Failure tests compare persisted state and Git status. |
| 3. Permitted dispatch, durable intent/report destination, no worker launch | **PASS.** `implement` records one assignment under the issue lock before returning it; repeated dispatch returns the recorded assignment. The inspected command only returns handoff data. |
| 4. Submission target/action, provenance, unavailable reports | **PASS.** `submit` validates role, assignment, controller, destination and regular-file containment, hashes the report, and leaves missing/unavailable work pending. |
| 5. Read-only `next`/expanded `status` | **PASS.** They report actions, pending assignment state, and dirty/dependency/report blockers without writing workflow state. Tests compare state and Git status before/after queries. |
| 6. Resume and confirmed handoff | **PASS.** Same-owner resume preserves assignment/gate; a new owner requires confirmation and is recorded without allocating a new assignment. |
| 7. Locks, interrupted dispatch recovery, idempotency | **PARTIAL / UNVERIFIED.** The implementation uses the issue lock and recoverable journal, and repeated dispatch/submission are tested. No test interrupts a dispatch or write transaction and then verifies recovery resumes the original assignment. |
| 8. Path, symlink, ignored-path, regular-file protections and preservation | **PASS.** The inspected path guards enforce checkout/report containment, reject ignored and non-regular/symlink report destinations, and preserve existing files; public tests cover these guards. |
| 9. Public CLI scenario coverage | **FAIL.** Separate CLI invocations cover the listed claim, dispatch, submit, resume, dirty-start, contention, invalid-transition, missing-report, handoff, read-only, and idempotency flows, but none simulates an interruption or exercises recovery of a persisted journal. This is an explicit criterion, not merely absent historical RED evidence. |
| 10. Help/guidance and Just validation; no automatic execution/Git mutation | **PASS.** Help and shipped/local guidance reflect the command contract. Inspected workflow operations use Git for read-only checks/revision lookup and do not launch agents or stage/commit. Supplied Just-based validation passed. |

The required recovery-test omission is a demonstrated failure of criterion 9
and leaves criterion 7's interruption behavior unverified.

## Quality

**Verdict: FAIL**

The implementation has useful safeguards: mutation paths share a short-lived
lock; writes use a recovery journal; successful submissions retain a digest and
are idempotent; and `status` blocks on missing or altered submitted reports.
The relevant existing issue/create/status and packaged flows are included in
the supplied regression evidence. No material unnecessary complexity was
identified in the assigned change.

However, the central failure-recovery path is not protected by a test at the
public CLI seam. The current resume test runs after a completed dispatch, and
the concurrency tests run successful complete commands; neither exercises a
process stopping after the journal is persisted or after only one of the issue
and ledger files is replaced. Those are exactly the boundaries where recovery
must preserve assignment identity and avoid duplicate audit history. This
coverage gap blocks a quality pass.

## Findings

### I03-F01 — No public-CLI test for interrupted dispatch/write recovery

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `tests/sdd-workflow.test.ts:280-362, 796-893` (successful
  resume/concurrency coverage only); recovery implementation at
  `src/commands/sdd/sdd-command.ts:1660-1733`.
- **Defect:** The explicit acceptance criterion requires public CLI tests for
  interruption, but the test suite only resumes a fully persisted assignment
  and exercises fully completed concurrent dispatch/submission. No test leaves
  a recovery journal or one-sided issue/ledger write and invokes `resume` or a
  retry.
- **Impact:** A regression that reallocates an assignment, loses a partially
  recorded dispatch, or duplicates the audit entry after a crash would not be
  caught. Controller-supplied green tests do not cover this failure path.
- **Required correction:** Add deterministic public CLI coverage for an
  interrupted dispatch at a journal/write boundary, then resume or retry in a
  separate invocation. Assert recovery returns the original assignment ID and
  report path, restores a consistent ledger/issue state, and does not duplicate
  dispatch history. Include an interruption after one target has been replaced
  if the recovery contract supports that boundary; exercise submission recovery
  too if it shares the same behavior.

## Observations and remaining context

- The implementation report honestly records that some coverage was added after
  implementation and that historical RED evidence is not available for those
  cases; this is not itself a finding. The missing recovery scenario is a
  current coverage gap.
- Supplied checks are focused on this ticket and related regressions; the full
  project suite was not run. No additional unrelated defect was established
  from that limitation.
- Scope is issue 03 only; this report does not verify the later workflow
  commands or aggregate/full-spec delivery criteria.
