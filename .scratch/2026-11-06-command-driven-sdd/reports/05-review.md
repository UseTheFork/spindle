# Issue 05 — Initial Spec and Quality Review

## Scope and snapshot

- **Phase/scope:** Initial review of issue 05 only.
- **Snapshot:** Base and HEAD `395773f0d3fa0ed91c550185bac51f3d2c505381`, plus the frozen tracked working-tree change with SHA-256 `243f11261f56b59f70defece47fde51d57af9cdaf1b8b4069cbb80c839854b85`. No untracked implementation files were reported at freeze.
- **Change inventory:** `docs/agents/issue-tracker.md`, `docs/agents/tooling.md`, `src/blueprints/agents/sdd-reviewer.agent.md`, `src/blueprints/catalog.ts`, `src/commands/sdd/sdd-command.ts`, `tests/catalog.test.ts`, `tests/install.test.ts`, and `tests/sdd-workflow.test.ts`. The frozen issue comment records each file SHA-256.
- **Requirements:** Issue 05 and its Comments section; feature `spec.md` and `design.md`; applicable repository instructions, tooling/domain guidance, glossary, and ADRs 0003/0004, as supplied in `REVIEW_INPUTS`.
- **Diff:** Complete assigned diff retrieved read-only with `just tool::git diff` for the supplied inventory. Issue 04 is integrated; no prior issue 05 review findings or rulings were supplied.

## Evidence and limitations

Controller-supplied checks on the frozen snapshot: formatter passed; 88 focused tests passed; packaged CLI tests passed (5); targeted lint, type-check, build, and `git diff --check` passed. The full project test suite was not run. I inspected the supplied diff, matching implementation, reviewer Blueprint, docs, and tests; I did not run checks. The implementation report's missing positive-path test for a valid unavailable review submission is relevant to finding `05-Q02`.

## Spec

**FAIL.** The slice substantially implements the requested initial review/accept workflow and does not claim to implement finding registration, corrective gates, or aggregate/full-spec CLI workflows. However, the two blocking defects below violate the review inventory and submission contracts.

- **Reviewer Blueprint/catalog:** Reviewer v1.1.0 now describes the comprehensive role and initial/corrective/aggregate assignment contracts. Agent-only `canReview` is boolean-validated and preserved; `sdd-reviewer` is marked eligible. Installation/catalog tests cover the lifecycle.
- **Dispatch/freeze/assignment:** `review` requires a submitted implementation report, current passing required checks, and controller-supplied inventory; it persists unique initial assignments binding reviewer, scope, snapshot, and report destination, and reuses them on repeated dispatch. Inventory ordering has a valid-path defect (`05-Q01`).
- **Submission/provenance:** Assignment, report destination, author, explicit result, and report digest are validated; stale content and altered reports are detected. The implementation requires a no-findings attestation even for failed/unavailable outcomes, preventing honest recording of those outcomes when findings exist or could not be assessed (`05-Q02`).
- **Acceptance:** Acceptance revalidates current required checks, implementation report, complete initial reviewer coverage, reviewer result, no-findings attestation, snapshot/inventory, and registered report digest. Failure/unavailable outcomes do not pass the gate.
- **Freeze/recovery/idempotency:** CLI check requirements cannot change while review assignments are active; later gates detect changed content. Repeated dispatch/submission and recovery reuse persisted assignments/results. The changed implementation does not add later finding/corrective/full-spec functionality.
- **CLI tests/docs:** Public workflow tests cover the clean finding-free path, invalid provenance, stale evidence, interruptions, and idempotency. The positive unavailable-result path is not tested, and mixed-case inventory paths are not covered.

## Quality

**FAIL.** The workflow is organized around public CLI tests and persistent, digest-bound evidence, with good coverage for the ordinary finding-free acceptance path and stale-input rejection. The inventory ordering inconsistency prevents some valid review dispatches, and the submission contract forces an inaccurate finding-free declaration for failed/unavailable reviews. The known positive unavailable-path test gap compounds the latter. No separate material unnecessary-complexity finding is established.

## Findings

### 05-Q01 — Canonical inventory sorting differs between producer and validator

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:1635-1642` and `:2532`
- **Defect and impact:** `#changedPaths()` returns paths using default JavaScript `.sort()`, while `review()` sorts the supplied inventory using `localeCompare()` before comparing it to that result. Those orderings differ for valid path sets such as mixed-case names (for example `B.ts` and `a.ts`): the internally produced canonical order is `B.ts, a.ts`, while locale sorting yields `a.ts, B.ts`. Consequently, no ordering of that valid supplied inventory survives normalization to match the internal result, and review dispatch is rejected despite an exact Git-derived inventory.
- **Required correction:** Compare path sets independent of input ordering, or use one identical deterministic comparator for both paths; add a public CLI regression test with a mixed-case inventory.

### 05-Q02 — Failed/unavailable review submission requires a no-findings attestation

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:1917-1928` and `:2000-2001`; test `tests/sdd-workflow.test.ts:523-556`
- **Defect and impact:** `#submitReview()` rejects every result unless `options.noFindings === true`, and then persists `noFindings = true` for every submitted result. This includes `failed` and `unavailable`, despite those outcomes being explicitly supported and required to carry details. A failed review that found defects, or an unavailable review that could not assess findings, cannot be truthfully registered: the CLI forces the controller to attest there were no findings. The current test exercises only missing-details rejection and a failed submission that includes `--no-findings`; it does not demonstrate a valid unavailable submission.
- **Required correction:** Require exclusive `--no-findings` for the finding-free passing path. Allow failed/unavailable results with required details without asserting no findings, and ensure they remain blockers to acceptance. Add positive-path tests for valid failed/unavailable submissions and verify they cannot satisfy acceptance.

## Observations and remaining context

- The implementation report's concern about a valid unavailable submission is confirmed as a coverage gap; the behavior is additionally blocked by `05-Q02` when no-findings cannot honestly be attested.
- Evidence is focused and current for the supplied frozen snapshot, but the full project suite was not run. I did not independently verify check execution.
- This report does not assess later finding registration/rulings, corrective workflow, aggregate/full-spec gates, integration, or acceptance/integration state.
