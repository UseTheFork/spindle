# Let the ticket controller commit combined task work

For task-based ticket execution, task workers share the controller-established ticket worktree and return task reports without committing; after accepting every task, the controller commits the combined changes and submits one ticket-level implementation report. This supersedes ADR-0013's worker-commit assumption for task-based ticket execution, trading extra controller integration responsibility for one stable commit while preserving ticket-level review, integration, and post-merge validation gates.
