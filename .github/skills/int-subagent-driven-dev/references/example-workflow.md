# Example feature workflow

This example shows a small feature with two dependent tickets. The ticket
Markdown holds requirements and acceptance criteria; `sdd.json` holds tracker
status and dependencies.

1. Create a feature workspace and split independent work into tickets:
   `pnpm spindle sdd create`, then `pnpm spindle sdd ticket create` for each ticket.
2. Record the dependency with
   `pnpm spindle sdd ticket update --ticket T-0002 --blocked-by T-0001`. Check `pnpm spindle sdd ready`:
   the prerequisite is ready and the dependent ticket is not.
3. Start the feature worktree in the supplied external directory. Implement
   `T-0001` in its ticket worktree, submit its report, review the committed
   change, and merge it into the feature branch. Declare and record passing
   post-merge checks before it closes.
4. `T-0002` becomes ready once its dependency is integrated and validated.
   Branch it from the updated feature branch and deliver it in the same way.
5. Record current feature-level required checks and request the comprehensive
   review with `pnpm spindle sdd review --scope delivery`. Add only justified specialists.
6. Submit every assigned report. Register findings from their report and
   snapshot. A blocking finding can reopen its related ticket; complete the
   correction, close the ticket again, and refresh stale checks and review.
7. Inspect canonical records and run `sdd finish --confirm-records` from the
   feature worktree. In the original checkout, declare and run the complete
   `checks require --scope final` list, record results against the returned
   merge and snapshot, then run `sdd finish` again to clean up. The checked
   merge and the later metadata-only commit are reported separately.
