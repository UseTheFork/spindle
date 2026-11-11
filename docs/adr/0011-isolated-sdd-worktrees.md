---
status: proposed
---

# Isolate SDD ticket work in Git worktrees

SDD would integrate a feature on its own branch and run eligible tickets in separate
worktrees, rather than serializing all work in the original checkout. The
feature worktree would own canonical workflow records; reviewed ticket commits
would be merged into it and verified before dependents start. After feature
review, the feature would be merged into the unchanged original branch.
Worktrees and branches would be retained until successful final validation, so interrupted or blocked work
can be recovered without discarding changes.

This decision would replace the shared-checkout and caller-owned integration
assumptions in ADR-0005 and ADR-0006. It trades additional Git coordination and
integration validation for safe parallel ticket work and preserved review
boundaries.
