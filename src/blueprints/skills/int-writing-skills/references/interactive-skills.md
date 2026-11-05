# Interactive skills

Use this branch when the skill primarily directs the agent through work. Interaction means agent action, not mandatory conversation with a human.

## Structure and disclosure

For a new skill, load and fill the [Interactive template](../assets/interactive.md). For an existing skill, apply it only to the relevant edit.

- Put purpose and applicability before ordered actions. End each action with a checkable, exhaustive completion criterion.
- Keep what every path needs in `SKILL.md`. Put branch-specific guidance behind a pointer beside the action that needs it; name the observable condition that requires loading it.
- Co-locate a concept's definition, rules, and caveats. Use `int-writing-for-agents` skill for the shared writing principles rather than restating them.
- Use a small flowchart for a non-obvious branch or loop, with simple action labels and short decision labels. Keep diagram nodes, step headings, branch targets, and completion criteria consistent.
- Add quick reference and common mistakes only when they serve a distinct need. Aim below 500 words when reliable at that length.

## Optional arguments

Argument support is optional. When the skill accepts arguments from a user or a calling skill, read [Arguments](./arguments.md) and define its contract before workflow actions. For skills without arguments, omit the argument contract and `argument-hint`.

## Flowchart protocol

Every Interactive skill with a flowchart must instruct the executing agent to announce **before acting** on each node:

```text
Step <node path> - <label path> [optional task context]
```

Announce initial entries, resumed steps, and loop re-entries. After evaluating a decision, state its result and selected branch before entering the target node. Task context may identify a review mode or work item; it does not replace the node path.

### Sub-flowcharts

Each sub-flowchart declares its parent node and the condition for entering it. IDs are local to each diagram; announcements use the full dot-separated ancestor path. Labels use the same order, separated by `/`.

For example, a primary node `C[Verify skill]` can disclose a child diagram with local node `A[Run focused scenario]`:

```text
Step C - Verify skill
Step C.A - Verify skill / Run focused scenario
Step C.A.B - Verify skill / Run focused scenario / Assess result
```

The third line illustrates a further child `B` under `C.A`. Declare that parent explicitly too. Repeat the full path at every depth, including decision results and branch targets, so reused local IDs remain unambiguous.

Define each child exit and its return point in the parent. When a child finishes, announce the parent as resumed and continue after the child call; do not restart completed child work. A child loop stays within the child until its exit criterion is met.

The authoring skill's own announcement instruction is an instance of this protocol. In an authored skill, render the protocol into its execution instructions so the agent can follow that skill without loading authoring guidance.

## Examples

Use one complete, adaptable example when it helps application. For illustrative code, use **pseudocode** unless the skill is always specific to one programming language; then use that language. Executable commands and required formats such as YAML and Mermaid retain their actual syntax.

## Completion

The workflow is usable without loading unrelated branches; every action has an observable end; diagrams and announcements preserve parent/child context; examples match the skill's language scope. Use [Testing skills](./testing-skills.md) to select an application scenario, not merely a prose review.
