---
name: author-instruction
meta:
  spindle:
    version: 1.0.0
description: Create or revise workspace-scoped Copilot instruction files from the user's requirements
argument-hint: "[instruction requirements]"
disable-model-invocation: true
user-invocable: true
---

# Author Instructions

## Overview

Turn requirements into concise workspace instructions with a verified file scope. A correct file in the wrong scope is still incorrect guidance.

Create or revise a workspace instruction file based on these requirements:

```
${input:requirements:Describe the instruction file to create or revise}
```

Before drafting, read and follow both required skills:

- **REQUIRED:** `int-writing-instruction`
- **REQUIRED:** `int-writing-for-agents`

Both are mandatory. The instruction-writing skill defines file scope and frontmatter; the agent-document skill applies to every instruction an agent consumes. Reading existing instruction files does not replace either skill.

Inspect the relevant source files and existing instructions for the target area. Choose one coherent topic and avoid duplicating existing rules. Verify the `applyTo` glob against concrete in-scope files and near misses; every intended file must match, and out-of-scope files must not. For example, controller-only guidance should match a real controller path but not a neighboring route or Form Request. Create or revise the `.github/instructions/**/*.instructions.md` file that best fits; do not save it in an arbitrary `.github` location.

Validate the result on a representative task. Check that the instruction is included and shaped the result, and inspect the resulting work for adherence. Discovery alone is not validation. If current VS Code frontmatter behavior matters, consult the official documentation as directed by `int-writing-instruction`.

## Quick Reference

| Shortcut                                              | Required response                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| "The deadline is tight" or "tests can catch it later" | Read both skills before drafting and perform the representative-task validation before reporting completion. |
| "I already inspected the existing instructions"       | Keep that inspection, then read both required skills; one does not replace the other.                        |
| "The instruction-writing skill is enough"             | Also read and apply `int-writing-for-agents`.                                                                |

## Common Mistakes

Red flags: editing before reading both skills; choosing a broad `applyTo` without checking target paths; creating duplicate guidance; treating a later test as validation.

Finish with a concise summary of the instruction file created or revised and the validation performed. Report any validation that could not be completed; do not claim it passed.
