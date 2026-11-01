---
name: int-writing-agents
version: 1.0.0
description: "This is an internal skill do not load it unless explicitly required by the user or another skill."
user-invocable: false
---

# Writing Custom Agents

Write focused, reusable agent definitions, not editor setup guides. Use `int-writing-for-agents` skill for the instruction body.

## Workflow

### 1. Define the role

Read nearby definitions and applicable instructions. Identify purpose, inputs, allowed actions, output, and stopping condition. Confirm the intended harness before adding harness-specific fields.

**Complete when:** role and invocation needs are explicit; harness-dependent requirements are resolved or blocked.

### 2. Create or revise the file

Use `.github/agents/<topic>.agent.md` for workspace agents. Preserve unrelated behavior. Write optional YAML between `---` delimiters, followed by Markdown instructions.

Every frontmatter field is optional in the VS Code format. Include useful `name` and task-specific `description` fields for identification and discovery; name defaults to the filename. Add only needed fields:

| Need          | Authoring contract                                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tool access   | Use supported tools for the intended harness. In Local, `tools: ['read', 'search']` supports repository inspection; `tools: []` grants none. Omission uses enabled tools, not zero tools.                                                                          |
| Model         | Omit `model` to preserve the selected default; use confirmed available names only when requested.                                                                                                                                                                  |
| Hidden worker | Set `user-invocable: false`; keep `disable-model-invocation: false` (the default) for normal worker discovery. Visibility and delegation are separate controls.                                                                                                    |
| Delegation    | In Local, include the `agent` tool set. Restrict workers with an `agents` allowlist of exact, case-sensitive names; omission or `['*']` allows all, `[]` prevents delegation. An explicit entry overrides that worker's `disable-model-invocation: true` in Local. |
| Handoff       | Local handoffs transition the conversation, unlike subagent delegation. Each entry requires `label`, `agent`, and `prompt`; use `send: false` for user review before submission.                                                                                   |

Use current invocation fields instead of deprecated `infer`. Keep instruction-file fields such as `applyTo` out of agent frontmatter. `target` is not a harness selector; `mcp-servers` is for Copilot cloud agents, not VS Code agents. Check the [file reference](https://code.visualstudio.com/docs/agents/reference/custom-agent-file-reference) for additional fields and harness compatibility.

**Complete when:** fields, tools, invocation controls, and targets match the role and harness.

### 3. Write the body

State task, inputs, bounded workflow, output shape, and completion condition. Match actions to tools. Link guidance relative to the agent file. Example:

```markdown
---
name: Contract Reviewer
description: Review request/response contracts without changing files.
tools: ["read", "search"]
---

Review the contract paths identified by the caller.
Read relevant definitions, handlers, and tests.
Return evidence-backed findings with severity and file references.
If scope or evidence is missing, identify the missing input.
Stop after covering the supplied paths or reporting the blocker.
```

**Complete when:** scope, capabilities, output, and stopping condition are actionable.

### 4. Validate

Check location, YAML syntax, field names, references, tools, and agent identifiers. Exercise a representative task; inspect output and tool use. Distinguish static checks from untested runtime discovery or invocation.

**Complete when:** evidence supports claims; unverified runtime requirements are explicit.

For creation context, see [Custom agents in VS Code](https://code.visualstudio.com/docs/agent-customization/custom-agents).
