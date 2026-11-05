# Standalone ticket integration

Enter at controller J only after H confirms current required verification and review. Caller-owned tickets hand back at Q instead.

Set `Execution: integrated`. Before starting another ticket, stage and commit all pending tracked and untracked files, including formatting/lint changes and files outside the completed ticket's scope. Preserve existing contents; scope alone is not a reason to defer a file. Workers follow assigned commit permissions.

If any pending file cannot safely be committed, or the commit fails, stop and report the blocker. Proceed only after the commit succeeds and the worktree is clean. If already clean, no empty commit is needed.

**Complete when:** integration state is recorded and the worktree is clean after a successful commit or a confirmed no-op. Resume `Step J - Integrate`, then evaluate K. Blocked integration returns to parent Q.
