# Issue 08 corrective review — Round 1

## Scope and snapshot

- **Phase/scope:** Corrective review of attempt 1, scoped to supplied finding `I08-R1` and fix-induced regressions. This is not a renewed comprehensive review of issue 08.
- **Workspace and identity:** `/home/sincore/source/spindle`; HEAD `264cecaeca20097d7a1964ef957df424eb33592b` (independently confirmed), plus the frozen worktree changes. Fix-only paths and SHA-256:
  - `src/commands/sdd/sdd-command.ts` — `fcbaff8e0c27673c6ad9441f049ccf0236242ef9e01482209ff865ec1b8a746c`
  - `tests/sdd-workflow.test.ts` — `e62c6b7b6531b82099bbc3eaf1521a9e6b49f66c4738d8d37e941eb5b3f928a4`
- These hashes match the supplied fixed identity. The other issue-08 implementation paths remain at the initial-review snapshot per the supplied inputs; controller tracker/report paths are excluded from product identity.
- **Comparison/scope:** Fix-only changes against the prior review, whose frozen identity is recorded in `reports/08-review.md`. I inspected the resume changes and regression, plus surrounding resume/next-action and review/acceptance paths. No other change paths were assigned.
- **Canonical requirements and history:** issue 08 and its comments/rulings; prior comprehensive report `reports/08-review.md`; attempt-1 implementation report `reports/08-implementation.md`; feature `spec.md`/`design.md`; and `GLOSSARY.md`. The recorded issue-08/issue-10 ruling is retained: delivery-scoped operations belong to issue 10, which reuses issue-08 correction contracts with independent history. This report does not reconsider that ruling or review delivery-scope implementation.

## Evidence and limitations

- **Controller-supplied, not run by me, on the fixed snapshot:** format check, targeted lint, type-check, build, and diff check passed; focused SDD/catalog/install suite passed **110/110**; packaged CLI tests passed **5/5**. The full repository suite was not run.
- **New regression evidence:** the implementation report records an intended RED (`resolve-review-blocker` instead of `await-review-report`) and a focused GREEN (1/1); controller-supplied fresh focused suite is green on the fixed identity. I did not run these checks.
- **Personally inspected:** fixed source/test content, matching hashes, resume selection and blocker/action flow, the new public CLI regression, and existing initial-review resume and acceptance paths. No checks were run by me.
- **Coverage limits:** this scoped review does not repeat the comprehensive issue-08 review for unaffected behavior, nor assess issue 10. It retains the prior report's coverage for issue-08 areas unaffected by these two fix-only paths. Full-suite status remains unverified.

## Spec

**Verdict: PASS** for the assigned corrective scope.

- **I08-R1 contract:** When the current implementation assignment is corrective, `resume()` selects the corrective review assignments for the attempt matching that assignment. The selected set supplies the review blocker calculation, returned `reviewAssignments`, and `#nextAction` input consistently.
- **Initial coverage and ordinary resume:** The selection is only used for a corrective assignment; otherwise resume continues to use `progress.reviewAssignments`. The corrective set is used in a copied resume view, not written over the stored initial assignments. The existing acceptance path still checks initial coverage separately from latest-attempt corrective coverage.
- **Public regression:** The test submits an initial review, submits a content-changing corrective implementation, records its passing check, creates a pending corrective review, and asserts resume has no stale blocker, returns that corrective assignment, and reports `await-review-report`.
- Prior comprehensive review found no other blocking issue-08 findings and accepted the issue-10 scope boundary. That unaffected coverage is retained; this report makes no aggregate or delivery-scope claim.

## Quality

**Verdict: PASS** for the assigned corrective scope.

The branch uses the current corrective implementation assignment to select the matching attempt, then derives blocker, returned review assignments, and next action from the same selected set. This directly resolves the stale-initial-review regression without changing the persisted initial review coverage. The public CLI regression exercises the failure scenario and asserts all three required observable outcomes. Existing public coverage for ordinary pending initial-review resume remains in the focused suite and its path is unchanged by the corrective branch.

## Findings

### I08-R1 — Resume selects stale initial reviews instead of active corrective reviews

- **Severity:** Important
- **Blocking:** Yes (as supplied)
- **Location:** `src/commands/sdd/sdd-command.ts`, `resume()`; regression at `tests/sdd-workflow.test.ts` in `resume returns pending corrective reviews after initial review coverage is submitted`.
- **Original defect:** Resume used the retained initial assignments for blocker, returned reviews, and next action after a corrective implementation, although the active attempt held the current pending corrective reviews. This could direct a resumed controller to resolve a stale initial-review blocker.
- **Correction and impact:** Resume now selects review assignments from the attempt matching the current corrective implementation assignment and consistently uses them for blocker evaluation, returned assignments, and `#nextAction`. Ordinary initial-review resume and stored initial coverage remain intact.
- **Disposition:** `ADDRESSED` — matching correction inspected and fresh controller-supplied focused verification covers the fixed snapshot, including the public regression.

**New findings: NONE.**

## Observations and remaining context

- No correction-induced regression or unrelated out-of-fix discovery was identified in the scoped paths.
- Full repository suite was not run; this is an evidence limitation, not a demonstrated defect.
- The prior comprehensive review's unaffected issue-08 coverage is retained; this scoped report does not replace it or independently verify issue-10 work.
- No additional controller ruling is required by this scoped review.
