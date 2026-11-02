# Ticket 02 code review

## Strengths

- `src/blueprints/lifecycle.ts:327-330` now queues registered initializers in
  both lifecycle modes, and `:368-372` resolves the project context when an
  initializer needs it. The Just Module handler can therefore run on `update`
  without being routed through version planning or new-Blueprint prompts.
- `tests/update.test.ts:90-149` verifies that update replaces existing module
  content, automatically installs a newly shipped module, and composes only
  the selected Stack contribution.
- `tests/update.test.ts:151-220` verifies obsolete direct-module and import
  cleanup, deterministic/deduplicated managed imports, preservation of
  unrelated Justfile content and CRLF/no-final-newline style, preservation of
  nested and non-`.just` files, and idempotency.
- `tests/update.test.ts:222-255` verifies that an import-name conflict fails
  without changing existing generated modules, obsolete files, or the root
  `justfile`.
- No Critical or Important correctness defect was found in the assigned
  lifecycle delta or its integration with the existing Just Module handler.

## Issues

### Critical

None.

### Important

None.

### Minor

- `src/blueprints/lifecycle.ts:453-455` records every initializer result as
  `status: "installed"`, including modules that already existed and were
  regenerated during `update`. The CLI summary consequently reports those
  regenerated modules as “Added,” which is misleading to maintainers. Have
  initializer results carry per-module status (or otherwise distinguish
  previously installed modules from newly shipped ones), then add an assertion
  for the update summary.

## Recommendations

- Fix the Minor outcome-label issue when convenient. It does not block the
  update-time reconciliation behavior.
- Run the full suite when practical; it was not run for this snapshot, and
  prior Ticket 01 review records known baseline failures in
  `tests/stubs.test.ts`.

## Checks

- **Reviewed snapshot:** `/home/sincore/source/spindle`, `HEAD` and base
  `fb867aa49962abb341a23488b720622d2244e4b5`. The tracked dirty delta is
  `src/blueprints/lifecycle.ts` and `tests/update.test.ts`; the only other
  worktree changes are the assigned controller tracker update and the
  implementation report. No untracked implementation files were present.
- **Coverage:** Ticket 02, canonical spec and design, implementation report,
  exact lifecycle/test diff, relevant lifecycle and update call paths, the
  Just Module handler, and prior Ticket 01 review reports. The handler itself
  is unchanged in this ticket; it was inspected for its interaction with the
  new update dispatch.
- **Controller checks inspected:** `just format::check
  src/blueprints/lifecycle.ts tests/update.test.ts` PASS;
  `just lint::check src/blueprints/lifecycle.ts tests/update.test.ts` PASS;
  `just test::types` PASS;
  `just test::test tests/update.test.ts tests/init.test.ts
  tests/instructions.test.ts` PASS, 59/59; and
  `just tool::git diff --check` PASS.
- **Reviewer-run:** read-only worktree/revision and diff inspection. No tests,
  formatter, lint, or type-check command was independently rerun.
- **Limitations:** the full test suite was not run. The controller-provided
  verification results were inspected, not independently reproduced.

## Declined to judge

- Just syntax validation and duplicate-recipe detection are explicitly
  outside the specification; Just itself validates syntax, and recipe-name
  collision checking is not required.
- Full rollback after an apply-stage filesystem failure is explicitly
  excluded by the design. This ticket changes lifecycle dispatch and does not
  alter the handler's apply strategy.
- The Ticket 01 handler's standalone `init` behavior was not re-reviewed as a
  separate delivery; it was previously reviewed. This review considered its
  update-time integration and the conflict-before-write behavior exercised by
  the new update test.

## Assessment

**Ready to merge? Yes**, with the noted Minor reporting issue. There are no
Critical or Important findings, the ticket's update reconciliation behaviors
are covered by current focused checks, and no unresolved declined-behavior
decision blocks this ticket review. The Minor CLI summary correction is
recommended but does not block merge. This is a review recommendation, not a
controller acceptance decision.
