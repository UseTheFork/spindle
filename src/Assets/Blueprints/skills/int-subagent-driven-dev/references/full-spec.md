# Whole-spec delivery

Use the feature's delivery scope only after every issue is integrated. It is an
aggregate over the feature, not a substitute for issue acceptance or
integration. Delivery commands reuse the issue workflow with `--scope delivery`
instead of `--issue`; never supply both selectors.

## Aggregate review and final checks

Start with `spindle sdd status --spec <spec>` and
`spindle sdd next --spec <spec>`. Establish required final checks with
`spindle sdd checks require --scope delivery`, record their actual outcomes
against the returned snapshot, then request the aggregate review with
`spindle sdd review --scope delivery --inventory <json-array>`. The inventory
must cover the Git-derived integrated feature changes. The comprehensive
reviewer covers the whole spec and cross-issue behavior; any explicitly
required, eligible specialists are assigned as a batch and must all submit
current passing evidence.

Use `spindle sdd review require --scope delivery` to record a justified
specialist before dispatch. Reports are individual and append-only:
`final-review-<assignment-id>.md` for initial review, and
`final-round-<round>-review-<assignment-id>.md` for corrective review. Register
findings explicitly from their canonical reports and snapshots with
`spindle sdd finding create --scope delivery`. Delivery findings have their
own `F-0001` sequence, provenance, ruling history, and status; do not attach
cross-issue findings to an arbitrary issue.

## Requirements decisions and delivery correction

Use `spindle sdd finding update --scope delivery` for explicit rulings.
Deferring a blocker requires rationale, a follow-up reference, and an approved
delivery requirements decision. Record that decision with
`spindle sdd requirements decide --scope delivery` only after a requirements
change and completed prior review. Approval invalidates earlier aggregate
assignments. A deferred finding cannot clear a blocker until required fresh
aggregate reviewers have submitted passing reports against the changed
requirements snapshot.

For actionable delivery findings, use
`spindle sdd correct --scope delivery` to persist each independent attempt
before assigning batched corrective work. The delivery history is separate
from issue attempts. Record focused passing checks against the changed
delivery snapshot, submit the implementation report, and complete current
corrective aggregate review. Continue only with an explicit productive
progress assessment; pause unproductive work, recurring failures, or
requirements disagreement for adjudication. Resume with
`spindle sdd resume --scope delivery`; it preserves existing assignments,
attempts, evidence, and adjudication. Do not reset counters or weaken
acceptance to end retries.

## Finish and retrospective

Run final required checks and aggregate reviews on the exact final content.
Integrated feature changes and final corrections must be committed by the
caller under the established commit permissions; the SDD command never stages,
commits, or publishes. A change to integrated code or requirements invalidates
the corresponding delivery evidence and requires fresh coverage.

Finish with `spindle sdd finish --spec <spec> --author <author>`. The command
requires every issue integrated, current passing aggregate required reviews
and checks, no unresolved delivery blockers, and no uncommitted code changes.
The retrospective policy is stored at feature creation: when required, attach
a Markdown report with `--report`; otherwise the report is optional. Any
attached report must remain inside that feature's `reports/` directory.
`finish` records completion only; it does not close issues or publish work.
Only the recorded delivery owner may finish; use
`resume --scope delivery --confirm-handoff` to record a confirmed ownership
handoff before a replacement controller finishes. A finished delivery rejects
new or changed final checks. `status`, `next`, and `resume` continue validating
the recorded evidence, and report stale completion when code, requirements,
reviews, checks, or an attached retrospective have changed.

Use `status` and `next` to inspect aggregate blockers and the next permitted
delivery action; use `resume --scope delivery` to restore interrupted aggregate
work. These operations preserve separate issue and delivery histories;
hand-back and acceptance remain controller-owned.
