Reporter: unknown
Category: enhancement
Status: ready-for-agent
Execution: integrated

# 01: Remove the Just CLI prerequisite

**What to build:** Spindle users can run CLI commands without installing Just. Spindle no longer checks for the executable or directs users to install it.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Remove the Just executable prerequisite and its installation guidance.
- [ ] Remove Just-specific prerequisite tests while preserving unrelated CLI coverage; do not add replacement tests.
- [ ] Leave the repository's Just-based developer workflow unchanged.

## Comments

**2026-11-03T21:37:06Z - unknown**
Execution: claimed → implementing at snapshot `01702de56544cd9dcaa6f3352bbd7cf13278b52b`; controller selected this dependency-free ticket for sequential delivery.

**2026-11-03T21:47:03Z - unknown**
Execution: in-code-review at base `01702de56544cd9dcaa6f3352bbd7cf13278b52b` plus the current working diff; the controller gate passed targeted formatting, lint, types, and 38 CLI regression tests, while the repository-wide format check reports 77 pre-existing out-of-scope files.

**2026-11-03T21:50:21Z - unknown**
Execution: changes-requested → implementing, corrective round 1 of 5; task finding `T01-1` and code-slop finding `S01-1` require removing the obsolete fake Just PATH setup and unused help-test Git workspace while preserving generic assertions.

**2026-11-03T21:54:36Z - unknown**
Execution: in-review after corrective round 1; targeted formatting, lint, types, and 38 CLI regression tests pass on the current worktree snapshot. Scoped re-review is assigned for findings `T01-1` and `S01-1`.

**2026-11-03T21:57:48Z - unknown**
Execution: accepted → integrated at the current ticket snapshot. Initial code review found no issues; task Spec/Quality and code-slop findings `T01-1` and `S01-1` were addressed and cleared by `reports/01-round-1-review.md`. Targeted formatting, lint, types, and 38 CLI regression tests pass; the repository-wide format check remains limited by 77 pre-existing out-of-scope files.
