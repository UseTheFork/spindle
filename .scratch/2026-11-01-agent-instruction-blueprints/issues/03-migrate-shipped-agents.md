# 03: Migrating the Remaining Shipped Agents

Category: enhancement
Status: ready-for-agent
Execution: integrated
Reporter: unknown

**What to build:** Ship the remaining `sdd-*` and `shared-*` Agents as versioned Agent Blueprints, so they can be installed and maintained by Spindle without depending on paths inside Spindle's source tree.

**Blocked by:** 01: Installing and Updating an Agent Blueprint.

- [ ] Migrate the six `sdd-*` Agents and the remaining `shared-*` Agents, excluding `shared-r` already shipped by ticket 01.
- [ ] Each migrated Agent has valid frontmatter including `version: 1.0.0`, and retains its supported Agent metadata and content.
- [ ] Rewrite Skill references to point to installed Skills, and ensure literal Nunjucks-looking content survives rendering.
- [ ] Update this repository's tracked Agent copies to match the shipped content and version, so they are not treated as unversioned installed files.
- [ ] Keep `ask.agent.md` local-only and do not ship Instruction content.
- [ ] CLI integration tests verify all production Agents install with expected filenames, rendered content, valid versions, and working relative Skill links for supported Stack selections.
- [ ] Verify the migrated Agent files are still loadable by VS Code.

## Comments


**2026-11-01T23:00:00Z - @copilot**
Execution: implementing; checkout `/home/sincore/source/spindle`, base `559c0b4`, which includes integrated tickets 01 and 02, with a clean worktree. Per the maintainer, keep new tests minimal.

**2026-11-01T23:03:33Z - @copilot**
Execution: in-review; [implementation report](../reports/03-implementation.md). Controller checks: 246/246 regression tests passed (known baseline inventory assertion excluded), types and lint passed, and diff whitespace passed. Formatting adjusted both shared-explore copies; changed-file formatting then passed, with all eight production tests rerun successfully on the final snapshot. Frozen code/test/doc fingerprint: `721690c5e5aa5b3b71dedc1a98006ae85ea6fff7286657371d406e2a8feb0051`, over the sorted 21 ticket paths. VS Code Agent loading remains an explicit acceptance gap.

**2026-11-01T23:13:59Z - @copilot**
Execution: accepted; [code review](../reports/03-code-review.md), [code-slop review](../reports/03-code-slop-review.md), and [Spec/Quality review](../reports/03-task-review.md) found no implementation defects. Their only blocking gap, 03-CR-01/T03-SQ-01, is closed by the maintainer's explicit confirmation: "Verified: all migrated Agents load" in VS Code, including non-user-invocable subagents with version metadata. No code change or corrective dispatch was needed.

**2026-11-01T23:13:59Z - @copilot**
Execution: integrated; fingerprint rechecked unchanged at `721690c5e5aa5b3b71dedc1a98006ae85ea6fff7286657371d406e2a8feb0051`. Current check coverage remains valid: 246/246 regression tests and types/lint passed; formatting-only changes were followed by clean formatting and 8/8 production tests; fresh whitespace check passes. Integration commit follows. No publication or ticket-closure action is taken.
