---
name: sdd-grill-design
description: "Challenge and refine an existing design through an interview, updating the design and relevant domain documentation."
argument-hint: "[design.md path or feature directory]"
disable-model-invocation: true
user-invocable: true
metadata:
  spindle:
    version: 1.1.0
---

Challenge and refine an existing design through an interview, keeping the selected design as the source of truth. A feature design is optional, but when present it precedes the spec and tickets.

## Select the design

- **The user supplies a design:** read that file. For a supplied numbered SDD feature directory, read its `design.md`. An explicit target takes precedence over discovery and may have `spec.md`, `sdd.json`, and issue data alongside it. If the target is missing or unreadable, report the problem and ask for a corrected path; keep the target unresolved.
- **No design supplied:** scan numbered feature directories directly under `.scratch/` for `design.md` files whose sibling `spec.md` is still an unfilled template. Do not require `design.md` to be the directory's only file; SDD workspaces also contain their spec template, ledger, and tracker folders. Inspect candidates and present their paths; ask the user which design to grill, even when there is only one. Never automatically pick the newest.
- If `.scratch/` is absent or no candidates qualify, explain that no unfilled SDD design was found and ask for a design path. Do not substitute an ineligible design or create a new one.

**Complete when:** the user has supplied or selected one readable design.

## Required skills

Before acting, read and understand each required skill:

- **REQUIRED:** `grill`
- **REQUIRED:** `int-domain-modeling`

These skills define the interview and domain-modeling workflows.

## Refine and finish

Aim for the smallest design that satisfies the agreed goal and success criteria. Challenge unnecessary requirements and complexity as actively as missing decisions. Recommend additional scope only when needed to meet those criteria, explaining the concrete failure it prevents; optional improvements remain out of scope unless the user expands the goal.

Read the selected design and relevant supporting context, including its feature spec when present. Ground the interview in the proposal, verified facts, and unresolved decisions. When a spec already contains substantive content, preserve the design-before-spec sequence: do not silently reorder or overwrite either document.

As answers settle decisions, update the selected design in place, reconciling affected passages and preserving unrelated content. Keep unresolved questions explicit; recommendations are not accepted decisions. Recording accepted decisions in the design and relevant domain documentation is part of the interview: the shared-understanding confirmation gate in `grill` does not defer these updates.

Once every decision branch within the agreed scope is settled and the design and relevant domain documentation are consistent, summarize the refinements, link the changed documents, and ask the user to confirm shared understanding. Revise and repeat if corrections remain.

Stop when the user confirms the refined design. Do not generate a spec, tickets, or implementation, or automatically invoke a delivery workflow.
