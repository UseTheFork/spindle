# Subagent-driven development

**Subagent-driven development (SDD)**:
The controller-owned workflow that dispatches implementation and review to
subagents and records evidence before acceptance, integration, and delivery.

**Feature workspace**:
A numbered `.scratch/<feature-id>-<slug>/` directory containing `spec.md`,
`sdd.json`, issue records, and reports.

**Issue**:
An attributed `I-<number>` Markdown record describing work, its triage decision,
and dependencies. Execution state is recorded separately in the feature ledger.

**Controller**:
The recorded owner authorized to dispatch assignments, adjudicate corrections,
and advance an issue or delivery. A handoff requires confirmation that the
previous controller stopped.

**Assignment**:
A recorded implementation or review dispatch with an identity, controller,
report path, and submission state.

**Correction attempt**:
A bounded dispatch addressing canonical findings or a specified failed check,
with recorded progress assessment and outcome.

**Canonical finding**:
A stable `F-<number>` review observation with report provenance and attributed
dispositions. Linking additional observations does not create duplicate findings.

**Requirements decision**:
An attributed approval or rejection of a requirements change, tied to the
requirements snapshot and requiring fresh review.

**Evidence snapshot**:
The identity of relevant code and requirements used to detect stale checks,
review reports, and accepted evidence.

**Acceptance**:
The gate confirming current passing checks, complete review coverage, and
resolved blocking findings before integration.

**Integration**:
Preparation of accepted files for a caller-owned Git commit, or verification of
an existing caller-created commit. Spindle does not create the commit.

**Delivery**:
The aggregate feature scope with its own assignments, checks, findings, review,
and optional required retrospective before completion.
