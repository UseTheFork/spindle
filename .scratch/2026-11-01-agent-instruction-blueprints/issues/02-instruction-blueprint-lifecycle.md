# 02: Enabling Instruction Blueprints

Category: enhancement
Status: ready-for-agent
Execution: integrated
Reporter: unknown

**What to build:** Enable Instructions as a Blueprint kind using the single-file lifecycle established for Agents, so future Instruction Blueprints can install and update through the existing CLI. Ship no Instruction content in this ticket.

**Blocked by:** 01: Installing and Updating an Agent Blueprint.

- [ ] Register an Instruction handler that accepts an `INSTRUCTION.md` entry file and installs it as one Instruction file with the expected filename.
- [ ] Instruction Blueprints use the shared Stack selection, rendering, conflict, symlink-safety, and version-update behavior.
- [ ] Require valid rendered SemVer metadata for shipped Instructions and preserve warning/skip behavior for installed Instructions with missing or invalid versions.
- [ ] A missing or empty Instruction source collection does not prevent Agent and Skill `init` or `update`; an Instruction fixture exercises installation and version update through the CLI.
- [ ] Keep production Instruction content absent and ensure successful summaries do not report an empty kind as installed content.
- [ ] Extend the local authoring guide to document Instruction Blueprint layout and metadata.
- [ ] CLI integration tests verify Instruction installation, update, conflict handling, Stack selection, and the empty production kind.

## Comments

**2026-11-01T22:42:00Z - @copilot**
Execution: implementing; checkout `/home/sincore/source/spindle`, base `9e3ba0a`, which includes integrated ticket 01, with a clean worktree. Per the maintainer, keep new tests minimal and limited to the acceptance criteria.

**2026-11-01T22:58:00Z - @copilot**
Execution: integrated; [implementation report](../reports/02-implementation.md), fingerprint `8e53fb9681b451485fd49a5f9f60ede432db7ebb918a1ef80fa7ecb83dac5f20`. Controller verification passed 246/246 tests, with the baseline inventory assertion excluded; types, lint, and changed-file formatting also passed. The controller reviewed the diff directly: the handler mirrors the Agent handler, and the change is limited to registration, help text, and documentation. Per maintainer direction, there was no separate review cycle. Closed and committed.
