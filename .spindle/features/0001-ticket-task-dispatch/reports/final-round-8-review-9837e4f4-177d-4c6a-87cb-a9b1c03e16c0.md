# Feature review — delivery, corrective round 8

## Verdict

`passed` (no blocking defects; not `changes-requested`).

## Summary

- Target: delivery review assignment `9837e4f4-177d-4c6a-87cb-a9b1c03e16c0`, feature `0001-ticket-task-dispatch`, assigned committed head (subject `fix: relocate submitted task worktrees and embedded report paths`), against the feature baseline.
- The round-8 change applies controller ruling R-1 correctly:
  - `TaskSchema` still requires an absolute `worktree` on unsubmitted assignments. Submitted assignments may omit `worktree`; if present, it must be absolute.
  - `relocate` removes a submitted assignment's `worktree` when it equals a cleanup target and maps it to `journal:execution-location`.
  - `relocate` rejects an unsubmitted assignment at a target before any merge.
  - Absolute feature-report paths embedded in finding-history prose are rewritten to the original checkout and recorded as digest mappings. Residual target paths still fail closed.
- Whole-feature requirements remain covered. Compared with the round-7 reviewed target, the only source/test change is this commit. Task planning, dispatch, reservations, dependencies, controller-only state changes, the task-before-ticket gates, and accepted-report integrity are unchanged and still in place.
- Findings: three non-blocking (embedded-path guard bypass, finalization fixtures masking realistic task worktrees, an untested handoff guard). F-0002 remains open and non-blocking.

## Evidence and limitations

**Target identity (run by me).**
- The assigned worktree is clean.
- Current branch HEAD differs from the assigned head only in `.spindle/features/0001-ticket-task-dispatch/{sdd.json,reports/final-round-8-fix.md}` (`git diff <assigned head> HEAD -- . ':!.spindle'` is empty).
- The aggregate inventory has 77 non-record paths, matching the assignment inventory count of 77.
- `git diff --stat` from the round-7 reviewed head to the assigned head (excluding `.spindle`) contains only the 7 files of the round-8 commit.

**Inspected.**
- Spec, tickets via prior reports, the round-7 review, and the round-8 fix report, including its superseded NEEDS_CONTEXT draft.
- Applicable instructions: constitution, testing, code-commenting, TypeScript.
- The full round-8 diff.
- `FeatureFinalizationService` `relocate` (lines 727–827), its caller (line 245), `finalCheckout` mapping verification (lines 900–923), metadata-phase `validateLedger` (line 951), `verifyJournal`, `real`, and `inside`.
- `TaskSchema.validate` / `validateAssignment`.
- `TaskService` create, update, assign, instructions, submit, accept, requestChanges, assertController, and handoff.
- `TaskPlanPolicy` gates and their call sites: `AssignmentService:151`, `SubmissionService:114`, `TicketIntegrationService:214`, `ChecksService:344`, `AcceptancePolicy:36`.
- `WorkspaceTransaction.run`, which has no rollback.
- All readers of `TaskAssignment.worktree`. The only production reader is `TaskService.handoff`; the other `.worktree` uses are `TicketProgress.worktree`.
- The finalization and task-plan fixtures.

**Checks I ran.**
- `pnpm exec vitest run` on `FeatureFinalizationGuards.test.ts`, `Tasks.test.ts`, and `DeliveryRetrospective.test.ts`: 3 files, 30 tests passed. The run left the worktree clean.
- A node probe of the exact `embeddedReports` regex construction (results under Finding 1).
- An in-memory, read-only `relocate` of the real ledger using the session relocation-check approach, with the cleanup targets computed the way `finish` computes them.
  - Before this report existed, `relocate` threw ENOENT for this review's own pending report path. That is expected: the existing `report`-key branch requires recorded reports to exist.
  - After substituting that path in memory, relocate produced 118 mappings (44 unique) and left no target paths.
  - The T-0005 TASK-0001 assignment keys no longer include `worktree`.
  - With the substituted path, full `LedgerRepository.validateLedger` gave no meaningful result: the substitution itself breaks the report-naming rule, so even the un-relocated ledger failed. The appendix records a re-run without substitution after this report existed; it passed.

**Supplied by the controller, not run by me.** On the record commit `86ab54d` (same code as the assigned head):
- `pnpm run build`: pass.
- `pnpm test`: 90 files, 652 passed, 1 expected fail.
- `pnpm run lint`: pass.
- Scoped `oxfmt --check`: pass.
- `finish-relocation-check.mts`: pass, 116 mappings.

