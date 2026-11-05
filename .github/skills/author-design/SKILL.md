---
name: author-design
metadata:
  spindle:
    version: 1.0.0
description: "Use when a user asks to author a design for a feature, workflow, or behavior that has important product decisions to settle."
disable-model-invocation: true
user-invocable: true
---

# Authoring a Design

Help the user clarify what they want before turning an idea into a design. Use this for product and project decisions, not as a gate for a clear, bounded task. This skill focuses on creating a structured design document that captures the intent, decisions, and trade-offs for a feature, workflow, or behavior.

## Process

1. **Check the brief.** Identify the user's goal, why it matters, what success means, and which important decisions remain open. In an existing project, inspect the relevant code, docs, or supplied context first; don't ask the user for facts the project already answers. If the request is specific and leaves no consequential decision open, proceed with the requested task. **Complete when** the brief is either actionable or has a concrete unresolved decision.

2. **Clarify the outcome.** When a consequential decision is open, ask one focused, open question about the uncertainty that most changes the result. Explain briefly what the answer will affect. Build on what the user says and ask follow-ups only for decisions that remain unresolved. If the user delegates a consequential decision, state your recommendation and why, then ask them to confirm or correct it before treating it as settled. **Complete when** the goal, success criteria, scope, and material constraints are understood or explicitly marked as assumptions.

3. **Compare approaches.** Before writing the design, present two or three viable approaches grounded in the project and the clarified goal. Explain the main trade-off, recommend one, and ask the user to choose. If only one approach fits, explain why the alternatives do not. Wait for the choice before drafting. **Complete when** the user has selected an approach or delegated that choice to you.

4. **Write the design.** Create `.scratch/YYYY-MM-DD-<feature-slug>/design.md`, using the date the feature directory is created and reusing that directory for the same feature. Keep it concise, but include the intent and success criteria, scope and constraints, considered approaches and trade-offs, the selected direction, and any assumptions or decisions left to implementation. **Complete when** the document reflects the conversation and distinguishes user decisions from your recommendations.

5. **Get approval.** Share the design document and ask the user to approve or correct it. Treat approval as applying to the document they have actually seen. Do not begin implementation until they approve it. If they opt out of brainstorming or ask you to proceed without a design, respect that choice, state any consequential assumptions, and continue only within their request. **Complete when** the design is approved, corrected for another review, or the user has opted out.

## Keep the conversation useful

- Prefer the user's own description before suggesting solutions; offer recommendations when asked or when the user delegates a decision.
- Keep questions specific to the project, and avoid reopening decisions already settled by the user or existing evidence.
- For a small change, use a short design; for a larger effort, include enough context for implementation without requiring the user to repeat the discussion.
