---
name: sdd-author-design
description: "Use when a user asks to author a design for a feature, workflow, or behavior that has important product decisions to settle."
disable-model-invocation: true
user-invocable: true
metadata:
  spindle:
    version: 2.2.0
---

# Author an SDD Design

Settle consequential product or workflow decisions before drafting a spec. Design is optional. If the user wants a spec without a design, stop and point them to `/sdd-to-spec`.

Announce `Step <ID> - <label>` before each node, including resumed steps and loop re-entries. State each decision result and the selected branch before entering the next node.

```mermaid
flowchart TD
    A[Understand the brief] --> B{Decision open?}
    B -- Yes --> C[Settle the decision]
    C --> B
    B -- No --> D[Draft the design]
    D --> E{Design approved?}
    E -- Revise --> A
    E -- Approved --> F[Save the design]
    F --> G[Commit the work]
    G --> H[Hand off]
```

## A. Understand the brief

Identify the user goal, success outcomes, scope, and constraints. Read relevant project docs and code before asking questions. Identify the original checkout and any existing numbered feature workspace. If that workspace already has a filled-in spec, ask before adding or revising a design for it. An unfilled spec template does not count as a spec.

For a new feature, use a lowercase kebab-case slug. Run this command from the original checkout to create the workspace and its spec and design templates before drafting:

```sh
{{ computed.spindle_package_manager }} spindle sdd create --slug "<slug>"
```

Use the returned workspace path for all subsequent steps. If creation fails, report the error and check for a partially created workspace before retrying. Reuse this workspace on revisions; do not create another one.

**Complete when:** the brief is clear, the feature workspace exists, and any consequential open decision is named.

## B. Decision open?

Go to C if a decision changes the outcome, scope, or workflow. Otherwise go to D. Do not reopen decisions that the user or project evidence already settled.

**Complete when:** the next branch is stated.

## C. Settle the decision

Ask one focused question at a time. Explain what the answer changes. When multiple approaches fit, compare their main trade-offs and recommend one. Record the user's choice or an expressly delegated decision. Return to B.

**Complete when:** the decision is recorded or a focused follow-up is pending.

## D. Draft the design

Follow the `public-ref-asd-ste100` skill for clarity. Read the feature workspace's `design.md` and draft directly in that file, using its template as the outline. Preserve existing content outside the intended changes. Define the terms, rules, and responsibilities needed to understand the selected approach.

Describe how the design works from entry to outcome. Include alternate paths, failure, and recovery where they matter. Use a Mermaid flowchart for branching, a sequence diagram for handoffs, or a state diagram for lifecycle rules. Add a diagram only when it clarifies the design. Keep rules and exceptions explicit in prose. Leave detailed requirements, tickets, and tasks to later steps.

**Complete when:** the draft is saved in the feature workspace's `design.md` and shows the observable outcomes, selected direction, and open questions without implying decisions the user did not make.

## E. Design approved?

Show the draft and ask for approval. Return to A if the user requests changes. Continue to F only after approval. Stop if the user chooses the spec-only path.

**Complete when:** approval, revisions, or the spec-only choice is explicit.

## F. Save the design

Ensure the approved text is saved in the same workspace's `design.md`. Read and preserve existing content outside the approved changes. Leave `spec.md` unchanged for the `sdd-to-spec` skill. Do not create another workspace or edit the ledger.

**Complete when:** the approved design is saved in the feature workspace.

## G. Commit the work

Follow the `public-ref-commit-format` skill for the commit message. Review the working tree and index in the original checkout. Stage only the files created or changed by this workflow, including new feature workspace scaffolding. If unrelated changes are already staged, ask the user how to proceed without including or unstaging them.

Commit the work and verify that the saved design and any new scaffolding are committed. If they are already committed, do not create an empty commit. If the commit fails, report the error and stop before handoff.

**Complete when:** the approved design and any new workspace scaffolding are committed, with no unrelated changes included.

## H. Hand off

Report the design path and ask the user to invoke `/sdd-to-spec` with it. Do not invoke that skill automatically or fill in the spec.

**Complete when:** the user has the committed design's path for spec authoring.
