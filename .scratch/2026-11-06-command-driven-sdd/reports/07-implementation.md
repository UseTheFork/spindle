# Issue 07 implementation report

Status: DONE

## Snapshot and checkout

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `624c7744feb0f022b7983907feda41e4fe0d0a65`
- Final revision: `624c7744feb0f022b7983907feda41e4fe0d0a65` (no commit authorized or created)
- The only pre-existing dirty path was the controller-owned issue file
  `.scratch/2026-11-06-command-driven-sdd/issues/07-require-eligible-specialist-reviews.md`.
  It was not edited and is excluded from implementation identity.
- No pre-existing untracked files were reported. The report is written after
  tests and is not part of the tested implementation diff.
- Tested implementation snapshot: the starting HEAD plus the assigned source,
  test, catalog, and guidance diff with SHA-256
  `2fb08471ceb13be047b97d70e92f7a00e39152faa9932c85dc178fc0081d8716`.
  The controller-owned issue update was present in the checkout but excluded
  from this diff hash.

## Criteria, changes, and tests

- `review require` accepts explicit spec, issue, agent, objective, and author;
  it only records known agents with explicit `canReview: true`. Unknown and
  ineligible agents leave the issue and ledger unchanged. The requirement is
  attributed in the ledger and issue comments, repeated identical registration
  is idempotent, conflicting replacement is rejected, and new requirements
  cannot be added once review assignments are frozen.
- Specialist requirements combine with the stored default policy when review
  assignments are created. Each assignment retains role `review`, a unique
  ID and report destination, snapshot/inventory provenance, and a separate
  `objective`. Submission failure details do not overwrite that objective.
  Acceptance checks all pinned reviewers, validates objective and report
  provenance, rejects duplicate IDs/destinations and incomplete or
  non-passing/stale evidence, and reports the full batch on acceptance.
- The eligibility field was already supported by the catalog schema and
  normalizer at the starting revision. Catalog coverage now verifies
  explicit false normalization, the eligible comprehensive and specialist
  entries, and shipped Blueprint guidance/lifecycle output.
- Updated the specialist Agent Blueprint, orchestrator access/guidance,
  SDD controller skill, issue-tracker guidance, and Just tooling docs. Guidance
  distinguishes catalog eligibility from controller-confirmed harness
  callability. No CLI harness-availability check, generic capability,
  lifecycle/Stack/installation eligibility check, removal command, profile,
  or automatic specialist batch was added.
- Behavior changes followed RED → GREEN. First RED:
  `just test::test tests/sdd-workflow.test.ts` reported 51 passing tests and
  the new specialist test failed because `review require` was not supported
  (the CLI demanded `--inventory`). A second focused RED,
  `just test::test --test-name-pattern='unavailable specialist submissions preserve' tests/sdd-workflow.test.ts`,
  failed because the specialist objective was absent after submission.
  After implementation, focused specialist workflow tests passed 2/2.
- Final relevant GREEN:
  `just test::test tests/sdd-workflow.test.ts tests/catalog.test.ts` — exit 0,
  66 passed, 0 failed.

## Changed files

- `src/commands/sdd/sdd-command.ts`
- `src/blueprints/catalog.ts`
- `src/blueprints/agents/sdd-code-reviewer.agent.md`
- `src/blueprints/agents/sdd-orchestrator.agent.md`
- `src/blueprints/skills/int-subagent-driven-dev/SKILL.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/tooling.md`
- `tests/sdd-workflow.test.ts`
- `tests/catalog.test.ts`
- `.scratch/2026-11-06-command-driven-sdd/reports/07-implementation.md` (this report)

## Checks run

- `just format::format src/commands/sdd/sdd-command.ts src/blueprints/catalog.ts tests/sdd-workflow.test.ts tests/catalog.test.ts src/blueprints/agents/sdd-code-reviewer.agent.md src/blueprints/agents/sdd-orchestrator.agent.md src/blueprints/skills/int-subagent-driven-dev/SKILL.md docs/agents/issue-tracker.md docs/agents/tooling.md` — exit 0; formatted 9 files.
- `just format::check src/commands/sdd/sdd-command.ts src/blueprints/catalog.ts tests/sdd-workflow.test.ts tests/catalog.test.ts src/blueprints/agents/sdd-code-reviewer.agent.md src/blueprints/agents/sdd-orchestrator.agent.md src/blueprints/skills/int-subagent-driven-dev/SKILL.md docs/agents/issue-tracker.md docs/agents/tooling.md` — exit 0; all files formatted.
- `just lint::check src/commands/sdd/sdd-command.ts src/blueprints/catalog.ts tests/sdd-workflow.test.ts tests/catalog.test.ts` — exit 0.
- `just test::types` — exit 0 on the final source.
- `just build` — exit 0.
- `just tool::git diff --check` — exit 0.

## Self-review and remaining checks

- During implementation, a Commander option-routing issue, a shared objective /
  result-details field, a catalog test wording mismatch, and a duplicate
  interface declaration were found and corrected. The focused and final
  suites, type-check, and lint pass after those fixes.
- No unresolved implementer concerns.
- Full repository test suite and coverage were not run; ticket-wide regression
  checks remain with the controller. Controller review, acceptance, and
  integration are also pending. These pending controller checks are not
  implementer failures or evidence of acceptance.
- No files were staged or committed.

## Hand-back

Issue 07 implementation is complete on the reported uncommitted snapshot.
`review require` now records pinned, justified specialist intent; dispatch
creates distinct objective-bound review assignments; acceptance waits for the
complete passing batch. The controller must still review, accept, and integrate
the changes and separately verify specialist callability before dispatch.
