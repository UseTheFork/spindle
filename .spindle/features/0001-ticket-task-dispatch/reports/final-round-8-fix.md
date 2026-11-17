# Delivery correction round 8 — finish relocation check

- Status: **DONE**
- Scope: delivery (TICKET_ID NONE), mode CORRECTIVE, round 8 (assignment a2f3aa88-7a53-40ab-b26b-2890a8c92537). FINDING_IDS NONE. CHECK_FAILURE: `finish-relocation-check.mts` ("Embedded workflow path cannot be silently rewritten; resolve it before finishing."). RULINGS: R-1 (controller, round 8).
- Checkout: /home/nixos/.copilot/session-state/7ea7f718-aea2-497a-bdb3-c9bd27b0cb67/files/0001-ticket-task-dispatch (branch features/0001-ticket-task-dispatch)
- Commit: one local commit on top of the assigned base, `fix: relocate submitted task worktrees and embedded report paths`, with the `Co-authored-by: Copilot …` trailer. Not pushed. The workflow captures commit identity, so this report does not copy the hash.
- Uncommitted: only this report (left uncommitted as instructed).

## Ruling R-1 applied

- `Persistence/TaskSchema.ts` `validateAssignment`: an assignment without `submittedAt` still requires an absolute string `worktree`. A submitted assignment may omit `worktree`. If `worktree` is present, it must still be an absolute string. The other rules are unchanged, including `submittedAt` ⇔ `reportSha256` and date validity.
- `Models/Tasks.ts`: `TaskAssignment.worktree` is now `worktree?: string`, with a doc comment.
- `Services/TaskService.ts` `handoff`: throws `Task <id> assignment has no recorded ticket worktree.` when the assignment has no worktree. `TaskHandoff.sharedTicketWorktree` stays a required `string`. Active assignments cannot lack a worktree at that point because the schema rejects them on read. `assign` still always records the ticket worktree.
- `Services/FeatureFinalizationService.ts` `relocate`:
  - A `worktree` key equal to a cleanup target is removed only when its object has `submittedAt`. The mapping is `{before, after: "journal:execution-location"}`.
  - Otherwise relocate throws `Cannot relocate an unsubmitted assignment worktree: <path>.`. This happens before any merge or cleanup.
  - Finish gating (inspected, `DeliveryService.assertReady`): every ticket must be closed and integrated with passing post-merge checks. Task-level status is not checked there, so this guard is the defense for task assignments.
  - `assign` only runs from `unassigned`/`changes-requested`, so `assignmentHistory` entries are normally submitted.
- The previous worker's uncommitted work in this round was kept unchanged. That work rewrote embedded `<featureWorkspace>/.spindle/features/<feature>/reports/<name>.md` paths to original-checkout destinations, with existing-file verification and sha256 mappings. Any other embedded target path still throws the embedded-path error.

## Criteria → tests

| Criterion | Test | Without src fix (run, src stashed) | With fix (run) |
| --- | --- | --- | --- |
| (a) End-to-end finish (first finish → `recordFinal` → post-merge finish) succeeds. Relocated ledger has original-checkout report paths and no feature/ticket worktree paths. The submitted task assignment has no `worktree` key. The journal maps the ticket worktree to `journal:execution-location`. | `FeatureFinalizationGuards.test.ts` › `finish relocates task worktrees and report paths embedded in finding history` | FAIL: `Cannot safely relocate recorded path: …/external/0001-feature-finalization-T-0001.` | PASS |
| (b) An unexpected embedded worktree path (not `reports/*.md`) is still rejected with the embedded-path error. HEAD and the ticket worktree are preserved. | `… › finish rejects an embedded worktree path that is not a feature report` | FAIL (a different relocate error came first) | PASS |
| R-1 relocate: an unsubmitted assignment pointing at a target is rejected, not stripped | `… › finish rejects an unsubmitted task assignment that points at a ticket worktree` (new; adds an unsubmitted `assignmentHistory` entry) | FAIL (wrong error message) | PASS |
| (c) Schema: a submitted assignment without `worktree` is accepted. A relative `worktree` on a submitted assignment is rejected. An unsubmitted assignment without `worktree` is rejected. An unsubmitted assignment with an absolute `worktree` is accepted. | `Tasks.test.ts` › `ledger validation allows a missing task worktree only for submitted assignments` (new) | FAIL: `Invalid task assignment.` | PASS |

