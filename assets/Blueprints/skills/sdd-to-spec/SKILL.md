---
name: sdd-to-spec
description: "Turn an agreed feature request or approved design into a spec in an SDD feature workspace."
argument-hint: "[design file path]"
disable-model-invocation: true
metadata:
  spindle:
    version: 2.0.1
---

# To Spec

Write a spec that reflects the agreed requirements and the repository. Save it in an SDD feature workspace. Do not create tickets or start implementation.

Accept one optional design file path. If omitted, use the feature workspace's `design.md` when present. Otherwise, use the requirements already agreed in the conversation.

## Workflow

1. **Confirm the source and workspace.**
   - Reuse the existing feature workspace for this feature, if there is one. Identify its original checkout. If the feature or checkout is ambiguous, ask the user.
   - Read the selected design in full. If a supplied path is missing or unreadable, ask for a corrected path. If the design is incomplete or unapproved, ask the user to resolve it before drafting.
   - Use the approved design as the requirements source. Apply explicit user changes, but do not let older conversation override the design. If no design applies, use the agreed requirements. Do not create a design here.

   **Complete when:** the requirements source is clear, any selected design is approved, and the original checkout and workspace status are known.

2. **Explore and confirm the test seams.**
   - Explore the repo to understand the current state if it has not already been explored. Use the relevant domain glossary and ADRs.
   - Sketch the highest useful seams at which the feature should be tested. Prefer existing seams. If new seams are needed, propose them at the highest practical boundary.
   - Ask the user to confirm the proposed seams before drafting. If the user corrects them, update the seam proposal and confirm the revision.

   **Complete when:** the codebase context and user-confirmed test seams are recorded.

3. **Draft the spec.**
   - Give the spec a feature title. Use these sections: Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, and Further Notes.
   - Follow the `private-ref-ears` skill when writing observable behavior requirements and acceptance outcomes.
   - Give each important user story a concise, observable acceptance outcome or example scenario focused on user-visible behavior. Leave implementation-slice completion criteria to tickets; no fixed scenario format is required.
   - Use domain glossary terms. Do not include file paths or code snippets unless a prototype captures a decision more clearly than prose.
   - Record unresolved decisions in Further Notes. Resolve questions that block ticket planning before asking the user to approve the spec.

   **Complete when:** the user approves the spec and no open question blocks ticket planning.

4. **Save the spec and hand off.**
   - If the feature workspace exists, save the spec as its `spec.md`. Create that file if the workspace was created with only a design. Do not create a second workspace or edit the ledger.
   - Otherwise, derive a lowercase kebab-case slug. Run `{{ computed.spindle_package_manager }} spindle sdd create --slug "<slug>" --spec "<spec Markdown>"` from the original checkout. Pass the approved design Markdown with `--design` when a design applies. Either text flag accepts `-` for standard input, but only one can use it per command.
   - Use the workspace path returned by `sdd create` to locate the new `spec.md`. If creation fails, report the error. Check for a partially created workspace before retrying.
   - Report the saved spec path. Ask the user to invoke `/sdd-to-tickets` with that path. Do not invoke it automatically.

   **Complete when:** the approved spec is saved in one feature workspace and the user has its path for ticket planning.
