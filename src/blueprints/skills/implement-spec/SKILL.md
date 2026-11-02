---
name: implement-spec
description: "Implement the result of /to-spec and /to-tickets in code."
disable-model-invocation: true
meta:
  spindle:
    version: 1.0.0
---

# Implement a Spec

Deliver the supplied spec and all associated tickets in the existing checkout. Require configured tracker guidance; if absent, request `/setup-project`.

## Required Skills

Before acting, read and follow each required skill:

- `int-subagent-driven-dev`

## Steps

1. **Bind the whole-spec assignment.** Locate the full spec, every ticket and its comments, and tracker guidance. Supply accessible context pointers rather than duplicating their contents. Record the existing checkout, starting revision, existing work and permissions.

   **Complete when:** the complete graph and delivery inputs are available to one controller, or missing requirements are reported for triage.

2. **Execute the complete graph.** Follow [int-subagent-driven-dev](../int-subagent-driven-dev/SKILL.md) once with the entire graph and explicit ownership of frontier selection, sequential ticket delivery, aggregate review, and retrospective. Do not call it as a separate standalone delivery for every ticket. Its dependency validation, shared-checkout workflow, resume handling, review budgets, and completion criteria are authoritative. Accepted work does not unblock dependents until integrated and verified in the existing checkout.

   If the tracker calls for a PR, or the user requests one, open an authorized draft during execution after the first authorized commit is available; retain it as draft while delivery is incomplete.

   **Complete when:** its final report reconciles every ticket and requirement, one aggregate review, fresh verification and one retrospective for the spec, or explicitly identifies unfinished work and blockers.

3. **Apply authorized publication transitions.** Mark an authorized draft ready only after the full delivery's review and checks pass. Apply closing references and ticket closure only with the user's authorization.

   **Complete when:** the report identifies the verified checkout snapshot, ticket states, retrospective pointer, and any authorized PR/closure actions; unresolved work remains open with its limitations reported.