Targeted command (both runs): `pnpm exec vitest run tests/Integration/SubagentDrivenDevelopment/Services/FeatureFinalizationGuards.test.ts tests/Integration/SubagentDrivenDevelopment/Services/Tasks.test.ts -t "embedded|relocates task|unsubmitted task assignment|missing task worktree"`. With the fix: 4 passed, 23 skipped. Without it: 4 failed. The stash was restored and verified afterwards.

## Changed files (committed)

- src/SubagentDrivenDevelopment/Services/FeatureFinalizationService.ts
- src/SubagentDrivenDevelopment/Persistence/TaskSchema.ts
- src/SubagentDrivenDevelopment/Models/Tasks.ts
- src/SubagentDrivenDevelopment/Services/TaskService.ts
- tests/Integration/SubagentDrivenDevelopment/Fixtures/FeatureFinalizationFixture.ts
- tests/Integration/SubagentDrivenDevelopment/Services/FeatureFinalizationGuards.test.ts
- tests/Integration/SubagentDrivenDevelopment/Services/Tasks.test.ts

## Formatting

`pnpm exec oxfmt <7 changed files>` was run before committing ("Finished … on 7 files").

## Fresh checks (run against the commit, in the feature worktree)

| Command | Exit | Key output |
| --- | --- | --- |
| `pnpm run build` | 0 | `rm -rf build && tsc && tsc-alias && node build/Settings/Models/GenerateProjectSchema.js && chmod 755 build/index.js`, no errors |
| `pnpm test` | 0 | `Test Files 90 passed (90)`, `Tests 652 passed \| 1 expected fail (653)`. Baseline was 648 passed + 1 expected fail; the 4 new tests account for the difference. |
| `pnpm run lint` | 0 | `oxlint`, no diagnostics |
| `pnpm exec oxfmt --check $(git diff --name-only --diff-filter=ACMRT 6d270a6b60e7f94a47cdcc58973cf77a069ad118..HEAD \| grep -v '^\.spindle/features/')` | 0 | `All matched files use the correct format.` (77 files) |
| `pnpm exec tsx --tsconfig tsconfig.json …/sdd-checks/finish-relocation-check.mts 0001-ticket-task-dispatch /home/nixos/source/spindle` | 0 | `relocation preflight passed with 116 mappings` |

Note: build, lint, and the format check ran at the same time as `pnpm test`. All of them passed.

## Inspected evidence vs checks run

- The check script runs only `relocate` on the real ledger. It does not schema-validate the result.
- An extra read-only diagnostic ran via `tsx` stdin, with no files written. It relocated the real ledger with the same targets and ran `TaskSchema.validate` on every ticket's tasks. Result: `tasks validated: 1; target paths remaining: 0`.
- Full `LedgerRepository.validateLedger` on the real relocated ledger was not run; test (a) exercises it end to end on the fixture.
- Inspected, not tested separately:
  - `DeliveryService.assertReady` closure gating.
  - `TaskService.assign`: always records a worktree, and history entries come from submitted states.
  - `finalCheckout`: verifies mappings that have `sha256`, and skips the `journal:execution-location` mappings.

## Self-review / concerns / limitations

- The relocate submitted-guard checks `Object.hasOwn(object, "submittedAt")` on whichever object holds a target-equal `worktree` key. In the ledger, only task assignments have a `worktree` string key, because `ticket.worktree` objects are deleted first. Any future record type with a `worktree` string and no `submittedAt` would be rejected, which errs on the safe side.
- The real feature ledger has 1 task. Its live post-merge `finish` was not run (workflow commands are not permitted). Test (a) covers that flow on the fixture.
- Conflicting instructions:
  - The commit-format skill says "title only; no footer", but the assignment required the `Co-authored-by` trailer. I followed the assignment.
  - The assignment asked for commit SHA(s), but the implementer role contract says not to copy commit IDs. The commit is identified by its subject above.
- Lint, type checks beyond `tsc` in the build, and broader regression checks are still for the controller to judge. Running them here is not ticket acceptance.

## Hand-back

DONE. Applied R-1:
- Submitted task assignments may drop their target worktree during finish relocation, and the schema accepts them only when submitted.
- Unsubmitted assignments at a target are rejected.
- Embedded report paths in finding history are relocated with digest mappings.

