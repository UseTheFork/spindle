# Reference skills

Use this branch when the skill primarily supplies knowledge for lookup and application: a plugin, library, API, syntax, or reusable concept. Short procedures may support the knowledge without turning it into an end-to-end workflow.

## Structure and disclosure

For a new skill, load and fill the [Reference template](../assets/reference.md). For an existing skill, apply it only to the relevant edit.

- State the covered subject, applicability, and version or environment constraints that affect correctness.
- Organize by the questions the agent needs to answer. Keep each contract, its constraints, and its caveats together.
- Keep common facts inline. When a lookup depends on a particular feature or environment, put its detail behind a pointer naming that condition.
- Supply precise inputs, outputs, error behavior, and compatibility boundaries where relevant. Identify authoritative sources; avoid caching facts cheaply available from the environment.
- Include one valid, adaptable application example when useful. Clearly distinguish real API syntax from illustrative pseudocode.
- Add a lookup table or pitfalls only when they improve retrieval rather than repeat the same facts.

A Reference skill does not need ordered authoring-style phases, per-topic completion gates, or a flowchart. A focused procedure belongs beside the topic it supports.

## Completion

The agent can locate and correctly apply the relevant fact, including its constraints and failure behavior, without loading unrelated topics. Use [Testing skills](./testing-skills.md) for a retrieval-and-application scenario that verifies this.
