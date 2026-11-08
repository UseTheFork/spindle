# Issue 09 corrective review — round 1

## Scope and snapshot

- **Phase/scope:** Corrective issue review, attempt 1; scoped to supplied
  findings `I09-R1` and `I09-R2` and fix-induced regressions in issue 09.
- **Workspace/base/HEAD:** `/home/sincore/source/spindle`;
  base and HEAD `036c497929ec17e7a155b2dbc87e61041dc7fb78`.
- **Reviewed identity:** that HEAD plus the original issue-09 product changes
  and the corrective edits. I independently checked all seven product-file
  SHA-256 values against the ticket freeze comment; all match. The corrected
  command and test hashes are respectively
  `c2db9b6a1ed67a8a4c7143ed3bc9d0e5b41bc15117c6661b8de37c81c08c6c59` and
  `88f6ef61942010c16ccdea3184e90dd8ee5bdb254e41c55b085cc492accb04e6`.
  The ticket and reports are controller-owned and excluded from product
  identity.
- **Comparison/fix scope:** Corrective changes in
  `src/commands/sdd/sdd-command.ts` and `tests/sdd-workflow.test.ts`, on top
  of the original issue-09 implementation. I inspected the current relevant
  logic and public tests, the initial review and findings, the complete issue
  ticket/comments, and the corrective implementation evidence. The prior
  issue-09 review covers the unaffected initial scope; this report does not
  redo that comprehensive review.
- **Canonical requirements:** Issue 09, especially its requirements to reject
  unsafe unrelated pending changes, confirm the caller commit against
  accepted content, preserve user state, and avoid Git mutations; corrective
  decision in the ticket comment dated 2026-11-08T10:32:58Z. No additional
  requirements source was supplied for this scoped correction.

## Evidence and limitations

- **Supplied, controller-verified checks on the reviewed product snapshot**
  (not run by me): formatting on all seven product files; lint on the command
  and test; type-check; build; `git diff --check`; focused SDD/catalog/install
  regression set **119/119, 0 skipped**; packaged CLI tests **5/5**. The full
  repository suite was not run.
- **Implementation-report evidence:** the two corrective public regressions
  were reported RED before implementation and GREEN together afterward. The
  final focused regression set includes both new tests and the existing
  caller-commit mismatch test.
- **Personally inspected:** all seven supplied product hashes, current
  correction logic, the public CLI tests for both findings, relevant
  integration and index-digest code, canonical ticket/comments, initial
  review, and implementation report. I did not run project checks.
- **Limitations:** no full-suite result is available. The new staged-index
  regression exercises divergent bytes, not a mode-only mismatch; I inspected
  the implementation's explicit mode comparison. The report's broader
  initial-coverage and direct-child-of-baseline observation remain prior
  review context, not re-reviewed findings in this scoped assignment.

## Spec

**Verdict: PASS**

| Corrective requirement | Assessment |
|---|---|
| Reject unrelated pending files within the feature workspace and keep the hand-back limited to workflow-owned state | `#workflowDeliveryRecordPaths` now enumerates the feature spec and ledger, ledger-backed issue documents, and referenced report files. Both `#assertSafeIntegrationChanges` and `#deliveryRecordPaths` use that allowlist; an arbitrary feature-workspace note is rejected rather than returned as a delivery record. The public CLI regression asserts nonzero exit and unchanged user file, Git status, ledger, and accepted execution. |
| Compare accepted content and Git mode in the current index before integration confirmation | `#gitIndexContentDigest` requires exactly one stage-0 entry per accepted path, accepts only supported blob modes, and hashes mode plus blob bytes. Confirmation checks the digest before state mutation; repeated confirmation also checks it before idempotent success. The public test creates a real caller commit, stages divergent bytes, restores the accepted worktree, and verifies rejection with index, worktree, HEAD, ledger, and execution preserved. |
| No fix-induced regression in the scoped integration flow | The changed logic preserves the caller-owned commit check and existing commit-tree mismatch coverage. The supplied final regression set includes the existing caller-commit mismatch test. No blocking regression was found in the inspected corrective paths. |

## Quality

**Verdict: PASS**

The allowlist is shared between unsafe-change rejection and delivery-record
reporting, avoiding a mismatch where a path could be rejected but still
advertised (or silently advertised despite not being workflow-owned). Index
validation checks both object content and mode and rejects missing, conflicted,
or otherwise invalid stage entries. The tests exercise public CLI behavior and
assert state preservation rather than private implementation details.

The supplied checks cover the corrected snapshot, with the full repository
suite unavailable. No material unnecessary complexity or other blocking
quality defect was found within the assigned scope.

## Findings

### I09-R1 — Arbitrary feature-workspace changes are accepted as delivery records

- **Severity:** Important; **blocking:** Yes in the initial review.
- **Location:** `src/commands/sdd/sdd-command.ts:4828-4899`;
  regression `tests/sdd-workflow.test.ts:3158-3182`.
- **Disposition:** **ADDRESSED**.
- **Correction/evidence:** Pending changes are checked against the
  workflow-owned path set, and returned delivery records use that same set.
  The public CLI regression adds `.scratch/0001-claim-flow/notes.txt` and
  verifies nonzero exit without changing the note, Git status, ledger, or
  accepted execution. Supplied fresh focused tests passed.

### I09-R2 — Confirmation ignores divergent staged content for accepted paths

- **Severity:** Important; **blocking:** Yes in the initial review.
- **Location:** `src/commands/sdd/sdd-command.ts:4148-4149`,
  `:4215-4223`, and `:4941-4963`;
  regression `tests/sdd-workflow.test.ts:3184-3228`.
- **Disposition:** **ADDRESSED**.
- **Correction/evidence:** Confirmation compares the current index's stage-0
  blob bytes and mode with accepted content before recording integration and
  before idempotent success. The public CLI regression uses a real caller
  commit, stages different bytes, restores the worktree to accepted bytes,
  and verifies rejection while preserving the staged blob, worktree, HEAD,
  ledger, and accepted execution. Supplied fresh focused tests passed.

**New findings:** NONE.

## Observations and remaining context

- The corrective test does not isolate a staged mode-only difference, although
  code inspection confirms that index mode contributes to the compared digest.
  A mode-only public case would strengthen regression coverage but is not
  required to fix the demonstrated byte-divergence finding.
- The prior review's direct-child-of-baseline ancestry observation remains
  outside this corrective assignment and was not reassessed.
- No full repository suite result is available. This scoped report does not
  re-verify unaffected initial-review coverage or make an acceptance or
  integration decision.
