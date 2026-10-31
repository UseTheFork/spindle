Category: enhancement
Status: ready-for-agent
Execution: integrated
Reporter: unknown

# 01: Migrate Skills to the Blueprint lifecycle

**What to build:** As a Spindle maintainer, I want Skills managed through the shared Blueprint lifecycle, so that `init` and `update` retain their user-facing behavior while the architecture is ready to support additional Blueprint kinds.

**Blocked by:** None (can start immediately).

- [ ] A static TypeScript registry connects the shared lifecycle engine to a Skill handler; the registry initially contains Skills only.
- [ ] The Skill handler declares the Skill source, destination, and metadata/lifecycle rules, while common discovery, rendering, installation, and reconciliation behavior is shared.
- [ ] Unified `init` and `update` commands use this lifecycle and preserve Skill version-aware updates and existing conflict behavior.
- [ ] The Skill handler and its Markdown Blueprints are organized together; no backwards-compatibility layer for the prior internal source layout is added.
- [ ] Project Config continues to store selected Stacks and user Variable values, which are passed explicitly to lifecycle behavior rather than stored in mutable global state.
- [ ] Shared Variable names and definitions are declared in typed TypeScript and use a single namespace and value across Blueprint kinds and selected Stacks.
- [ ] Markdown is rendered with Nunjucks before frontmatter is parsed with `gray-matter`; all project frontmatter parsing uses `gray-matter`, with kind-specific metadata validation.
- [ ] Shared and nested text content renders with Stack conditionals and Variables; non-renderable files retain their existing byte-preserving behavior.
- [ ] CLI-level `init` and `update` tests using fixture Blueprints verify generated content, Config, rendering, frontmatter/version behavior, and relevant existing Skill lifecycle outcomes.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-10-31T17:32:53Z - @unknown**
Execution set to `claimed` at `d63e527fc49538f7d7586e7bada8ecf871a0680f`; the controller selected this unblocked ticket for delivery.

**2026-10-31T17:33:20Z - @unknown**
Execution set to `implementing` at `d63e527fc49538f7d7586e7bada8ecf871a0680f` plus this tracker update; the ticket is dispatched for implementation.

**2026-10-31T17:42:00Z - @unknown**
Execution set to `in-code-review` at the uncommitted ticket 01 worktree based on `d63e527fc49538f7d7586e7bada8ecf871a0680f`; the implementation, both corrective rounds, and controller checks are ready for review. Implementation evidence: `../reports/01-implementation.md`.

**2026-10-31T18:12:00Z - @unknown**
Execution set to `changes-requested` at the same uncommitted worktree based on `d63e527fc49538f7d7586e7bada8ecf871a0680f`; initial reviews identified a globally required but unused test Variable that breaks ordinary init, Skill-specific semver assumptions in the shared handler contract, and overly broad templated-version detection. See the corrected-snapshot review reports and round 3 corrective dispatch in `../reports/`.

**2026-10-31T18:31:00Z - @unknown**
Execution set to `in-code-review` at the round 3 corrected worktree based on `d63e527fc49538f7d7586e7bada8ecf871a0680f`; controller formatting, lint, types, all 69 tests, package build, and built-CLI Blueprint installation smoke check passed. Repository-wide formatting still reports unrelated files outside this ticket. Round 3 implementation evidence remains in `../reports/01-implementation.md`.

**2026-10-31T18:36:00Z - @unknown**
Execution set to `in-review` at the round 3 snapshot based on `d63e527fc49538f7d7586e7bada8ecf871a0680f`; scoped re-review of T01-R3, T01-S1, and T01-S2 is in progress. Fresh controller checks: 69/69 tests, types, lint, changed-file formatting, package build, and built-CLI Blueprint install smoke passed; full-repository formatting remains failing on unrelated files outside the ticket. Implementation report records corrective RED/GREEN evidence.

**2026-10-31T18:42:00Z - @unknown**
Ticket 01 accepted at the round 3 uncommitted worktree based on `d63e527fc49538f7d7586e7bada8ecf871a0680f`. The code review found no implementation defects; task Spec/Quality and scoped re-review pass; code-slop findings T01-S1/T01-S2 and task finding T01-R3 are addressed. Verification on this snapshot: 69/69 tests, type check, lint, changed-file formatting, package build and built-CLI install smoke pass; full-repository format check still reports 45 unrelated files. Fresh integration verification will follow. Reports: `../reports/01-code-review-complete-snapshot.md`, `../reports/01-code-slop-review-complete-snapshot.md`, `../reports/01-task-review-complete-snapshot.md`, `../reports/01-round-3-review.md`, and `../reports/01-implementation.md`.

**2026-10-31T18:48:00Z - @unknown**
Ticket 01 set to `integrated` after fresh verification of the same round 3 implementation snapshot: `just test::test` passed 69/69; `just test::types`, `just lint::check`, changed-file `just format::check`, the root package build, built-CLI installation smoke test, and `just tool::git diff --check` all exited 0. Repository-wide formatting remains failing on 45 unrelated files. Ticket changes and reports will be committed by the controller before ticket 02 starts.
