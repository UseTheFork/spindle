# Issue 06 — Expanded Initial Spec and Quality Review

## Scope and snapshot

- **Phase/scope:** Expanded initial review of the complete issue 06 implementation, including the first corrective attempt for `06-Q01` and `06-Q02`. This is not a corrective-only review.
- **Snapshot:** Comparison base and HEAD are both `ed1c9ee83f0fa6c057395cd03e6e1a7966b57230`. The frozen worktree change is the eight-file implementation inventory and exact SHA-256 manifest recorded in issue 06's `## Comments`. `.scratch` issue and report records are excluded from code identity. The supplied inventory, base/head, and frozen hashes are consistent with the checkout context; no additional implementation files were reported.
- **Complete change inspected:** `docs/agents/issue-tracker.md`, `docs/agents/tooling.md`, `src/blueprints/agents/sdd-reviewer.agent.md`, `src/commands/sdd/sdd-command.ts`, `tests/catalog.test.ts`, `tests/sdd-create-status.test.ts`, `tests/sdd-workflow.test.ts`, and `tests/packaged-cli.test.ts`; the complete assignment diff and relevant surrounding CLI, ledger, acceptance, and test paths were examined.
- **Canonical requirements and context:** Issue 06 and its complete `## Comments`; feature `spec.md` and `design.md`; applicable commenting, testing, and Blueprint-reference instructions; project tooling, issue-tracker and domain docs; `GLOSSARY.md`; ADRs 0003 and 0004; and the review-input, TDD/test, verification, and writing-for-agents standards. Issue 05 is integrated at the supplied base.
- **History/evidence references:** Earlier initial review `.scratch/2026-11-06-command-driven-sdd/reports/06-review.md`; corrected implementation report `.scratch/2026-11-06-command-driven-sdd/reports/06-implementation.md`.

## Evidence and limitations

- **Controller-supplied evidence for the frozen corrected snapshot:** formatting passed; targeted lint on all eight changed files passed; `just test::types` passed; `just build` passed; focused SDD/catalog/install tests passed (**99 passed, 0 failed**); post-build packaged CLI tests passed (**5 passed, 0 failed**); and `just tool::git diff --check` passed. I did not run these commands.
- **Prior-finding coverage:** The implementation report records public CLI RED/GREEN evidence for the equals-form conflict and flag-like detail value (`06-Q01`), and for linking a fresh observation to resolved findings (`06-Q02`). The controller-supplied 99-test focused run includes `tests/sdd-workflow.test.ts` on this snapshot, so the final GREEN evidence covers those paths.
- **Personally inspected:** The supplied complete change and matching source/test paths, including parsed Commander option events, finding registration/linking and ruling paths, blocker calculation, acceptance, and public tests. I ran no project checks or other focused commands.
- **Limitations:** The full project test suite was not run. The updated reviewer Blueprint has no agent-behavior baseline/retest; its content and packaged/catalog checks establish shipped guidance, not observed application of that guidance. The cross-report public CLI test directly seeds additional review-assignment records in the fixture ledger; it exercises CLI provenance/link validation but does not independently establish a public CLI path that creates a multi-reviewer batch.

## Spec

**FAIL.** Most issue 06 criteria are implemented and covered, but the fixed disposition can clear a reported blocker using verification checks for the exact same content snapshot on which it was reported (`06-Q03`).

- **Canonical registration, attribution, and IDs:** Registration requires source report, reviewed snapshot, severity, exactly one blocking choice, summary, details, and author; canonical IDs are issue-local. Source and snapshot must match a pending frozen review assignment. **Met in inspected paths and public CLI tests.**
- **Finding statuses and independent severity/blocking:** The accepted statuses are `open | confirmed | fixed | dismissed | deferred`; severity and blocking are separate. Confirmation remains unresolved; dismissal requires details; deferral requires rationale and follow-up. **Met in inspected paths and tests.**
- **Fix evidence and acceptance gates:** `fixed` requires current-snapshot evidence and all required checks to pass, but it does not require the evidence snapshot to differ from the source snapshot where the finding was observed. Thus current passing checks for unchanged reviewed content can mark a blocker fixed and allow the result to pass the blocker gate. **Not met; see `06-Q03`.**
- **Review declarations and membership:** Submission requires the complete canonical finding list or an exclusive no-findings declaration and validates exact report/snapshot membership. The previous raw-argv parsing defect is corrected: the CLI tracks parsed declaration events, and tests cover equals-form conflicts and flag-like detail values. **Met.**
- **Duplicate observations and provenance:** Explicit links preserve each report/snapshot provenance, without prose deduplication. Linking a fresh observation reopens a `fixed` or `dismissed` finding and clears stale ruling/evidence fields; the blocking bit and earlier provenance remain. Submission routes the reopened blocker to `changes-requested`, and acceptance remains blocked until it is resolved. **Met; prior `06-Q02` addressed.** The cross-report test's manually seeded assignments are a coverage limitation noted above.
- **Requirements decisions and deferral:** A blocking finding cannot be deferred without an approved decision matching the current requirements snapshot and fresh passing review coverage. Approval invalidates earlier assignments; fresh checks/review are required. **Met in inspected paths and public tests.**
- **Persistence, audit, and idempotency:** Structured findings/rulings and source provenance are persisted; attributed history is appended; identical registration, linking, ruling, and submission paths return idempotently; tested invalid updates leave persisted state unchanged. **Met in inspected paths and public CLI tests.**
- **Status/next and returning findings:** Status/next expose findings, decisions, blockers, and actions. Submitted unresolved blocking findings route to `changes-requested`; a fresh linked observation reopens a resolved finding. **Met in inspected paths and public tests, subject to `06-Q03`.**
- **Tests and shipped guidance:** Tests cover dispositions, severity/blocking independence, provenance, declarations, invalid evidence, deferral, requirements-change review, persistence, idempotency, and acceptance blockers. Tracker/tooling docs and the `sdd-reviewer` Blueprint describe the new contracts. Agent behavior remains unverified as noted above.

