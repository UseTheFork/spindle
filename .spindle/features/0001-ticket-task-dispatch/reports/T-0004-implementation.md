# T-0004 Implementation Report

**Status:** DONE

**Checkout:** `/home/nixos/.copilot/session-state/7ea7f718-aea2-497a-bdb3-c9bd27b0cb67/files/sdd-worktrees/0001-ticket-task-dispatch-T-0004`

## Summary

Committed the T-0004 task-first ticket workflow on the assigned ticket branch in one local commit. The controller now needs a task plan before starting a ticket worktree. Ticket implementation submission, integration, and post-merge closure are blocked until every task is accepted. New ledgers use schema version 4, with a scoped one-time conversion for the active `0001-ticket-task-dispatch` schema-version-3 ledger at feature start; other schema-version-3 workspaces remain unsupported.

The controller-led shared-worktree, task-report, combined-commit, and ticket-report sequence is documented for operators and implementers. ADR-0014 records that controller-owned combined task commits supersede the older worker-commit assumption for task-based ticket execution while preserving ticket-level checks, review, integration, and post-merge validation.

No uncommitted changes remain in the assigned checkout. The report below is the only write made in the canonical feature workspace.

## Acceptance criteria

1. **Task plan required before implementation:** `AssignmentService` rejects a start without tasks and explains that tasks must be defined first. Regression test verifies no assignment or worktree is created.
2. **Submission and completion blocked until acceptance:** implementation submission reports each unaccepted task state; `AcceptancePolicy` blocks integration; post-merge closure reports unaccepted tasks and leaves the ticket open. Tests cover unassigned, assigned, submitted, and changes-requested tasks at submission, plus integration and closure guards.
3. **One ticket report after task acceptance:** the existing ticket implementation assignment/report path is retained; submission proceeds after all tasks are accepted. The task completion integration fixture exercises that sequence.
4. **Existing final gates retained:** the accepted-task workflow fixture runs ticket checks and review before integration, then exercises post-merge validation. The closure test confirms that passing post-merge checks cannot bypass task acceptance.
5. **Scoped schema rollout:** new ticket records require a `tasks` array and new feature ledgers use schema version 4. Only the active task-dispatch feature's schema-version-3 ledger is normalized and physically migrated when its feature worktree starts. Tests verify the conversion and reject schema version 3 for another feature.
6. **Guidance updated:** the orchestrator and implementer blueprints and ticket-tracker source/mirror describe controller-owned commits, shared worktrees, task reports, and task-before-ticket completion. ADR-0014 records the commit-ownership decision; the SDD glossary distinguishes task reports from ticket implementation reports.

## Changed files

- `assets/Blueprints/agents/sdd-implementer.agent.md`
- `assets/Blueprints/agents/sdd-orchestrator.agent.md`
- `assets/Templates/project/ticket-tracker.md`
- `docs/agents/ticket-tracker.md`
- `docs/adr/0014-controller-owned-ticket-task-commits.md`
- `src/SubagentDrivenDevelopment/Commands/ImplementCommand.ts`
- `src/SubagentDrivenDevelopment/GLOSSARY.md`
- `src/SubagentDrivenDevelopment/Models/Workflow.ts`
- `src/SubagentDrivenDevelopment/Persistence/FeatureWorkspace.ts`
- `src/SubagentDrivenDevelopment/Persistence/LedgerRepository.ts`
- `src/SubagentDrivenDevelopment/Policies/AcceptancePolicy.ts`
- `src/SubagentDrivenDevelopment/Policies/TaskPlanPolicy.ts`
- `src/SubagentDrivenDevelopment/Services/AssignmentService.ts`
- `src/SubagentDrivenDevelopment/Services/ChecksService.ts`
- `src/SubagentDrivenDevelopment/Services/FeatureCreationService.ts`
- `src/SubagentDrivenDevelopment/Services/FeatureWorktreeService.ts`
- `src/SubagentDrivenDevelopment/Services/SubmissionService.ts`
- `src/SubagentDrivenDevelopment/Services/TaskService.ts`
- `src/SubagentDrivenDevelopment/Services/TicketService.ts`
- `tests/Helpers/SubagentDrivenDevelopment/TicketWorktreeFixtures.ts`
- `tests/Helpers/SubagentDrivenDevelopment/WorkflowServices.ts`
- `tests/Helpers/SubagentDrivenDevelopment/helpers.ts`
- `tests/Integration/SubagentDrivenDevelopment/Commands/Start.test.ts`
- `tests/Integration/SubagentDrivenDevelopment/Persistence/LedgerRepository.test.ts`
- `tests/Integration/SubagentDrivenDevelopment/Services/Create.test.ts`
- `tests/Integration/SubagentDrivenDevelopment/Services/Tasks.test.ts`
- `tests/Integration/SubagentDrivenDevelopment/Services/TicketTaskCompletion.test.ts`
- `tests/Integration/SubagentDrivenDevelopment/Services/TicketWorktreeDispatch.test.ts`

## Verification

- **Run by implementer on committed changes:** `pnpm exec vitest run tests/Integration/SubagentDrivenDevelopment/Commands/Start.test.ts tests/Integration/SubagentDrivenDevelopment/Persistence/LedgerRepository.test.ts tests/Integration/SubagentDrivenDevelopment/Services/Create.test.ts tests/Integration/SubagentDrivenDevelopment/Services/Tasks.test.ts tests/Integration/SubagentDrivenDevelopment/Services/TicketTaskCompletion.test.ts tests/Integration/SubagentDrivenDevelopment/Services/TicketWorktreeDispatch.test.ts` — passed; 6 files and 61 tests.
- An earlier pre-commit run had 52 passing and 9 failing tests because the initial task-plan freeze rejected synthetic task fixtures. The freeze was narrowed to recorded ticket implementation assignments; the committed focused run then passed.
- `git diff --check` completed without errors. Ticket-tracker source and generated mirror task guidance were compared and match.
- Formatting: ran `pnpm exec oxfmt` on the 23 changed TypeScript implementation and test files before the commit.
- Not run by implementer: TypeScript checks, oxlint, and the complete SDD integration/regression suite. These were assigned to the controller and remain pending there; they are not implementer failures or evidence of ticket acceptance.

## Self-review and concerns

No known implementation issues remain. The task plan is frozen after a ticket implementation assignment to prevent changing the reviewed task set. The migration is limited to the named active feature and is not run against other schema versions. `.github` and the feature ledger were not edited by this worker. The assigned checkout is clean after commit.

## Hand-back

T-0004 implementation and focused scheduled checks are complete. The controller can run the assigned broader SDD integration, type, and lint checks before ticket-level review and integration.
