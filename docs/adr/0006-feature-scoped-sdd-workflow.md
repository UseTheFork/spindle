---
status: accepted
---

# Feature-scoped ticket tracking and completion

ADR-0011 replaces this decision's ticket integration and Git workflow
assumptions; feature-scoped tracking and review remain applicable.

SDD tracks independently actionable work as feature-scoped tickets with open, in-progress, or closed status; readiness and dependency blocking are derived from ticket state. The feature owns the final review and verification gates: one comprehensive review is required by default, optional catalog-approved reviewer agents may be added, and relevant tests must pass before completion. Review findings return work to the affected ticket; ticket-level review, acceptance, and integration are not separate required lifecycles. Git commit and integration remain in the project's normal workflow after SDD completion.
