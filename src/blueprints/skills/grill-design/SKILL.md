---
name: grill-design
description: "Challenge and refine an existing design through an interview, updating the design and relevant domain documentation."
argument-hint: "[design.md path or feature directory]"
disable-model-invocation: true
user-invocable: true
meta:
  spindle:
    version: 1.0.0
---

# Grill Design

Sharpen an existing design through a decision-tree interview, keeping the selected design as the source of truth.

## 1. Select the design

- **The user supplies a design:** read that file. For a supplied feature directory, read its `design.md`. An explicit target takes precedence over discovery and may have other files alongside it. If it is missing or unreadable, report the problem and ask for a corrected path; keep the target unresolved.
- **No design supplied:** scan the dated feature directories directly under `.scratch/`. A candidate must contain `design.md` as its sole file, counting hidden files and files in nested directories. Inspect directory contents, not just `design.md` matches; exclude folders containing a spec, tickets, notes, or any other file.
- Present eligible candidates with their paths and ask the user which design to grill. Wait for selection even when there is only one candidate; never automatically pick the newest.
- If `.scratch/` is absent or no candidates qualify, explain that no design-only folder was found and ask for a design path. Do not substitute an ineligible design or create a new one.

Use `ask_user` for selection and interview questions when available.

**Complete when:** the user has supplied or selected one readable design.

## 2. Ground the interview

Read the selected design and its relevant supporting context, including nearby specs when present. Inspect the code for claims about current behavior. Consult `GLOSSARY-MAP.md` for the owning glossary when present, otherwise `GLOSSARY.md`, and relevant ADRs.

Before interviewing, load these required skills:

- **REQUIRED:** `int-grilling` ([guidance](../int-grilling/SKILL.md)).
- **REQUIRED:** `int-domain-modeling` ([guidance](../int-domain-modeling/SKILL.md)).

**Complete when:** the current proposal, supporting facts, and unresolved decisions are identified and both required skills are loaded.

## 3. Grill and refine

Apply `int-grilling` to the selected design, using its frontier rounds, recommendations, and dependent-question sequencing. Challenge assumptions, scope, failure cases, and success criteria rather than asking the user to repeat known facts.

As answers settle decisions, update the selected `design.md` in place, reconciling affected passages and preserving unrelated content. Keep unresolved questions explicit; recommendations are not accepted decisions. Apply `int-domain-modeling` to capture resolved terminology and qualifying ADRs as the discussion progresses.

**Complete when:** every decision branch is settled, the design reflects the answers without contradictions, and relevant domain documentation is consistent.

## 4. Confirm and stop

Summarize the refinements, link the updated design and any domain documents changed, and ask the user to confirm shared understanding. Revise and repeat if corrections remain.

This workflow ends with the refined design and confirmation. Do not generate a spec, tickets, or implementation, or automatically invoke a delivery workflow.

**Complete when:** the user confirms the refined design represents the shared understanding.
