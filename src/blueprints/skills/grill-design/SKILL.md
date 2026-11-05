---
name: grill-design
description: "Challenge and refine an existing design through an interview, updating the design and relevant domain documentation."
argument-hint: "[design.md path or feature directory]"
disable-model-invocation: true
user-invocable: true
metadata:
  spindle:
    version: 1.0.1
---

Challenge and refine an existing design through an interview, keeping the selected design as the source of truth.

## Select the design

- **The user supplies a design:** read that file. For a supplied feature directory, read its `design.md`. An explicit target takes precedence over discovery and may have other files alongside it. If it is missing or unreadable, report the problem and ask for a corrected path; keep the target unresolved.
- **No design supplied:** scan the dated feature directories directly under `.scratch/`. A candidate must contain `design.md` as its sole file, counting hidden files and files in nested directories. Inspect directory contents, not just `design.md` matches; exclude folders containing a spec, tickets, notes, or any other file.
- Present eligible candidates with their paths and ask the user which design to grill. Wait for selection even when there is only one candidate; never automatically pick the newest.
- If `.scratch/` is absent or no candidates qualify, explain that no design-only folder was found and ask for a design path. Do not substitute an ineligible design or create a new one.

**Complete when:** the user has supplied or selected one readable design.

## Required skills

Before acting, read and understand each required skill:

- **REQUIRED:** `grill`
- **REQUIRED:** `int-domain-modeling`

These skills define the interview and domain-modeling workflows.

## Refine and finish

Aim for the smallest design that satisfies the agreed goal and success criteria. Challenge unnecessary requirements and complexity as actively as missing decisions. Recommend additional scope only when needed to meet those criteria, explaining the concrete failure it prevents; optional improvements remain out of scope unless the user explicitly expands the goal.

Read the selected design and relevant supporting context, including nearby specs when present. Ground the interview in the proposal, verified facts, and unresolved decisions.

As answers settle decisions, update the selected design in place, reconciling affected passages and preserving unrelated content. Keep unresolved questions explicit; recommendations are not accepted decisions. Recording accepted decisions in the design and domain documentation is part of the interview: the shared-understanding confirmation gate in `grill` does not defer these updates.

Once every decision branch within the agreed scope is settled and the design and relevant domain documentation are consistent, summarize the refinements, link the changed documents, and ask the user to confirm shared understanding. Revise and repeat if corrections remain.

Stop when the user confirms the refined design. Do not generate a spec, tickets, or implementation, or automatically invoke a delivery workflow.
