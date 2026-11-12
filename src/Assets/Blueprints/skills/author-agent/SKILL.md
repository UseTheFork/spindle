---
name: author-agent
description: Create or revise a workspace custom agent from requirements.
argument-hint: "<agent idea or requirements>"
disable-model-invocation: true
user-invocable: true
metadata:
  spindle:
    version: 1.0.2
---

Create or update a project agent in `.github/agents/<agent-name>.agent.md` based on the user's requirements.

## Authoring flow

{{ computed.authoring_flowchart }}

Before grilling, read and consider only the `int-writing-for-agents` and `ref-asd-ste100` skills. Do not follow their workflows or load skills they reference yet.

After the user confirms shared understanding, load and follow:

- **REQUIRED:** `int-writing-agents`
- **REQUIRED:** `int-testing-agent-guidance`

Apply the clarity rules from the `ref-asd-ste100` skill. Include a before/after table only when the user requests one. Run the core and expanded testing workflows in `int-testing-agent-guidance` for every authoring request.

Do not modify unrelated files. Report the skill changed and validation performed, including any blockers or unverified requirements.
