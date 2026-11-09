# SDD test handoff

Use `int-test-driven-development` for sequencing, test quality, and review of RED/GREEN evidence, and `int-verification-before-completion` for evidence-backed claims.

The implementer owns focused behavioral tests. Formatting, lint, type checks, and ticket-wide regression checks belong to the [controller gate](../SKILL.md#d-controller-checks), unless scheduled for the worker or needed for a concrete diagnosis. An approved command list alone does not schedule checks.

Use the assigned report to record commands/results, tested snapshot, failures, and checks not run, with a concise test-first or pure-refactor summary. Per-slice provenance, an evidence matrix, and controller release records are not required. On resume, read the report and rerun relevant tests if results are stale or missing.

**Implementation handoff complete when:** relevant tests pass after the final code edit, the report identifies what was checked, and limitations and pending controller checks are explicit. This is readiness for review, not ticket integration. Failed or unavailable required checks remain unresolved, not success.
