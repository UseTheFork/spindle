# Delivery correction round 7

## Status

**DONE**

## Checkout and change summary

- Checkout: `/home/nixos/.copilot/session-state/7ea7f718-aea2-497a-bdb3-c9bd27b0cb67/files/0001-ticket-task-dispatch`
- Corrected F-0001 verification so delivery source changes are compared from the repository root, not from the nested feature metadata directory. Existing workflow-record exclusion and committed-requirements comparisons remain unchanged.
- Added a delivery regression that rejects verification when no relevant commit follows the observation and accepts it after a committed feature-source change with fresh check evidence.
- The code and test are committed with no remaining uncommitted code/test changes. The assigned report is present as the only untracked file for hand-back.

## Finding-to-change and test summary

- **F-0001:** `GitEvidence.deliveryInputsPreserved` now runs its changed-path comparison from `app.workspaceRoot`. A code commit outside `.spindle/features` is therefore detected even when callers supply the nested feature workspace. The existing logic continues to exclude `.spindle/features/**` from source-change comparisons and separately verifies that committed delivery requirements are preserved.
- `DeliveryCorrections.test.ts` creates a delivery finding, verifies that marking it fixed without a relevant new commit is rejected, commits a feature source change, records a fresh delivery check, and verifies that the finding can then be marked fixed.
- No failed check was assigned to this correction.

## Checks run on the committed changes

- Focused regression:
  `pnpm exec vitest run tests/Integration/SubagentDrivenDevelopment/Services/DeliveryCorrections.test.ts -t "delivery finding verification requires a committed feature change after observation"`
  - Passed: 1 selected test; 3 other tests skipped by the selector.
- `pnpm run build` — passed.
- `pnpm test` — passed: 90 test files, 648 tests passed, 1 expected failure (649 total).
- `pnpm run lint` — passed.
- Declared diff-scoped Oxfmt check — passed on 76 files:
  `pnpm exec oxfmt --check $(git diff --name-only --diff-filter=ACMRT 6d270a6b60e7f94a47cdcc58973cf77a069ad118..HEAD | grep -v '^\.spindle/features/')`
- `git diff --check HEAD^ HEAD` — passed.

## Changed files, formatting, and self-review

- `src/SubagentDrivenDevelopment/Evidence/GitEvidence.ts`
- `tests/Integration/SubagentDrivenDevelopment/Services/DeliveryCorrections.test.ts`
- Ran `pnpm exec oxfmt` on both changed files before committing.
- Self-review confirmed the correction changes only the working directory for delivery source-path comparison. It does not alter ancestry validation, workflow-record filtering, or requirement-content comparison.
- No remaining concern identified within the assigned correction.

## Pending checks and hand-back

- No standalone `tsc --noEmit` check was scheduled or run. Any further type, feature-review, or broader delivery checks remain with the controller; they are not implementer failures or evidence of feature acceptance.
- The focused regression and required local delivery checks pass on the committed correction. F-0001’s delivery verification path now detects committed feature-source changes after an observation while retaining rejection when there is no relevant committed change.
