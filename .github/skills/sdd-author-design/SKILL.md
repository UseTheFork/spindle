---
name: sdd-author-design
description: "Use when a user asks to author a design for a feature, workflow, or behavior that has important product decisions to settle."
disable-model-invocation: true
user-invocable: true
metadata:
  spindle:
    version: 2.3.1
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
    D --> E{Ready to save and grill?}
    E -- Revise --> A
    E -- Approved --> F[Save the design]
    F --> F1[Grill and update the design]
    F1 --> G[Commit the work]
    G --> H[Hand off]
```

## A. Understand the brief

Identify the user goal, success outcomes, scope, and constraints. Read relevant project docs and code before asking questions. Identify the original checkout and any existing numbered feature workspace. If that workspace already has a filled-in spec, ask before adding or revising a design for it. An unfilled spec template does not count as a spec.

For a new feature, use a lowercase kebab-case slug. Run this command from the original checkout to create the workspace and its spec and design templates before drafting:

```sh
pnpm spindle sdd create --slug "<slug>"
```

Use the returned workspace path for all subsequent steps. If creation fails, report the error and check for a partially created workspace before retrying. Reuse this workspace on revisions; do not create another one.

**Complete when:** the brief is clear, the feature workspace exists, and any consequential open decision is named.

## B. Decision open?

Go to C if a decision changes the outcome, scope, or workflow. Otherwise go to D. Do not reopen decisions that the user or project evidence already settled.

**Complete when:** the next branch is stated.

## C. Settle the decision

Ask one focused question. Explain what the answer changes. When multiple approaches fit, compare their main trade-offs and recommend one. Wait for the user's answer. Record the user's choice or an expressly delegated decision. Then return to B.

**Complete when:** the decision is recorded.

## D. Draft the design

Follow the `public-ref-asd-ste100` skill for clarity. Read the feature workspace's `design.md`. Use its headings as the outline. Draft the design in that file. Preserve existing content outside the intended changes. Define the terms, rules, and responsibilities needed to understand the selected approach.

Describe how the design works from entry to outcome. Include alternate paths, failure, and recovery where they matter. Use a Mermaid flowchart for branching, a sequence diagram for handoffs, or a state diagram for lifecycle rules. Add a diagram only when it clarifies the design. Keep rules and exceptions explicit in prose. Leave detailed requirements, tickets, and tasks to later steps.

**Complete when:** the draft is saved in the feature workspace's `design.md` and shows the observable outcomes, selected direction, and open questions without implying decisions the user did not make.

## E. Ready to save and grill?

Show the draft. Ask the user to approve saving it for the `grill` skill. Wait for the user's response. Return to A if the user requests changes. Continue to F if the user approves. This approval does not authorize a commit. Stop if the user chooses the spec-only path.

**Complete when:** the user approves saving the draft for grilling, requests revisions, or chooses the spec-only path.

## F. Save the design

Save the draft that the user approved for grilling in the same workspace's `design.md`. Preserve existing content outside the approved changes. Leave `spec.md` unchanged for the `sdd-to-spec` skill. Do not create another workspace or edit the ledger.

**Complete when:** `design.md` contains the draft that the user approved for grilling.

## F1. Grill and update the design

Read the saved `design.md` in the feature workspace. Use the `grill` skill to stress-test that design with the user. Summarize the resulting decisions. Wait for the user to confirm them before editing the file or continuing to G.

After confirmation, update the same `design.md` if needed. Preserve content that the decisions do not change. Then continue to G.

**Complete when:** the user confirms the decisions and `design.md` reflects them.

## G. Commit the work

Follow the `public-ref-commit-format` skill for the commit message. Review the working tree and index in the original checkout. Stage only the files created or changed by this workflow, including new feature workspace scaffolding. If unrelated changes are already staged, ask the user how to proceed without including or unstaging them.

Commit the work and verify that the saved design and any new scaffolding are committed. If they are already committed, do not create an empty commit. If the commit fails, report the error and stop before handoff.

**Complete when:** the approved design and any new workspace scaffolding are committed, with no unrelated changes included.

## H. Hand off

Report the design path and ask the user to invoke `/sdd-to-spec` with it. Do not invoke that skill automatically or fill in the spec.

**Complete when:** the user has the committed design's path for spec authoring.
