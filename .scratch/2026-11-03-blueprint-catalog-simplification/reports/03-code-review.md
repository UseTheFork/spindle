# Ticket 03 code review

## Strengths

- The catalog expansion preserves relative source-file membership for active,
  matching directory selections (`src/blueprints/catalog.ts`), and the lifecycle
  exposes membership cleanup separately from explicit catalog deletions
  (`src/blueprints/lifecycle.ts`).
- Cleanup is scoped to selected destination subtrees. The recursive collector
  rejects symlinks and non-regular entries before reconciliation changes, and
  the cleanup validator rechecks target containment and file type
  (`src/blueprints/lifecycle.ts`).
- Existing version/conflict choices are kept separate from membership cleanup.
  CLI tests cover grouped Agent/Instruction files, current and skipped Skills,
  withheld Skill support files, accepted Skill updates, surviving bytes, and
  unrelated neighbors (`tests/directory-membership.test.ts`).
- Coverage includes init cleanup, nested local additions, ordinary nested
  `stacks/` content, selected-file boundaries, and a nested destination symlink
  failure that leaves stale and outside content intact.
- Documentation now explains directory membership ownership and the retained
  per-file Agent/Instruction and whole-Skill version policies
  (`docs/blueprints.md`).

## Issues

### Critical

None.

### Important

- **R1 — Destination-only files removed by an accepted Skill update are not
  reported.** `src/blueprints/lifecycle.ts:431-433` removes the entire Skill
  target on replacement. The planned membership-cleanup operations run later
  (`src/blueprints/lifecycle.ts:771-772`), find those files absent, and skip
  them without adding `removed` outcomes (`src/blueprints/lifecycle.ts:570`).
  Thus, for example, the accepted update in
  `tests/directory-membership.test.ts:227-242` deletes `accepted/local.txt`
  without reporting that path, despite ticket 03 requiring actual cleanup
  removals to be reported. Preserve/report the planned destination-only paths
  subsumed by whole-Skill replacement, and add an assertion that the accepted
  update reports `accepted/local.txt`.

### Minor

None.

## Recommendations

None beyond the correction requested in R1.

## Checks

- **Reviewed snapshot:** base and head
  `5be1be9e35d332c422152a3b5d09c2921a79af18`; at entry, working tree changes
  matched the declared ticket 03 edits, controller-updated existing-repo
  assertion, tracker comments/state, untracked `tests/directory-membership.test.ts`,
  and implementation report. During post-review verification, status showed
  additional untracked
  `.scratch/2026-11-03-blueprint-catalog-simplification/reports/03-code-slop-review.md`
  and `03-task-review.md`, absent from the entry snapshot. HEAD and
  implementation files remain unchanged, but these worktree deltas require
  controller reconciliation before approval. The additional reports were not
  inspected as ticket implementation.
- **Evidence inspected:** ticket 03 issue and comments, feature specification,
  design context, implementation hand-back, full tracked diff, changed
  catalog/lifecycle/docs and tests, relevant handlers/install safety helpers,
  and CLI outcome reporting.
- **Controller checks inspected** for the exact source snapshot, as recorded in
  the implementation report and tracker comment: `just test::test` (188/188),
  `just test::types`, scoped `just format::check`, scoped `just lint::check`,
  and `just tool::git diff --check HEAD` all passed.
- **Reviewer-run checks:** none. This review used read-only inspection; no test
  command was rerun.
- **Coverage limits:** ticket 03 only; tickets 01/02 were not re-reviewed.
  Full-repository formatting was not run, per the disclosed unrelated baseline
  formatting issue; scoped changed-file formatting passed.

## Declined to judge

- Ticket 04 coordinated preparation/application failure behavior is explicitly
  not part of this delivery and was not assessed.
- Full transactional rollback is outside the specification; it was not assessed
  or treated as a ticket 03 defect.
- No other considered behavior was set aside as outside the assigned scope.

## Assessment

**Ready to merge? No.** First resolve the post-review snapshot delta with the
controller; then correct R1 and cover it with a real-CLI assertion before
approval. Other reviewed ticket 03 behavior is supported by the inspected code
and test evidence. This is a reviewer recommendation, not a controller
acceptance decision.
