---
name: sdd-implement-spec
description: "Start or resume implementation of an approved SDD feature plan. Requires the sdd-orchestrator agent."
disable-model-invocation: true
metadata:
  spindle:
    version: 2.0.1
---

# Implement a Spec

The active agent must be `sdd-orchestrator`. If the active agent is different
or cannot confirm its identity, stop and ask the user to select
`sdd-orchestrator` and invoke `/sdd-implement-spec` again. Do not launch
`sdd-orchestrator` as a subagent.

1. **Bind the feature.** Identify the original checkout and feature workspace.
   If no workspace exists, collect the approved specification, tickets, tasks,
   and dependencies. Include the user's scope and permissions. Ask for missing
   inputs before dispatch.

2. **Run the controller workflow.** As `sdd-orchestrator`, use `sdd next` to
   start or resume the workflow. Run controller actions yourself and delegate
   only the assignments specified by the orchestrator workflow.

3. **Return the result.** Report the completion state or blocker.
   Apply publication or tracker changes only with the user's
   separate authorization.
