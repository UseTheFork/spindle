# Review inputs

Read when preparing or accepting a review assignment. The controller supplies these inputs once per frozen review batch; all reviewers consume the same committed change, authoritative requirements, and verification results. A durable review-package reference is a transport for existing inputs, not a new artifact generator or a replacement for provenance.

## Common input contract

`REVIEW_INPUTS` names an absolute, read-required package/manifest path. Read it and its required sources before inspecting the checkout or reviewing. Equivalent structured inputs inline remain valid. Review the exact committed target named by the assignment; do not copy, compare, or pass commit IDs by hand.

| Input                | Required meaning                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Requirements         | Canonical ticket/spec/comments pointers, applicable instructions, criteria, and constraints. Identify inapplicable sources explicitly.                                                                                   |
| Workspace and target | Absolute ticket or feature worktree, exact committed target and comparison base, and the canonical feature spec/ticket requirements that apply.                                                                          |
| Complete change      | Complete assigned committed diff with file inventory, stat, and enough context, or approved read-only retrieval from the assigned target. Uncommitted review-affecting changes are not part of an acceptable assignment. |
| Verification         | Commands, results, test summary, exact committed target covered, and unavailable required checks. Evidence pointers are valid; read them before judging coverage.                                                        |

Keep every meaning authoritative in one place: reference canonical requirements, reports, and evidence rather than copying full logs or the entire ledger. A pointer must identify the required material, not merely say "see ledger". The role-specific assignment supplies phase, objective, history relevant to that role, and its distinct report destination.

## Commit and requirements ownership

The controller owns assignment construction, freezing, and freshness checks. Reuse existing durable complete diffs and evidence; no additional packaging command or content hash scheme is required. Ticket reviews cover the exact committed ticket revision and its complete change against the assigned base. The committed requirements in the ticket branch must match the canonical feature spec and ticket requirements. Reject uncommitted requirements and stale ticket branches. Keep the worktree clean and frozen throughout review; reports are written to the canonical feature workspace.

Corrections produce a new commit and require fresh covering checks and focused rework review. When an assignment includes `reworkBaseSha`, use its workflow-owned comparison base to inspect the rework diff and prior findings, with the full ticket available for context. The complete inventory remains the acceptance boundary; do not repeat completed initial coverage unnecessarily. Preserve prior reports and evidence as history; approval of one commit never approves a later commit.

Reviewers inspect the supplied change and enough matching surrounding code to support their role. Complete supplied diffs take precedence over independently reconstructing Git ranges. If a committed target, required requirements, or verification result is missing or inconsistent, return `NEEDS_CONTEXT` before review. Stale, failing, or unavailable required evidence prevents approval. Report any mismatch between the assigned target and the specified worktree to the controller.

**Assignment complete when:** required inputs are resolved and consistent, including a precise review scope and report destination. **Review evidence sufficient when:** the diff covers the assigned commit and required passing checks cover the same committed code and requirements. These are distinct gates; supplied claims are not proof of correctness.
