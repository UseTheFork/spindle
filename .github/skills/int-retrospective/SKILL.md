---
name: int-retrospective
version: 1.0.0
description: "This is an internal skill do not load it unless explicitly required by the user or another skill."
user-invocable: false
---

# Delivery Retrospective

Capture what a finished delivery teaches about the agent environment and the domain model. Run at `int-subagent-driven-dev`'s retrospective step after final verification: once for the entire spec, or once for a standalone ticket, never per ticket within a spec. A smooth run still gets one. The output is **proposals**: this skill applies nothing.

The controller dispatches; a fresh reader assesses. The agent that ran delivery does not grade its own run.

## Workflow

1. **Collect evidence pointers.** List the spec or brief, every ticket file with its `## Comments` log, the integration range (starting and final revision), the final review report, and existing applicable `.github/instructions` files (or their absence). Pass pointers, not your account of how it went.

   **Complete when:** every ticket and log is listed with the revision range.

2. **Dispatch a fresh reader.** Fill every input placeholder in the [retrospective contract](./retrospective-prompt.md) for one read-only subagent. Include its Required Reader Skills section unchanged: the reader must load `int-domain-modeling` before assessing evidence and consult `int-writing-instruction` when assessing instruction candidates, applying analysis guidance within the contract's proposals-only boundary.

   **Complete when:** the reader confirms applicable required skills were loaded and returns a report including scoped instruction suggestions (or "None"), or reports why a prerequisite could not be satisfied; a missing prerequisite is not a completed assessment.

3. **Record proposals.** Write the report to `.scratch/YYYY-MM-DD-<feature-slug>/retrospective.md` in the delivered spec or ticket's existing dated directory. Drop any finding that does not cite a ticket comment, review finding, or revision.

   **Complete when:** the file exists, every finding cites evidence, and no glossary, ADR, instruction, standards, check, or skill file has changed.

4. **Hand to the maintainer.** Report the path and the highest-severity proposals. Approval happens item by item through `/retrospective`; domain proposals are resolved with the maintainer through `int-domain-modeling`. Instruction suggestions remain briefs for approval, not completed instruction files; use `int-writing-instruction` for full authoring and validation only after approval. A blanket "just apply it" is a request to review, so list the proposals for item-level approval.

   **Complete when:** the maintainer has the path and the list of pending proposals.

## Common mistakes

- Skipping the retrospective because the run went fine or the maintainer is busy; recording "None" findings is cheap and keeps the record complete.
- Routing terminology drift on integrated work to triage; it belongs in the retrospective's domain proposals.
