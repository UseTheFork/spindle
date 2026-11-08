# Issue 08 review — Correct with progress-based continuation

## Scope and snapshot

- **Phase/scope:** Initial review of issue 08, issue-scoped correction lifecycle.
- **Workspace:** `/home/sincore/source/spindle`.
- **Supplied base and HEAD:** `264cecaeca20097d7a1964ef957df424eb33592b`.
- **Reviewed identity:** that HEAD plus the seven product files and exact SHA-256 values recorded in issue 08's frozen-review comment. I independently checked HEAD and all seven hashes. The controller-owned issue tracker edit and implementation report are excluded from product identity.
- **Change scope:** `src/commands/sdd/sdd-command.ts`, `tests/sdd-workflow.test.ts`, reviewer/correction guidance, and agent tooling/tracker documentation. The supplied inventory did not include a textual diff; I retrieved the read-only worktree diff and inspected the changed behavior with surrounding code.
- **Canonical requirements:** issue 08 and its recorded scope ruling; feature `spec.md` (correction lifecycle, evidence, persistence and testing decisions); feature `design.md`; `GLOSSARY.md`; implementation report `reports/08-implementation.md`; and issue 10's dependency and delivery-scope requirements.
- **Scope ruling:** issue 08 provides issue-scope behavior and reusable contracts; issue 10 adds delivery-scope commands and independent delivery histories. Issue 10 explicitly depends on issue 08. That sequencing is consistent: this change does not claim delivery-scope operations, and the guidance accurately reserves them for issue 10.
- **Instructions:** applicable repository agent/tooling guidance and the required TDD, verification, and writing-for-agents standards were consulted. No repository `AGENTS.md` was present.

## Evidence and limitations

- **Controller-supplied verification on the frozen identity** (not run by me): `just format::check` passed for all seven product paths; targeted lint, type-check, build, and `just tool::git diff --check` passed; focused SDD/catalog/install tests passed **109/109**; post-build packaged CLI tests passed **5/5**. The full repository suite was not run.
- **Implementation report:** describes test-first development and prior focused RED/GREEN behavior groups; the final controller run is fresh GREEN for this identity. Historical RED logs were not supplied, so test-first history is attributed to the report rather than independently verified. This does not negate current GREEN evidence.
- **Personally inspected:** all seven exact file identities, the reconstructed diff, the issue/spec/design criteria, correction dispatch/recording, check and review evidence paths, acceptance and status behavior, resume/next-action behavior, tests, and shipped guidance. I ran no project checks.
- **Coverage limitation:** no public test exercises resuming while a corrective review assignment is pending after initial review coverage has already been submitted. The full suite is also unrun.

## Spec

**Verdict: FAIL**

- **Actionable correction dispatch:** `correct` requires confirmed findings or a currently recorded failed check, validates finding/check identity, persists the attempt and objective before returning a report assignment, and reuses a matching pending assignment.
- **History/progress:** attempts retain assignments, applicable check records, corrective review assignments/results, and explicit continuation assessments. No five-attempt cap is imposed; tests exercise six attempts. Pauses persist adjudication and resume retains it.
- **Verification and review gates:** corrective implementation uses the submission contract; check failures must be current; corrective review is scoped to the current attempt; acceptance still requires initial-review coverage and current checks. Check records support explicit path/content coverage for unaffected-evidence reuse.
- **CLI and guidance:** the command/help and agent-consumed correction guidance explain issue scope, explicit continuation/pause, evidence, and the issue-10 delivery boundary.
- **Unmet criterion:** resume does not select the active attempt's corrective review assignments. With submitted initial reviews and a later corrective review pending, it reports an obsolete initial-review blocker and the wrong next action. See `I08-R1`.

## Quality

**Verdict: FAIL**

The public CLI tests cover finding- and check-driven dispatch, assignment idempotency, continuation beyond five attempts, adjudication/resume, corrective findings, initial-review preservation, and acceptance. The implementation separates check, review, and attempt history and uses snapshot/report validation rather than trusting declarations alone. The verified focused tests/build are meaningful current evidence, but the resume defect is a real recovery-flow regression and the specified corrective-resume case lacks a regression assertion.

## Findings

### I08-R1 — Resume selects stale initial reviews instead of active corrective reviews

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:4026-4041` and `:4367-4380`; corrective review assignments are stored on the current attempt at `:2823`.
- **Defect:** When initial review has been submitted and a corrective implementation changes content, `review()` stores the pending current review under `correctionAttempts[].reviewAssignments`; the retained `progress.reviewAssignments` are the original initial assignments. `resume()` nevertheless derives `reviewBlocker`, its returned `reviewAssignments`, and `#nextAction` exclusively from `progress.reviewAssignments`. The old initial assignments are stale against the fixed snapshot, so resume can report that stale-review blocker and `resolve-review-blocker` instead of exposing the active corrective assignments and `await-review-report`.
- **Impact:** A resumed controller is directed to resolve obsolete evidence rather than continue the pending corrective review. This defeats the resume/assignment recovery contract at a normal correction boundary, even though the attempt remains persisted and `status` has separate logic to inspect it.
- **Required correction:** Make resume choose the active attempt's corrective review assignments when the current implementation assignment is corrective; derive blocker, returned review assignments, and next action from that same set. Add a public CLI regression test with submitted initial coverage, a changed corrective snapshot, pending corrective review, and an assertion that resume returns those assignments and the correct action.

No other blocking findings.

## Observations and remaining context

- The issue-08/issue-10 boundary is consistent with the ticket dependency sequence and the recorded controller ruling. Delivery-scope support is not an issue-08 defect.
- Controller-supplied full-suite status remains limited: the repository-wide test suite was not run. The issue-scoped checks listed above did pass on the frozen snapshot.
- No prior issue-08 findings or rulings beyond the supplied scope ruling were provided.
