---
name: sdd-to-spec
description: "Turn an agreed feature request or approved design into a spec in its SDD feature workspace, then publish it to the configured ticket tracker."
argument-hint: "[design file path]"
disable-model-invocation: true
metadata:
  spindle:
    version: 1.1.1
---

# To Spec

Turn an agreed feature request or an approved design into a codebase-grounded spec, then publish it to the configured ticket tracker. A design is optional; when one exists, it must be completed and approved before the spec, and tickets follow the spec.

Use the ticket-tracker conventions in project guidance when available. If tracker or publication status is unclear, ask the user before publishing; do not assume labels or invent status values.

## Argument

An optional design file path may be supplied. Read the entire file before drafting. Without a path, use the already-agreed requirements in the conversation; do not restart requirements discovery.

## Workflow

1. **Select the requirements source.**
   - With a design path, treat that complete design as the requirements source. Older conversation cannot override it; apply only explicit user-requested changes and use other conversation as non-conflicting context.
   - Without a design path, reuse an existing SDD feature workspace from the task context and treat its `design.md`, when present, as the requirements source. If no workspace design exists, use the agreed conversation. Do not require a design or create one automatically.
   - If the supplied path is missing, unreadable, or ambiguous, explain the problem and ask for a corrected reference. Do not fall back to chat.
   - Preserve unresolved decisions as open questions in Further Notes. Resolve gaps that block a ready-for-agent spec before publishing.

   **Complete when:** the source is unambiguous and every supplied design has been read in full.

2. **Select or create the SDD feature workspace.**
   - Reuse the existing numbered `.scratch/<feature-id>-<slug>/` workspace when the selected design or spec belongs to one. Use its `spec.md`; do not create a second workspace for the same feature.
   - Otherwise, derive a concise feature title from the agreed request and choose an author identity for this run. Run `pnpm spindle sdd create --title "<feature title>" --author "<author>"`; add `--with-design` when the selected design must be retained in the new workspace. If using a design outside `.scratch`, copy that approved source into the newly created `design.md`, replacing only the fresh template. Save the returned `spec` path and continue in that workspace.
   - When the workspace has `design.md`, read it fully and use it as the requirements source. If it still contains `[PLACEHOLDER]` markers or has not been approved, pause and ask the user to finish or approve the design before drafting the spec.
   - The selected SDD workspace's pre-created `spec.md` is the output. Replace its template content with the completed spec; do not create a dated folder or a second spec.

   **Complete when:** one numbered SDD feature workspace is selected, its spec path is known, and any present design is complete and approved.

3. **Explore and confirm the test seams.**
   - Explore the repo to understand the current state if it has not already been explored. Use the relevant domain glossary and ADRs.
   - Sketch the highest useful seams at which the feature should be tested. Prefer existing seams. If new seams are needed, propose them at the highest practical boundary.
   - Ask the user to confirm the proposed seams before drafting. If the user corrects them, update the seam proposal and confirm the revision.

   **Complete when:** the codebase context and user-confirmed test seams are recorded.

4. **Write and publish the spec.**
   - Fill the sections in the SDD-created `spec.md`: Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, and Further Notes.
   - Give each important user story a concise, observable acceptance outcome or example scenario focused on user-visible behavior. Leave implementation-slice completion criteria to tickets; no fixed scenario format is required.
   - Use domain glossary terms. Do not include file paths or code snippets unless a prototype captures a decision more clearly than prose.
   - Publish the completed spec according to the configured ticket-tracker guidance. Ask before publishing if the destination or status is unclear.
   - Once the spec is published, ask the user to invoke `/sdd-to-tickets` for planning. Do not invoke it automatically or start implementation here.

   **Complete when:** the spec is published at the feature workspace's `spec.md` path, tracker publication is resolved, and no blocking ambiguity is hidden.
