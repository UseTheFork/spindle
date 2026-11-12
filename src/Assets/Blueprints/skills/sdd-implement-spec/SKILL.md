---
name: sdd-implement-spec
description: "Implement the result of /sdd-to-spec and /sdd-to-tickets in code."
disable-model-invocation: true
metadata:
  spindle:
    version: 1.2.0
---

# Implement a Spec

## Required Skills

Before acting, read and follow each required skill:

- `int-subagent-driven-dev`

## Steps

1. **Bind the whole-spec assignment.** Locate the full spec, every ticket and its comments, and tracker guidance. Supply accessible context pointers rather than duplicating their contents. Record the original branch, existing work, permissions, and the allowed feature worktree location; obtain an allowed location for each ticket at dispatch.

   **Complete when:** the complete graph and delivery inputs are available to one controller, or missing requirements are reported for triage.

2. **Execute the complete graph.** Follow the `int-subagent-driven-dev` skill once with the entire graph and explicit ownership of frontier selection, ticket delivery, aggregate review, and retrospective. Accepted work does not unblock dependents until integrated and verified in the feature worktree.

   If the tracker calls for a PR, or the user requests one, open an authorized draft during execution after the first authorized commit is available; retain it as draft while delivery is incomplete.

   **Complete when:** its final report reconciles every ticket and requirement, one aggregate review, fresh verification, and any retrospective required by policy or requested by the user, or explicitly identifies unfinished work and blockers.

3. **Apply authorized publication transitions.** Mark an authorized draft ready only after the full delivery's review and checks pass. Apply closing references and ticket closure only with the user's authorization.

   **Complete when:** the report identifies the verified checkout snapshot, ticket states, retrospective pointer, and any authorized PR/closure actions; unresolved work remains open with its limitations reported.
