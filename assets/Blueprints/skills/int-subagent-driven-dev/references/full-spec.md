# Feature delivery

Feature delivery is the completion gate for one feature workspace. It begins
after every ticket is closed. It does not replace ticket-level implementation,
checks, or review. Follow `sdd next` for the current delivery step and its exact
command or choices.

## Checks and review

The controller claims delivery ownership after ticket work is complete. Establish
current feature-level check evidence before requesting the comprehensive review.
Commit feature requirements before checks or review, and do not silently
substitute the current `HEAD` for the recorded baseline.

The default feature reviewer is required. Add a specialist only when its
objective is justified, the catalog approves the role, and the runtime can
dispatch it. Every reviewer receives the same committed target and the
appropriate scope. A missing, pending, failed, unavailable, stale, or mismatched
review blocks completion.

Keep each assignment's ID, objective, committed target, and absolute report path
inside the feature's `reports/` directory. Submit a report against its exact
assignment. The controller reads the report and supplies the authoritative
result; the CLI does not infer a verdict from report prose.

## Findings and correction

Reviewers report findings with impact and whether each finding blocks
acceptance. Do not assign canonical finding IDs or severity. The controller
explicitly registers each accepted finding against its review assignment before
submitting the review. Submission links the findings already registered to
that assignment.

A finding is blocking or non-blocking. Use the linked ticket when a finding
returns work to a specific ticket. A blocking linked finding reopens its ticket
after the complete review batch is submitted; dependent tickets remain blocked
until that ticket is complete again.

The controller chooses each correction. `sdd next` lists every eligible
finding and failed check; do not assume that one candidate is the intended
choice, and do not combine independent corrections. Pause for adjudication when
work is unproductive, failures recur, or requirements are disputed. Preserve
assignments, attempts, evidence, and adjudication.

Each correction requires fresh checks and focused review of the fix and prior
findings. For a failed post-merge check, keep other merges blocked and run
`pnpm spindle sdd sync --feature <feature-workspace> --ticket <ticket-id>
--actor <acting-agent>` from the feature worktree before dispatching correction.
Sync fast-forwards only a clean, non-divergent ticket worktree to the recorded
failed merge. Then run `pnpm spindle sdd next --feature <feature-workspace>`
and follow its exact correction command.

For an integration conflict, resolve and commit the rebase in the ticket
worktree, then run `sdd sync` from the feature worktree to adopt the updated
comparison baseline. Run fresh checks and obtain focused rework review before
retrying integration. Follow `pnpm spindle sdd next --feature
<feature-workspace>` for the exact commands. Preserve work when a Git operation
cannot proceed.

## Finish and final validation

Integrate a ticket only after its committed implementation and review are
current and passing. Record post-merge checks before unblocking dependent work.
Workflow-record-only commits do not invalidate evidence; code or committed
requirements changes do.

Declare the complete, non-empty final-check list before finishing. The finish
step merges the feature into the recorded original branch and returns pending
final validation. It does not mean the feature is complete. Run each declared
check in the original checkout against the feature merge, then record its actual
result. Failed or unavailable checks block cleanup until current passing
evidence is recorded.

After all final checks pass, follow the CLI's cleanup step. The feature merge is
the checked commit; a later ledger-only relocation commit is reported
separately. Preserve dirty or unexpected work. Ignored files in worktrees slated
for removal also block cleanup; do not discard them without authorization.

## Recovery

Use the state reported by the CLI to restore interrupted work. For a post-merge
failure, synchronize the clean ticket worktree to the recorded merge before
dispatching a correction. For a final-check failure, fix on the original
branch, run `pnpm spindle sdd checks revalidate --feature <original-feature>
--scope final --actor <acting-agent>`, rerun the complete final-check list, and
record fresh results. Revalidation requires a clean checkout on the recorded
original branch at a commit descended from the feature merge; it invalidates
prior results.

Never reset workflow state, force cleanup, or infer that a worker is active
because an assignment is pending. Preserve reports, findings, commits, and
check evidence during recovery.