Build, the full suite (652 passed + 1 expected fail), lint, oxfmt check, and the relocation check all pass against the commit.

---

# Superseded draft (earlier worker, same round 8, before ruling R-1)

- Status: **NEEDS_CONTEXT** (superseded by the DONE result above)
- Scope: delivery (TICKET_ID NONE), mode CORRECTIVE, round 8 (assignment a2f3aa88-7a53-40ab-b26b-2890a8c92537)
- Checkout: /home/nixos/.copilot/session-state/7ea7f718-aea2-497a-bdb3-c9bd27b0cb67/files/0001-ticket-task-dispatch (branch features/0001-ticket-task-dispatch, HEAD unchanged at 99f1abf)
- Correction target: CHECK_FAILURE `finish-relocation-check.mts` ("Embedded workflow path cannot be silently rewritten; resolve it before finishing."). FINDING_IDS NONE, RULINGS NONE.
- Commits: **none**. All changes are **uncommitted** in the worktree and preserved. I deliberately did not commit them; see the blocker below.

## Blocker: the required key removal conflicts with an out-of-scope schema

Objective item (1) says to remove a `worktree` key whose value equals a cleanup target from the relocated ledger. The mapping should be `{before, after: "journal:execution-location"}`. For task assignments (`tickets[].tasks[].assignment.worktree`), the relocated ledger then fails validation:

- `TaskSchema.validateAssignment` (`src/SubagentDrivenDevelopment/Persistence/TaskSchema.ts:15-31`, outside FILE_SCOPE) requires `worktree` to be an absolute string. A missing key throws `Invalid task assignment.`.
- `FeatureFinalizationService.metadata()` calls `this.ledgers.validateLedger(JSON.parse(journal.ledgerAfter), …)` at about line 944. That call reaches `TaskSchema.validate` through `LedgerRepository` (line ~378).
- Observed result (run): the new success-path test fails as follows. The first `finish` in the feature worktree merges into the original checkout and succeeds. `recordFinal` succeeds. The final `finish` from the original checkout then fails with `{"ok":false,"error":{"message":"Invalid task assignment."}}`.

So, under the specified approach, a real `sdd finish` no longer stops at relocate before the merge. It fails **after the merge**, in the metadata phase. That is worse than the current pre-merge failure. If I committed this, the relocation check script would probably pass, because it runs only `relocate`. But the real end-to-end finish would still fail. For that reason I did not commit.

### Decision needed from the controller (choose one)

- A. Expand FILE_SCOPE to `src/SubagentDrivenDevelopment/Persistence/TaskSchema.ts` (and possibly `LedgerRepository.ts`). Then the task-assignment `worktree` can be absent in relocated or completed ledgers. Note: the schema has no completed-state context, so a plain relaxation also weakens validation for active ledgers.
- B. Keep the task-assignment `worktree` key and rewrite its value instead of removing it. For example, use the original checkout path or another absolute value, with mapping `after` set to that value. This differs from the stated objective ("key removed", `after: "journal:execution-location"`). It also records a location that is not where the work actually ran.
- C. Another ruling, such as moving the historical worktree into a journal-only field.

## Changes made (uncommitted)

- `src/SubagentDrivenDevelopment/Services/FeatureFinalizationService.ts` (`relocate`)
  - (1) New branch: a `worktree` key whose string value exactly equals a target workspace pushes `{before, after: "journal:execution-location"}` and deletes only that key. Sibling `report`/`reportSha256` keys still go through the existing relocation and digest check. Any other non-report path inside a target is still rejected by the existing "Cannot safely relocate recorded path" branch.
  - (2) Strings that contain a target workspace now have each embedded `<sourceRecords>/reports/<name>.md` rewritten to `<originalWorkspace>/.spindle/features/<feature>/reports/<name>.md`. `<name>` has no `/` or whitespace, and the match is bounded by start/whitespace/quote/paren before and end/whitespace/punctuation after. Each embedded path is checked with `real(path, "file")`, and a mapping with `sha256` from `digest` is pushed. The rewritten string is stored back. If any target workspace path remains after rewriting, the embedded-path error is still thrown.
  - Downstream consumers inspected (not changed): `finalCheckout` verifies every mapping that has `sha256` against `after`, so the new embedded-report mappings get digest-verified there. Mappings without `sha256` (`journal:execution-location`) are skipped. The retrospective check (~line 715) matches only the retrospective mapping. No other `mappings` or `journal:execution-location` consumers exist in the service. The real blocker is `validateLedger` in `metadata()`, described above.
