# Ticket 03 code review

## Strengths

- The ten new Agent Blueprints preserve their local counterparts byte-for-byte. The tracked diff limits changes to `version: 1.0.0`, installed Skill paths, and equivalent YAML quoting/formatting for shared-explore. No CLI implementation changes are included.
- Installed references no longer depend on Spindle's source tree: for example, `src/blueprints/agents/sdd-task-reviewer/AGENT.md:38-43` references installed Skills and their supporting TDD evidence document. A reviewer-run read-only audit verified all eleven relative links resolve.
- `tests/stubs.test.ts:14-26,128-180` extends the existing production CLI coverage rather than adding duplicate executions: exact eleven-Agent inventory, versions, local-copy equality, relative-link targets, and absence of shipped Instructions are checked across the existing seven Stack selections.

## Issues

### Critical

None.

### Important

**03-CR-01 — Required editor-loading evidence remains missing (acceptance gap, not an observed loading defect).**

- **Location:** `.scratch/2026-11-01-agent-instruction-blueprints/issues/03-migrate-shipped-agents.md:19`; introduced metadata example: `src/blueprints/agents/shared-explore/AGENT.md:4` and matching `.github/agents/shared-explore.agent.md:4`.
- **Evidence:** The ticket expressly requires VS Code loading verification. The implementation report and controller dispatch both disclose that it has not been performed. CLI YAML parsing and successful installation do not exercise VS Code discovery or its treatment of the added `version` attribute.
- **Impact:** A required compatibility condition for the shipped Agent files is unverified; merge readiness cannot be established.
- **Required action:** Controller must verify discovery/loading of the migrated Agents in VS Code, including non-user-invocable subagents, and record the result for this snapshot. If version metadata prevents loading, revisit the versioning decision as required by the spec. No additional CLI test matrix is requested.

### Minor

None.

## Recommendations

- Blocking: close 03-CR-01 with editor-loading evidence or obtain an explicit controller/maintainer ruling changing the acceptance requirement.
- Optional: none. No implementation corrections are supported by this bounded review.

## Checks

### Snapshot and coverage

- Phase: INITIAL_TASK, ticket 03.
- Workspace: `/home/sincore/source/spindle`.
- Base and committed HEAD: `559c0b4a63a16bfec2ac03d27777ebea5857c85e`.
- Reviewed overlay: ten modified `.github/agents/<name>.agent.md` files, their ten new `src/blueprints/agents/<name>/AGENT.md` sources, and `tests/stubs.test.ts`.
- Reviewer recomputed the SHA-256 of standard per-file SHA-256 lines over the sorted 21 assigned paths: `721690c5e5aa5b3b71dedc1a98006ae85ea6fff7286657371d406e2a8feb0051`, matching the controller's frozen snapshot. Controller ticket/report changes are excluded as assigned.
- Read the full tracked diff, all ten new Agent sources, production tests and fixture helper, renderer, applicable repository/tooling instructions, spec, design, ticket comments, and implementation report including controller verification. Existing shared-r was included in the equality/link audit, not re-reviewed as a new implementation.
- No subagents, implementation edits, index changes, commits, or tracker transitions. Only this assigned report was written.

### Reviewer-run checks

- Revision/status inspection and 21-path fingerprint verification: matched the assignment; index diff was empty.
- Read-only file audit: all eleven production source/local pairs identical; all carry `version: 1.0.0`; eleven relative links resolve; no Nunjucks opening tokens; ask excluded from shipped inventory; no Instruction entry files.
- `just test::types`: exit 0.
- `just tool::git diff --check`: exit 0.

### Evidence inspected, not independently rerun

- `reports/03-implementation.md`, controller verification: full regression 246/246 using `just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/*.test.ts`; types, lint, and whitespace passed.
- Controller records shared-explore formatting correction, subsequent changed-file formatting success, and final focused production rerun 8/8 using `just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/stubs.test.ts`, tied to the matching final fingerprint.
- The implementer's earlier fingerprint is explicitly superseded by the controller's final fingerprint; it is not treated as final-snapshot evidence.
- Integration tests were not rerun by this reviewer: `tests/helpers.ts:9-12` creates fixtures inside checkout `.scratch`, contrary to this review's read-only constraint. Reported regression/format/lint results remain attributed to the controller, not reviewer-run results.
- VS Code loading was not exercised; this is 03-CR-01. No claim is made that YAML validation proves editor compatibility.

## Declined to judge

- Automatic installation/tracking of referenced Skills: explicitly outside the spec; the review checks installed relative references instead. No new controller scope ruling is needed.
- The pre-existing local-Skill inventory assertion excluded by the controller: outside ticket 03's Agent migration and disclosed in its verification command. This review does not certify that excluded assertion or require unrelated inventory changes.
- Tickets 01/02 lifecycle implementation and broader pre-existing Agent behavior: integrated dependencies at the assigned base, not changes assigned to this review. Their interaction is covered here only through the production integration test inspection and supplied results.

No unresolved declined-behavior decisions were introduced. Editor loading is an in-scope gap, not a declined behavior.

## Assessment

**Ready to merge? No.**

The migration and bounded integration-test changes have no observed actionable code defects. Required VS Code discovery/loading evidence remains missing (03-CR-01); provide that evidence or a requirements ruling before reassessing readiness. This is a review recommendation, not controller acceptance.
