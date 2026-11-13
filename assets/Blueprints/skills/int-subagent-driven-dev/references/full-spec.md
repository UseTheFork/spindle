# Feature delivery

Feature delivery is the completion gate for one feature workspace. It begins
after every ticket is closed; it does not replace ticket-level implementation or
acceptance criteria. Use `--scope delivery` instead of `--ticket` for feature
checks, review assignments, findings, and corrections.

## Checks and review

Inspect `{{ computed.spindle_package_manager }} spindle sdd status --spec <spec>` and `{{ computed.spindle_package_manager }} spindle sdd next --spec <spec>`. Establish
required final checks with `{{ computed.spindle_package_manager }} spindle sdd checks require --scope delivery`, run them, and
record actual results against the current committed feature inputs. Commit any
feature spec or ticket requirement updates before checks or review. Then dispatch the
comprehensive review with
`{{ computed.spindle_package_manager }} spindle sdd review --scope delivery --inventory <json-array>`. Its inventory must
cover the feature's current Git-derived changes.

The `sdd-reviewer` is the default comprehensive reviewer. Before dispatch,
record any justified specialist with
`{{ computed.spindle_package_manager }} spindle sdd review require --scope delivery --type <agent-name> --details <objective>`.
Only catalog agents with `canReview: true` are eligible. Confirm that the
controller can actually dispatch each selected agent; catalog eligibility does
not guarantee harness access.

Preserve each assignment's ID, objective, committed target, inventory, and report
path. Submit every report against its exact assignment. A missing, pending,
failed, unavailable, stale, or mismatched review blocks completion.

## Findings and correction

Register findings from their assigned reports and commit provenance with
`{{ computed.spindle_package_manager }} spindle sdd finding create --scope delivery`. Delivery findings have feature-scoped
IDs, provenance, ruling history, and status. Use `--related-ticket <id>` for a
finding that should return work to a specific ticket. A blocking linked finding
reopens its ticket after the complete review batch is submitted; dependent
tickets remain blocked until that ticket is closed again.

Use `{{ computed.spindle_package_manager }} spindle sdd finding update --scope delivery` for explicit rulings. Deferring a
blocker requires rationale, a follow-up reference, and an approved delivery
requirements decision. Record that decision with
`{{ computed.spindle_package_manager }} spindle sdd requirements decide --scope delivery` only after a requirements change
and completed prior review. Approval invalidates earlier aggregate assignments.

For actionable feature findings, follow [feature correction](./corrective-rounds.md)
and use `{{ computed.spindle_package_manager }} spindle sdd correct --scope delivery` to record
each independent correction attempt. Format changed implementation files with
the configured formatter before committing. Each new commit requires fresh
checks and a focused rework review that covers the fix and prior findings.
Pause unproductive work, recurring failures, or requirements
disagreement for adjudication. Resume with `{{ computed.spindle_package_manager }} spindle sdd resume --scope delivery`;
preserve existing assignments, attempts, evidence, and adjudication.

## Finish

Review each committed ticket before merging that exact approved commit into the
feature worktree, then record post-merge checks before unblocking dependents.
Workflow-record-only commits do not invalidate evidence. Code or committed
requirements changes require fresh checks and review.

When requirements change after ticket dispatch, commit the canonical feature
records and update the ticket worktree from that feature HEAD before review or
integration. Never approve a ticket branch with stale or uncommitted canonical
requirements.

Do not silently substitute the current `HEAD` for the recorded Git baseline;
that could omit completed feature work from review.

Completion requires at least one ticket, every ticket integrated and validated,
current passing required feature checks and reviews, and no unresolved delivery
blockers. The retrospective policy is stored at feature creation: when required,
attach a Markdown report with `--report`; otherwise it is optional. Any report
must remain inside that feature's `reports/` directory.

Inspect canonical records for sensitive content, then run
`{{ computed.spindle_package_manager }} spindle sdd finish --spec <feature-spec> --author <agent-name> --confirm-records`
from the feature worktree, adding `--report <absolute-report-path>` when needed.
This merges into the recorded original branch and returns a pending final
validation, merge commit, and original spec path; it does not yet complete the
feature.

In the original checkout, declare the entire non-empty final list with
`{{ computed.spindle_package_manager }} spindle sdd checks require --spec <original-spec> --scope final --command <command> --author <agent-name>`,
repeating `--command` for each check. Run each command there, then record each
actual result with `{{ computed.spindle_package_manager }} spindle sdd checks record --spec <original-spec> --scope final --merge <merge-sha> --command <command> --result <result> --author <agent-name>`.
Failed or unavailable results require `--details` and block cleanup until the
latest result for each command passes. The list is frozen once declared.

Run `{{ computed.spindle_package_manager }} spindle sdd finish --spec <original-spec> --author <agent-name>`
again to preflight and clean up the recorded worktrees and branches. The final
merge is the checked commit; the subsequent ledger-only relocation commit is
reported separately and is not itself checked. Preserve any dirty or unexpected
work and follow the reported journal for recovery rather than forcing cleanup.
Ignored files in worktrees slated for removal also block cleanup; do not discard
them without authorization. After a crash, remove a reported finalization lock
only after verifying its recorded owner has stopped.

Use `{{ computed.spindle_package_manager }} spindle sdd status`, `{{ computed.spindle_package_manager }} spindle sdd next`, and
`{{ computed.spindle_package_manager }} spindle sdd resume --scope delivery` to inspect blockers and
restore interrupted feature-level work. These commands do not close tickets or
publish changes.