- `tests/Integration/SubagentDrivenDevelopment/Fixtures/FeatureFinalizationFixture.ts`: new `readyFeature` option `workflowPathsInWorktrees`. It records the accepted task's assignment `worktree` as the ticket worktree, with a report under the feature `reports/`. It also registers a real non-blocking delivery finding through `findingService.findingCreate`, whose history details embed the absolute review report path.
- `tests/Integration/SubagentDrivenDevelopment/Services/FeatureFinalizationGuards.test.ts`: two new tests.
  - (a) `finish relocates task worktrees and report paths embedded in finding history`: full finish to completion. Asserts the original ledger has no feature or ticket worktree paths, the task and review reports point at existing original-checkout reports, finding details start with `Registered from <original review report> at commit `, and the journal has the `journal:execution-location` mapping for the ticket worktree.
  - (b) `finish rejects an embedded worktree path that is not a feature report`: appends `<ticketRoot>/feature.ts` to the finding history details, commits it, and expects the embedded-path error with HEAD and the ticket worktree preserved.

## Criteria → tests (all run on the uncommitted tree)

| Criterion | Test | Pre-fix (run) | Post-fix (run) |
| --- | --- | --- | --- |
| (a) success path relocates task worktree and embedded report paths | Guards test (a) | FAIL — `Cannot safely relocate recorded path: …/external/0001-feature-finalization-T-0001.` at first finish | FAIL — `Invalid task assignment.` at final finish (after merge; blocker above) |
| (b) unexpected embedded worktree path still rejected | Guards test (b) | FAIL — the worktree path error came first, before the embedded check | PASS |

Command run (both times): `pnpm exec vitest run tests/Integration/SubagentDrivenDevelopment/Services/FeatureFinalizationGuards.test.ts -t "embedded|relocates task"`. Pre-fix: 2 failed, 7 skipped. Post-fix: 1 failed (a), 1 passed (b), 7 skipped.

## Required checks

Not run, because there is no commit to check and the correction is blocked:

- `pnpm run build`: not run
- `pnpm test`: not run (baseline from the assignment: 90 files, 648 passed, 1 expected fail; not re-verified)
- `pnpm run lint`: not run
- `pnpm exec oxfmt --check …`: not run. The formatter was also not applied to the changed files, because nothing was committed.
- `finish-relocation-check.mts`: not run against a commit. A diagnostic run on the uncommitted tree is recorded in the hand-back below. It exercises only `relocate`, not the metadata-phase validation that fails.

Lint, type checks, and broader regression checks remain pending with the controller.

## Self-review and concerns

- The embedded-report regex accepts only bounded `.md` names directly under the source `reports/` directory. Every match must be an existing, non-symlinked regular file, or `real` throws.
- If the controller chooses option B or C, item (1) changes, and test (a) assertions about the key's absence or value must change to match. Item (2) and test (b) do not depend on that choice.

## Diagnostic check run (uncommitted tree; not evidence for a commit)

- `pnpm exec tsx --tsconfig tsconfig.json …/sdd-checks/finish-relocation-check.mts 0001-ticket-task-dispatch /home/nixos/source/spindle`
  - Before this report existed: exit 1, `ENOENT … reports/final-round-8-fix.md`. The existing `report`-key branch requires the current assignment's recorded report to exist.
  - After writing this report: exit 0, `relocation preflight passed with 116 mappings`.
  - This shows the real ledger now passes `relocate`, but only on the uncommitted tree. It does not cover the metadata-phase `validateLedger` failure described above.

## Hand-back

NEEDS_CONTEXT. Embedded report-path relocation (2) and its rejection guard work: test (b) passes. Removing the task-assignment `worktree` key, as specified, produces a ledger that the out-of-scope `TaskSchema` rejects. The rejection happens after the merge, in the metadata phase, so the end-to-end finish still fails. Changes are uncommitted in the feature worktree. I need a controller ruling (A/B/C above) before committing and running the required checks.
