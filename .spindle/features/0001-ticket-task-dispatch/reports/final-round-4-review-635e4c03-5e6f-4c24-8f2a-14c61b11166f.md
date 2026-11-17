# Aggregate feature review

## Verdict

`failed`

## Summary

The assigned delivery target implements the task lifecycle, shared-worktree dispatch, ticket-level gates, schema rollout, and the narrowly scoped T-0004 recovery path across the five tickets. One blocking gap remains: an accepted task report can be changed or deleted without invalidating the acceptance or preventing ticket completion. A malformed parent ticket can also leave a task assigned when handoff generation fails.

## Evidence and limitations

- Reviewed the exact workflow-assigned committed target and comparison base, the complete 74-path inventory, the feature spec, all five ticket requirements and comments, applicable repository guidance, ADR-0014, and the relevant prior implementation/review/correction reports and controller rulings. The target and required source records were accessible and consistent.
- Supplied verification recorded against the assigned delivery target: `pnpm run build` passed; `pnpm test` passed after build (90 files, 641 tests passed, 1 expected fail); `pnpm run lint` passed; the configured diff-scoped formatter check passed for 74 paths. The controller also supplied a read-only streamed formatter check of all 112 changed target paths with zero differences. I inspected these records; I did not run the checks.
- The repo-wide `pnpm run fmt:check` failure is historical baseline evidence (108 unrelated failures among 452 scanned files); per the supplied ledger rationale it is not an active required gate.
- The lifecycle and ticket-completion tests exercise submission, acceptance, reassignment, task-status gates, and integration/closure. They do not cover mutation or deletion of a task report after acceptance. I did not run tests or modify implementation/tests.

## Findings

1. **Accepted task report integrity is not checked at ticket completion.** `TaskService.ts:332-342` verifies the submitted report digest when the controller accepts the task, but `TaskPlanPolicy.ts:108-115` later treats accepted status alone as sufficient. `SubmissionService.ts:114`, `TicketIntegrationService.ts:211-218`, and `ChecksService.ts:341-345` use gates that do not revalidate task report digests; `ReportEvidence.ts:86-112` checks implementation and review reports only. Consequently, an accepted task report can be modified or removed while the task remains accepted and the ticket can proceed through submission, integration, and closure without the report matching the accepted record. **Impact:** task acceptance no longer remains auditable against the report that was reviewed, weakening the task completion gate. **Blocking:** yes. **Required correction:** verify each accepted task assignment’s stored report digest at the ticket submission, integration, and closure gates (or otherwise make the accepted evidence immutable), and add coverage that mutating and deleting an accepted report prevents completion.

2. **Assignment persists before handoff validation succeeds.** `TaskService.ts:241-246` marks the task assigned and writes the ledger before `handoff()` runs. Handoff construction can then throw at `TaskService.ts:481-500` when the parent ticket lacks a non-empty `## Requirements` or `## Acceptance Criteria` section. Since `WorkspaceTransaction.writeLedger()` persists the write immediately (`WorkspaceTransaction.ts:170-197, 232-239`), the command can report failure while leaving the assignment and its file reservations active. **Impact:** the controller receives no handoff but the task is no longer unassigned, creating confusing recovery and potentially orphaning the assignment. **Blocking:** no. **Required correction:** validate/build the handoff before persisting the assignment, or roll back the state change on handoff failure; test that an invalid parent section leaves the ledger unchanged.

## Observations and remaining context

- The supplied evidence and reviewed changes cover the feature’s task lifecycle, dependency and path-reservation behavior, task-before-ticket completion gates, existing ticket review/integration/post-merge gates, and the authorized T-0004 one-cycle recovery path. No additional blocking omission was identified in those areas.
- The failed verdict is based on the blocking task-report integrity defect above. Findings and acceptance disposition remain for the controller.
