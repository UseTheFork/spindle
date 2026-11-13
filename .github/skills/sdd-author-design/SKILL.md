---
name: sdd-author-design
description: "Use when a user asks to author a design for a feature, workflow, or behavior that has important product decisions to settle."
disable-model-invocation: true
user-invocable: true
metadata:
  spindle:
    version: 1.1.2
---

# Authoring a Design

Help the user clarify what they want before turning an idea into a design. A design is optional; when one is created, it is authored and approved before its spec, and tickets follow the spec. Use this for product and project decisions, not as a gate for a clear, bounded task or a user who wants a spec without a design.

## Required skills

Before drafting or editing, read:

- **REQUIRED:** `asd-ste100`

Apply the clarity rules from the `asd-ste100` skill. Include a before/after table only when the user requests one.

## Process

1. **Check the brief.** Identify the user's goal, why it matters, what success means, and which important decisions remain open. In an existing project, inspect relevant code and docs first; do not ask for facts the project already answers. If the user asks for a design and the request is specific with no consequential decision open, proceed to the design without unnecessary questioning. **Complete when** the brief is actionable or a concrete unresolved decision is identified.

2. **Clarify the outcome.** Ask one focused, open question about the uncertainty that most changes the result. Explain briefly what the answer will affect. Build on the user's responses and ask follow-ups only for unresolved decisions. If the user delegates a consequential decision, state your recommendation and why, then ask for confirmation before treating it as settled. **Complete when** goal, success criteria, scope, and constraints are understood or explicitly marked as assumptions.

3. **Compare approaches.** Present two or three viable approaches grounded in the project and clarified goal, explain their main trade-offs, recommend one, and ask the user to choose. If only one approach fits, explain why alternatives do not. Wait for the choice before drafting. **Complete when** the user has selected an approach or delegated the choice.

4. **Create or select the SDD feature workspace.**
   - For a new feature, choose a concise title and author identity, then run `pnpm spindle sdd create --title "<feature title>" --author "<author>" --with-design`. Use the returned workspace and spec paths; `design.md` is beside `spec.md`. The command creates both template files, but fill and approve the design before filling the spec.
   - For an existing numbered SDD feature workspace, reuse it. If `design.md` already exists, preserve it and edit it only as requested. If it is missing, first confirm `spec.md` is still the untouched template; then copy the design template from the Spindle installation's `assets/Templates/sdd/design.md` into that workspace without overwriting existing files.
   - If the existing spec has substantive content, stop before adding or revising a design: that would put design after spec. Explain the conflict and ask whether the user wants to continue as an explicit exception or keep the feature spec-only.
   - Do not create a dated feature directory or a second SDD workspace for the same feature.

   **Complete when** a single numbered feature workspace is selected and its `design.md` exists without overwriting user content.

5. **Write the design.** Use the existing `design.md` scaffold, replacing its `[PLACEHOLDER]` fields with the selected intent, success criteria, scope and constraints, considered approaches and trade-offs, chosen direction, and assumptions or open decisions. Write success criteria as observable outcomes that show the design achieves its intent; include measurable targets where practical without inventing precision. Leave detailed requirements and acceptance scenarios to the subsequent spec. Preserve unresolved decisions explicitly. **Complete when** the design represents the conversation, states observable success outcomes, and distinguishes user decisions from recommendations.

6. **Get approval.** Share the design path and its content for user approval or correction. Do not begin spec drafting until the user approves the design. If the user opts out of brainstorming or asks for a spec without design, respect that choice; do not create a design as a gate. After approval, ask the user to invoke `/sdd-to-spec` to create the spec in the same feature workspace; do not invoke it automatically. **Complete when** the design is approved, corrected for another review, or the user has chosen the spec-only path.

## Keep the conversation useful

- Prefer the user's own description before suggesting solutions; offer recommendations when asked or when the user delegates a decision.
- Keep questions specific to the project, and avoid reopening decisions already settled by the user or verified project evidence.
