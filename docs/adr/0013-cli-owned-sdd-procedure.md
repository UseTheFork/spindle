---
status: accepted
---

# Make the CLI own SDD procedure

The SDD CLI is the source of truth for workflow steps, deterministic values,
ownership, and recovery; agents provide judgment and content the CLI cannot
derive. The orchestrator owns workflow state, while assigned workers commit
their work and provide reports. Separate ticket and feature reviews, explicit
delivery ownership, and recorded post-merge and final validation preserve
review and recovery boundaries while allowing safe parallel implementation.

This decision supersedes ADR-0006's review and completion assumptions. See
[SDD-WORKFLOW-REDESIGN.md](../../SDD-WORKFLOW-REDESIGN.md) for the command
contract and recovery details.
