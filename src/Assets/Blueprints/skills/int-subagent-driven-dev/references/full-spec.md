# Feature delivery

Feature delivery is the completion gate for one feature workspace. It begins
after every ticket is closed; it does not replace ticket-level implementation or
acceptance criteria. Use `--scope delivery` instead of `--ticket` for feature
checks, review assignments, findings, and corrections.

## Checks and review

Inspect `{{ computed.spindle_package_manager }} spindle sdd status --spec <spec>` and `{{ computed.spindle_package_manager }} spindle sdd next --spec <spec>`. Establish
required final checks with `{{ computed.spindle_package_manager }} spindle sdd checks require --scope delivery`, run them, and
record actual results against the returned snapshot. Then dispatch the
comprehensive review with
`{{ computed.spindle_package_manager }} spindle sdd review --scope delivery --inventory <json-array>`. Its inventory must
cover the feature's current Git-derived changes.

The `sdd-reviewer` is the default comprehensive reviewer. Before dispatch,
record any justified specialist with
`{{ computed.spindle_package_manager }} spindle sdd review require --scope delivery --type <agent-name> --details <objective>`.
Only catalog agents with `canReview: true` are eligible. Confirm that the
controller can actually dispatch each selected agent; catalog eligibility does
not guarantee harness access.

Preserve each assignment's ID, objective, snapshot, inventory, and report
path. Submit every report against its exact assignment. A missing, pending,
failed, unavailable, stale, or mismatched review blocks completion.

## Findings and correction

Register findings from their assigned reports and snapshots with
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
each independent correction attempt. Record passing checks against the changed
feature snapshot and submit the implementation report before requesting a new
feature review. Pause unproductive work, recurring failures, or requirements
disagreement for adjudication. Resume with `{{ computed.spindle_package_manager }} spindle sdd resume --scope delivery`;
preserve existing assignments, attempts, evidence, and adjudication.

## Finish

Use the normal Git workflow for code changes. SDD does not stage, commit,
publish, or require a per-ticket integration confirmation. A changed code or
requirements snapshot invalidates evidence that no longer covers it.

Legacy feature workspaces without a recorded Git baseline stay blocked until
the original comparison baseline is identified. Do not silently use the
current `HEAD` after implementation; that could omit completed feature work
from review.

Finish with `{{ computed.spindle_package_manager }} spindle sdd finish --spec <spec> --author <author>`. Completion requires
at least one ticket, every ticket closed, current passing required feature
checks and reviews, and no unresolved delivery blockers. The retrospective
policy is stored at feature creation: when required, attach a Markdown report
with `--report`; otherwise it is optional. Any report must remain inside that
feature's `reports/` directory.

Use `{{ computed.spindle_package_manager }} spindle sdd status`, `{{ computed.spindle_package_manager }} spindle sdd next`, and
`{{ computed.spindle_package_manager }} spindle sdd resume --scope delivery` to inspect blockers and
restore interrupted feature-level work. These commands do not close tickets or
publish changes.