**Not run by me:** the full suite, build, lint, format, and any live `sdd finish`. I used `pnpm exec vitest` rather than a Just recipe for the focused run.

## Findings

### 1. Embedded-report rewrite accepts `.md` followed by `.` and arbitrary continuation, bypassing the residual-path guard

- **Blocking:** no.
- **Evidence:**
  - `src/SubagentDrivenDevelopment/Services/FeatureFinalizationService.ts:745-748`: the lookahead `(?=$|[\s.,:;)"'\`])` accepts `.` regardless of what follows.
  - `FeatureFinalizationService.ts:804-818`: the replacement and the residual guard.
  - My node probe with the same construction and sourceRecords `/w/feat/.spindle/features/F`:
    - `…/reports/a.md.bak now` matched `…/reports/a.md`.
    - `…/reports/a.md./../../../../src/x.ts now` matched `…/reports/a.md`.
  - In both cases only the `a.md` prefix is replaced and digest-checked. The remaining suffix then refers to the original checkout. No target workspace string remains, so the "Embedded workflow path cannot be silently rewritten" guard does not fire.
  - Separately, `…/reports/a.md,b.md` matches as a single file name. That fails closed, but with a raw `lstat` ENOENT message instead of the guard error.
- **Impact:**
  - The code comment says the change "relocate[s] only exact report files". In practice, a prose token that starts with an existing report path and continues with `.` (for example `x.md.bak`, `x.md.d/…`, or a `..` traversal) is silently rewritten without verifying the actual referenced path.
  - Exploiting this requires unusual controller-authored history text. SDD-generated history (`Registered from <path> at commit …`) is handled correctly, and the real ledger relocates cleanly. The risk is therefore latent, not observed.
- **Required correction:**
  - Accept `.` only as sentence-final punctuation, for example `(?=$|[\s,:;)"'\`]|\.(?=$|\s))`.
  - Add negative cases to the guard test for `x.md.bak` and `x.md./…`; both should hit the embedded-path error.
  - Optionally map a non-existent embedded match to the guard error instead of raw ENOENT.

### 2. Finalization fixtures still hide the realistic task-assignment worktree that caused this round's failure

- **Blocking:** no.
- **Evidence:**
  - `tests/Integration/SubagentDrivenDevelopment/Fixtures/TaskPlans.ts:53` seeds accepted assignments with `worktree: dirname(root)`, which is not a cleanup target, and with reports outside the feature records.
  - `TaskPlans.ts:71-85`, `rehomeTaskWorktreeForFinalizationFixture`, is still called before finish at `DeliveryReadiness.test.ts:26,216-217` and `DeliveryRetrospective.test.ts:19,46` to move task worktrees off the cleanup targets.
  - The real `TaskService.assign` always records the ticket worktree (`TaskService.ts:210-236`).
  - Only the new guard test exercises the realistic shape, and it does so through a direct ledger rewrite (`FeatureFinalizationFixture.ts:298-311`), on a single ticket.
- **Impact:**
  - These workarounds are why the defect escaped before round 8, and they are now unnecessary.
  - Multi-ticket finish (`DeliveryReadiness.test.ts:216-219`) and retrospective finish never exercise target-equal task worktrees or relocation of in-records task reports.
  - A regression in the new branch would therefore be caught by only one single-ticket test.
- **Required correction:**
  - Remove `rehomeTaskWorktreeForFinalizationFixture` and its calls, so finalization flows keep the ticket worktree recorded by assignment.
  - Preferably, have the finalization fixtures produce task assignments through the real assign/submit/accept commands, or at least seed `worktree` with the ticket worktree and the report inside feature `reports/`.

### 3. New handoff guard is untested

- **Blocking:** no.
- **Evidence:** `src/SubagentDrivenDevelopment/Services/TaskService.ts:473-475` adds `Task <id> assignment has no recorded ticket worktree.`. No test reaches it. The new schema test (`Tasks.test.ts:230-266`) validates the relaxed ledger but does not call `instructions`.
- **Impact:**
  - After R-1, an active ledger may hold a submitted or changes-requested assignment without `worktree`. That state is reachable only through unsupported direct edits.
  - `task instructions` on such a ledger should fail with this clear message rather than produce a handoff missing `sharedTicketWorktree`. That behavior is currently unverified.
