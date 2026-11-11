---
name: author-instruction
description: Create or revise workspace-scoped Copilot instruction files from the user's requirements
argument-hint: "<instruction requirements>"
disable-model-invocation: true
user-invocable: true
metadata:
  spindle:
    version: 1.0.2
---

Create or update a project instruction in `.github/instructions/**/*.instructions.md` based on the user's requirements.

## Authoring flow

{{ computed.authoring_flowchart }}

Before grilling, read and consider only the `int-writing-for-agents` and `asd-ste100` skills. Do not follow their workflows or load skills they reference yet.

After the user confirms shared understanding, load and follow:

- **REQUIRED:** `int-writing-instruction`
- **REQUIRED:** `int-testing-agent-guidance`

Apply the clarity rules from the `asd-ste100` skill. Include a before/after table only when the user requests one. Run the core and expanded testing workflows in `int-testing-agent-guidance` for every authoring request.

Verify any `applyTo` glob against concrete in-scope files and near misses; every intended file must match, and out-of-scope files must not.

Do not modify unrelated files. Report the instruction changed and validation performed, including any blockers or unverified requirements.
