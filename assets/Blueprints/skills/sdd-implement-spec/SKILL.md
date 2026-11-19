---
name: sdd-implement-spec
description: "Start or resume implementation of an approved SDD feature plan."
disable-model-invocation: true
metadata:
  spindle:
    version: 2.0.0
---

# Implement a Spec

1. **Bind the feature.** Identify the original checkout and feature workspace.
   If no workspace exists, collect the approved specification, tickets, tasks,
   and dependencies. Include the user's scope and permissions. Ask for missing
   inputs before dispatch.

2. **Hand off to the controller.** Send the bound feature and inputs to
   `sdd-orchestrator`. It uses `sdd next` to start or resume the workflow.
   If the agent is unavailable, report the blocker.

3. **Return the result.** Report the completion state or blocker from the
   orchestrator. Apply publication or tracker changes only with the user's
   separate authorization.
