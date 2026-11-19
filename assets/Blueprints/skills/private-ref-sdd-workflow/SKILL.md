---
name: private-ref-sdd-workflow
description: "{{ computed.private_skill_description }}"
user-invocable: false
metadata:
  spindle:
    version: 1.0.0
---

# SDD Workflow Recovery

Use this reference when an assigned reviewer or merge agent stops without a
complete result. Run SDD commands from the original checkout. Use `{{ computed.spindle_package_manager }} sdd next`
for current workflow state and the CLI assignment for allowed operations.

## Reviewer stopped without a recommendation

Do not submit an incomplete review, invent a recommendation, or start a new
review to replace a pending one. Confirm the previous reviewer stopped.
If you can resolve the blocker, give a reviewer the original assignment
command for the same review ID. Keep the assigned worktree and revision
unchanged. If that assignment is no longer available or the CLI rejects it,
report the review ID, the blocker, and any CLI error to the user.

## Merge operation stopped before completion

Confirm the previous merge agent stopped before handing off the worktree.
Read `sdd next` again. If the operation is still pending and the blocker
can be resolved, pass the resume assignment for the same operation ID to
the merge agent. Do not start another `integrate` or `finish` operation.
The assignment's recorded phase determines whether the agent may merge or
clean up. If the operation is already complete, do not repeat it.

If worktree ownership or the state of a partial merge is unclear, stop.
Preserve the worktrees and branches. Report the operation ID, recorded phase,
and blocker. Do not reset, abort, or force cleanup to clear the blocker.
