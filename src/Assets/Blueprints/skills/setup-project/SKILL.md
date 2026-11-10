---
name: setup-project
description: "Use when initializing project guidance, documenting tooling, and establishing domain glossaries for an existing project."
disable-model-invocation: false
user-invocable: true
metadata:
  spindle:
    version: 1.4.0
---

# Setup Project

Initialize the project guidance and curate the commands agents should use. Project tooling varies by repository; register only commands that have been inspected and verified. The tooling registry in `.github/spindle.json` is authoritative, and Spindle regenerates `docs/agents/tooling.md` from it. These entries document commands; Spindle does not execute them.

## Workflow

Announce `Step <node ID> - <node label>` before acting on each node, including resumed steps and loop re-entries. After each decision, state its result and selected branch before entering the target node.

```mermaid
flowchart TD
    A[Initialize project guidance] --> B[Explore the project and its conventions]
    B --> C[Update and verify tooling]
    C --> G{Existing project?}
    G -- Yes --> H[Populate domain glossaries]
    G -- No --> I[Report setup outcome]
    H --> I
```

### A. Initialize project guidance

Run from the target Git working tree:

```sh
spindle project init
```

The command infers the Git root and fails if it cannot. It creates missing project documentation directories, copies the bundled `docs/agents/domain.md` and `docs/agents/ticket-tracker.md` templates when those files are absent, and prepends the bundled Copilot instructions to the front of `.github/copilot-instructions.md` when their exact text does not occur anywhere in that file. Existing instructions are retained, and template text already present anywhere is not duplicated. It initializes the tooling registry with Spindle commands when the registry is new, and regenerates `docs/agents/tooling.md`. Existing tooling entries are preserved.

Initialization's default registrations are separate from the approval gate for subsequent tooling changes.

**Complete when:** initialization succeeds and the command's output confirms the project root and generated tooling guide, selecting B.

### B. Explore the project and its conventions

Read `docs/agents/domain.md`, the relevant glossary and ADRs, and existing project guidance. Inspect the repository's package manifests, task runner configuration, and test/build configuration to identify candidate commands. Do not treat discovery as registration: decide which commands are useful to agents and verify their names and argument forms against their configuration.

Also inspect the source to determine whether this is an existing project: it contains substantive application or library code, not merely scaffold files or manifests. Ask the user if the evidence is ambiguous.

**Complete when:** each candidate command selected for the guide has a verified invocation and a clear documentation section, and the existing-project classification is established, selecting C.

### C. Update and verify tooling

Load and follow the `update-tooling` skill. Supply the verified candidate commands and relevant configuration paths found in B as explicit context, and request a full registry comparison for initial setup. That skill owns the proposal, explicit approval, revision loop, registry mutations, and generated-guide verification; do not duplicate or bypass its approval gate.

**Complete when:** the delegated workflow has returned with the registry and guide verified, selecting G. If approval is pending, wait; if it reports failures or discrepancies, report the blocker and stop rather than claiming setup is complete.

### G. Existing project?

Use the classification established in B. Only an existing project with substantive application or library code proceeds to domain modeling. A new project containing only scaffold files or manifests skips it; do not create empty glossary files or invent a domain model.

**Complete when:** an existing project selects H or a new project selects I.

### H. Populate domain glossaries

Load and follow the `int-domain-modeling` skill. Use the existing code and user input to establish domain terms and context boundaries. Resolve ambiguities and conflicts with the user rather than treating implementation names as authoritative terminology. Preserve existing definitions unless a change is agreed, and capture resolved terms as they become clear.

For a single context, populate or refine the root `GLOSSARY.md`. For multiple contexts, populate or refine the context glossaries and `GLOSSARY-MAP.md`, including links to the glossaries and the relationships between contexts. Create the map only when multiple contexts are established. Keep glossaries free of implementation details and create files only when there are resolved terms to record.

**Complete when:** resolved domain terms are recorded in the appropriate glossaries, multiple established contexts are mapped with valid links, and any unresolved questions are explicitly identified, selecting I.

### I. Report setup outcome

Summarize initialization, tooling changes applied or declined, guide verification, and domain documentation populated or skipped with the reason. Identify unresolved questions or blockers without claiming they are complete.

**Complete when:** the user has an accurate setup outcome and any remaining actions.
