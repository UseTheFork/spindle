# Review inputs

Read when preparing or accepting a review assignment. The controller supplies these inputs once per frozen review batch; all reviewers consume the same change and verification identity. A durable review-package reference is a transport for existing inputs, not a new artifact generator or a replacement for provenance.

## Common input contract

`REVIEW_INPUTS` names an absolute, read-required package/manifest path. Read it and its required sources before inspecting the checkout or reviewing. Equivalent structured inputs inline remain valid; preserve supplied values rather than inferring missing revisions from Git.

| Input                  | Required meaning                                                                                                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirements           | Canonical ticket/spec/comments pointers, applicable instructions, criteria, and constraints. Identify inapplicable sources explicitly.                                                                                                                         |
| Workspace and snapshot | Absolute ticket or feature worktree, as appropriate; exact reviewed identity, comparison base and head revisions, and included dirty/untracked changes or `NONE`. SHAs are provenance metadata and may live in the package rather than repeated prompt fields. |
| Complete change        | Complete assigned diff with file inventory, stat, and enough context, or approved read-only retrieval using supplied revisions. Include dirty/untracked additions and binary changes, or identify unavailable material as a coverage gap.                      |
| Verification           | Commands, results, test summary, exact snapshot covered, and unavailable required checks. Evidence pointers are valid; read them before judging coverage.                                                                                                      |

Keep every meaning authoritative in one place: reference canonical requirements, reports, and evidence rather than copying full logs or the entire ledger. A pointer must identify the required material, not merely say "see ledger". The role-specific assignment supplies phase, objective, history relevant to that role, and its distinct report destination.

## Snapshot ownership and completeness

The controller owns construction, freezing, and freshness checks. Reuse existing durable complete diffs and evidence; no additional packaging command or hash scheme is required. Ticket reviews must cover the exact committed ticket revision and its complete change against the assigned base. Keep that worktree clean and frozen throughout the review batch; reports are written to the canonical feature workspace.

Corrections produce a new reviewed identity with fresh covering checks. Preserve the previous package and evidence as history rather than relabeling them as verification of changed code.

Reviewers inspect the supplied change and enough matching surrounding code to support their role. Complete supplied diffs take precedence over independently reconstructing Git ranges. Legacy revision-based assignments remain valid: retrieve missing diffs only with approved read-only tooling and supplied revisions, accounting for supplied dirty/untracked changes. Missing or inconsistent inputs require `NEEDS_CONTEXT` before review; required evidence that is stale, failing, or unavailable prevents approval. If surrounding code no longer matches the assigned snapshot, report the mismatch to the controller.

**Assignment complete when:** required inputs are resolved and consistent, including a precise review scope and report destination. **Review evidence sufficient when:** the diff covers the assigned change and required passing checks cover that same snapshot. These are distinct gates; supplied claims are not proof of correctness.