## Quality

**FAIL.** The implementation uses the existing public CLI and persistent ledger seams, validates report/snapshot membership, keeps source provenance, and has substantial behavior-level test coverage. The corrected declaration parser and recurrence reopening paths have fresh focused test coverage. However, the fixed-state evidence check accepts the same snapshot as the reported finding, so it can clear a blocker without any corrected content. The full suite and reviewer behavior remain unverified; these evidence gaps do not replace the demonstrated defect.

No separate material unnecessary-complexity defect is established.

## Findings

### 06-Q01 — `--findings` and `--no-findings` conflict check is bypassable

- **Severity:** Important
- **Blocking:** Yes
- **Disposition in this expanded review:** **ADDRESSED**
- **Location:** `src/commands/sdd/sdd-command.ts` submit command option handling; public regressions in `tests/sdd-workflow.test.ts`.
- **Evidence:** The correction replaces raw `process.argv` matching with Commander `option:findings` and `option:no-findings` events. Public tests reject `--findings=F-0001 --no-findings` and allow a flag-like detail value. The controller-supplied 99-test focused run covers the corrected workflow test on the frozen snapshot.
- **Prior defect:** The equals-form declaration could evade the conflict validation, while flag-like option values could be mistaken for declarations.
- **Impact/correction:** No remaining defect identified for this finding; the parsed-event check and fresh public regression coverage address the required correction.

### 06-Q02 — Linking a new observation does not reopen a fixed blocker

- **Severity:** Important
- **Blocking:** Yes
- **Disposition in this expanded review:** **ADDRESSED**
- **Location:** `src/commands/sdd/sdd-command.ts` finding-link path; public regression `tests/sdd-workflow.test.ts` test “a fresh linked observation reopens resolved findings and blocks acceptance until reverified”.
- **Evidence:** A new source observation reopens a canonical `fixed` or `dismissed` finding and clears stale ruling, follow-up, requirements-decision, and verification fields. The public CLI flow checks provenance preservation, blocker routing, blocked acceptance, and acceptance after a new fixed ruling. The controller-supplied focused run covers this test on the frozen snapshot.
- **Prior defect:** A newly linked recurrence retained an earlier resolved status and could be accepted.
- **Impact/correction:** No remaining defect identified for this finding; new observations require renewed adjudication and the corrected path has fresh covering test evidence.

### 06-Q03 — A blocker can be marked fixed on the exact snapshot that reported it

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:2346-2373` (`findingUpdate` fixed-evidence validation); demonstrated by `tests/sdd-workflow.test.ts:959` and `:1192`.
- **Defect:** For `--status fixed`, the command verifies that `--evidence` equals the current issue snapshot and that required checks pass, but does not require that snapshot to differ from the finding's source-observation snapshot. The public tests create findings from an assignment, then successfully mark them `fixed` using `assignment.snapshot`—the same snapshot from which those findings were registered. In the linked-recurrence test, the fresh assignment likewise uses the same content snapshot as the observation, and acceptance succeeds after marking the finding fixed with that same snapshot.
- **Impact:** A controller can report a blocking finding, run or record passing checks against unchanged content, mark it fixed, submit the finding as resolved, and satisfy acceptance without a corrective content change. A passing result alone does not establish that the specific reported defect was corrected.
- **Required correction:** Do not allow `fixed` on the same content/requirements snapshot as any observation being resolved. Require current verification evidence for a post-observation snapshot that reflects the correction; if the observation was invalid rather than corrected, use `dismissed` with the required explanation. Add a public CLI regression showing same-snapshot fixing is rejected and corrected-snapshot verification is accepted.

## Observations and remaining context

- The cross-report provenance test uses manually seeded assignment entries, so it validates public finding-link behavior but not public multi-review assignment creation. The implementation report and issue 06 criteria do not make that setup itself a blocker for this issue's finding-link contract.
- Run the full project suite if required by the controller's broader verification policy; it was not run for this snapshot.
- Consider a behavior-level validation scenario for the updated `sdd-reviewer` Blueprint. Current evidence validates shipped content and packaging only.
- No acceptance, integration, or execution-state ruling is made here.
