---
name: author-agent
description: Create or revise a workspace custom agent from requirements.
argument-hint: "[--test] <agent idea or requirements>"
disable-model-invocation: true
user-invocable: true
metadata:
  spindle:
    version: 1.0.1
---

Create or update a project agent in `.github/agents/<agent-name>.agent.md` based on the user's requirements.

## Required skills

Before drafting or editing, read:

- **REQUIRED:** `int-writing-agents`
- **REQUIRED:** `int-writing-for-agents`
- **REQUIRED:** `int-testing-agent-guidance`
- **REQUIRED:** `asd-ste100`

Apply the clarity rules from the `asd-ste100` skill. Include a before/after table only when the user requests one.

These skills define the complete authoring workflow. Every agent change requires the baseline and focused validation specified by `int-testing-agent-guidance`; `--test` does not disable or replace them.

When `--test` is present, also run the expanded testing workflow in `int-testing-agent-guidance`.

Do not modify unrelated files. Report the skill changed and validation performed, including any blockers or unverified requirements.
