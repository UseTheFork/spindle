---
name: author-agent
description: Create or revise a workspace custom agent from requirements.
argument-hint: "[agent idea or requirements]"
disable-model-invocation: true
user-invocable: true
meta:
  spindle:
    version: 1.0.0
---

Create or revise a custom agent based on these requirements:

```
${input:requirements:Describe the agent role or changes to make}
```

Before drafting, load and follow each required skill:

- **REQUIRED:** `int-writing-agents`
- **REQUIRED:** `int-writing-for-agents`
- **REQUIRED:** `int-verification-before-completion`

Treat their requirements as mandatory. Follow `int-writing-agents` for the complete authoring workflow, including role definition, file structure, tool restrictions, invocation behavior, and validation.

Create the agent in `.github/agents/<agent-name>.agent.md`, or revise the requested existing agent, following repository conventions and the requested scope. Complete the task rather than returning only a plan. Do not modify unrelated files.

Run fresh, relevant verification before making completion claims. Report any check that could not be performed accurately; do not claim it passed. Finish with a concise summary of the agent created or revised, verification performed, and any blockers or unverified runtime behavior.
