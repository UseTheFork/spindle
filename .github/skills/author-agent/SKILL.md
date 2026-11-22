---
name: author-agent
description: Create or update a project agent from the user's requirements
argument-hint: "<agent idea or requirements>"
disable-model-invocation: true
user-invocable: true
metadata:
  spindle:
    version: 1.1.3
---

# Author Agent

Create or update a project agent in `.github/agents/<agent-name>.agent.md`.

## Clarify the request

Before your first question, read and consider only the `private-ref-writing-for-agents` and `public-ref-asd-ste100` skills. Load and follow the `grill` skill to clarify the user's request. Ask one question per turn and wait for the answer. Do not load other skills before the user confirms the shared understanding.

Do not announce workflow steps or load other skills during clarification. Start the workflow only after the user confirms the shared understanding.

## Workflow

After confirmation, your first action is to announce `Step A - Define agent role`. Do not read files, load skills, or take another action before this announcement. Before acting on each node, announce `Step <node ID> - <node label>`. Announce resumed steps and loop re-entries. After each decision, state its result and selected branch before entering the next node. Select the mode from the calling context before entering A.

```mermaid
flowchart TD
    A[Define agent role] --> B[Run baseline scenarios]
    B --> C{Baseline shows a gap?}
    C -- No --> H[Report no change needed]
    C -- Yes --> D[Load agent-writing guidance]
    D --> E[Write or update agent]
    E --> F[Retest the same scenarios]
    F --> G{All criteria pass?}
    G -- No --> E
    G -- Yes --> I[Validate final agent]
    I --> J[Report agent and validation]
```

### A. Define agent role

Read nearby agent definitions and project instructions. Identify the agent's purpose, users, inputs, allowed actions, output, stopping condition, and intended harness. Ask the user about any missing requirement that changes the agent's role or behavior. If clarification changes the agreed role, confirm the revised understanding before continuing.

**Complete when:** The role and invocation needs are explicit, and harness-dependent requirements are resolved or reported as blocked.

### B. Run baseline scenarios

Load the `private-testing-agent-guidance` skill. Define frozen scenarios and observable criteria for the requested agent. For an update, test the current agent. For a new agent, test the task without the proposed agent. Run core and expanded baselines. Record the observed actions and outputs before drafting.

**Complete when:** Testing guidance is loaded, and every meaningful branch has a frozen scenario, criterion, and observed baseline result.

### C. Baseline shows a gap?

Compare each baseline result with its unchanged criterion. Select No when every criterion passes. Select Yes when at least one criterion fails.

**Complete when:** The evidence and selected branch are explicit.

### D. Load agent-writing guidance

Load the `private-writing-agents` skill. Apply the clarity rules from the `public-ref-asd-ste100` skill. Follow the agent-writing skill for frontmatter, tools, invocation, and body structure.

**Complete when:** The required writing and testing guidance is available.

### E. Write or update agent

Write `.github/agents/<agent-name>.agent.md` for the confirmed role. Include only fields and tools that the intended harness needs. Preserve unrelated behavior. Change no unrelated files.

**Complete when:** The agent file expresses the confirmed role and its requirements without unresolved placeholders.

### F. Retest the same scenarios

Run the frozen core scenarios and expanded tests against the revised agent in fresh contexts. Check the observed actions and output against the original criteria. Do not treat a statement of understanding as evidence.

**Complete when:** Every scenario has an observed result against its unchanged criterion.

### G. All criteria pass?

Select No if any criterion fails; return to E and address only the observed failure. Select Yes if all criteria pass.

**Complete when:** The evidence supports the selected branch.

### H. Report no change needed

Leave the agent unchanged. Report the scenario results and explain why they show no gap.

**Complete when:** The user has the baseline evidence and no-change result.

### I. Validate final agent

Check the file path, YAML frontmatter, tool names, agent identifiers, and references. Rerun tests if a validation fix changes behavior-shaping text.

**Complete when:** Final checks pass, or each blocker and unverified requirement is explicit.

### J. Report agent and validation

Report the agent file changed, its purpose, the checks and observed results, and any blocker or unverified requirement. Do not claim a runtime invocation or discovery check that did not run.

**Complete when:** The user has the result and validation evidence.