- **Required correction:** add a focused test that validates such a ledger and asserts that `instructions` rejects it with the new message and makes no ledger change.

## Corrective finding status

- **F-0002** (task assignment can persist when handoff generation fails): **NOT ADDRESSED**. Still non-blocking.
  - `TaskService.assign` still persists the ledger (`TaskService.ts:245`) before `handoff` (`TaskService.ts:246`).
  - `handoff` can throw from `markdownSection` (`TaskService.ts:496-505`) and now also from the new worktree guard.
  - `WorkspaceTransaction.run` (`Persistence/WorkspaceTransaction.ts:34-48`) does not roll back on throw.
  - Round 8 did not target this finding.
- **F-0001**: recorded as fixed; not in this round's scope. The gate code it relies on is unchanged since the round-7 target and still wired at `SubmissionService:114`, `TicketIntegrationService:214`, and `ChecksService:344`.

## Observations and remaining context

- **R-1 conformance (inspected).**
  - `TaskSchema.ts:26-27` enforces exactly the ruling.
  - `relocate` (`FeatureFinalizationService.ts:765-775`) strips a target-equal `worktree` only when its object has `submittedAt`, otherwise it throws before merge.
  - This is defense in depth. All assignments at finish should already be submitted:
    - `assertController` requires `execution === "implementing"` for every task state change.
    - The task plan is frozen once implementation is assigned (`TaskPlanPolicy.assertEditable`).
    - `assign` only moves `changes-requested` (submitted) assignments into history.
    - Closure gates require every task to be accepted.
- **Schema relaxation impact.**
  - The relaxation applies to active ledgers as well as finished ones; the schema has no finished-state context. R-1 approves this.
  - The only production reader of `TaskAssignment.worktree` is `TaskService.handoff`, which is now guarded.
  - `assign` always writes `worktree`.
  - `TaskHandoff.sharedTicketWorktree` remains a required field.
- **Mappings and downstream verification (inspected).**
  - Embedded-report mappings carry `sha256` and are re-verified against the merged original checkout in `finalCheckout` (`FeatureFinalizationService.ts:918-922`).
  - `journal:execution-location` mappings are skipped there.
  - The only other `mappings` consumer, the retrospective check at line 718, uses `.some` on its own mapping, so it is unaffected.
  - Duplicate mappings are frequent (real ledger: 118 total, 45 unique) because the same report appears in `report` keys, provenance, and history prose. They cause redundant verification only. Deduplicating is optional.
- **Recommendation (not a required fix): validate the relocated ledger before merge.**
  - The relocated ledger is first schema-validated after merge, in the metadata phase (`FeatureFinalizationService.ts:951`).
  - Round 8 adds structural key deletion to `relocate`. The superseded draft in `final-round-8-fix.md` shows that a relocate/schema mismatch then surfaces only after merge.
  - Calling `validateLedger` on the relocated ledger when the journal is created (near line 245) would make such mismatches fail before merge.
- **Anchoring behavior (probe).**
  - The lookbehind correctly refuses `x=/…/reports/a.md` and `…/reports/sub/a.md`; both fall through to the residual guard and fail closed.
  - Feature-workspace paths that are string prefixes of other paths also fail closed through the `includes` residual check.
- **Comments.** The three new comments explain non-obvious constraints, as the commenting instruction requires. The one in `relocate` overstates exactness until Finding 1 is fixed.
- **Controller decisions.** Whether to correct the non-blocking Findings 1–3 or F-0002 before finish is a controller ruling.
- **Not verified by this report.** Full-suite, build, lint, and format results (supplied evidence only), and a live `sdd finish` on the real ledger.

## Appendix — diagnostic re-run after writing this report (run by me)

- Ran in memory and read-only (the worktree's only untracked file is this report), with no path substitution, using `tests/Helpers/ApplicationFixture` and `LedgerRepository` from the assigned code.
- `validateLedger` on the current real ledger, with the feature worktree as workspace root: ok.
- `relocate` with the finish target set: 118 mappings (45 unique); 0 target paths remain.
- `validateLedger` on the relocated ledger, with `/home/nixos/source/spindle` as workspace root (as the metadata phase does): ok.
- Full schema validation of the real relocated ledger is therefore verified for the current ledger contents. Later ledger records would need re-checking.
