---
name: author-instruction
description: Create or revise workspace-scoped Copilot instruction files from the user's requirements
argument-hint: "[--test] <instruction requirements>"
disable-model-invocation: true
user-invocable: true
metadata:
  spindle:
    version: 1.0.0
---

Create or update a project instruction in `.github/instructions/**/*.instructions.md` based on the user's requirements.

## Required skills

Before drafting or editing, read:

- **REQUIRED:** `int-writing-instruction`
- **REQUIRED:** `int-writing-for-agents`
- **REQUIRED:** `int-testing-agent-guidance`

These skills define the complete authoring workflow. Every instruction change requires the baseline and focused validation specified by `int-testing-agent-guidance`; `--test` does not disable or replace them.

When `--test` is present, also run the expanded testing workflow in `int-testing-agent-guidance`.

Verify any `applyTo` glob against concrete in-scope files and near misses; every intended file must match, and out-of-scope files must not.

Do not modify unrelated files. Report the instruction changed and validation performed, including any blockers or unverified requirements.
