# Final aggregate review — Blueprint Catalog simplification

## Strengths

- The catalog makes selection, lifecycle status, and Stack applicability explicit
  for all four kinds. `src/blueprints/catalog.ts` validates required sections,
  entry fields, supported Stacks, source types, unsafe paths, symlinks, and
  overlapping ownership before reconciliation.
- The lifecycle keeps explicit target removal and authoritative directory
  membership cleanup separate from surviving-file version decisions.
  `tests/removals.test.ts` and `tests/directory-membership.test.ts` exercise
  real CLI behavior, including edited targets, nested additions, Stack
  transitions, absent/repeated removals, and Skill replacement reporting.
- Coordinated preparation stages selected output before mutation, and application
  failures stop with completed-operation diagnostics rather than claiming
  rollback. `tests/coordinated-preparation.test.ts` includes cross-kind
  preparation failures and partial Skill-file application failure.
- Just Module imports are reconciled by managed target paths for removal,
  including aliased imports; the CLI coverage also checks unrelated root
  configuration and unlisted modules.
- The packaged smoke test runs outside the checkout against bundled catalog and
  Blueprint assets. Authoring documentation, glossary, and proposed ADR-0003
  match the implementation; the ADR's historical `proposed` status is
  preserved.

## Issues

### Critical

None.

### Important

None.

### Minor

- **FINAL-01 — Staged Just files can leak on an earlier application failure.**
  `src/blueprints/just.ts:188-213,274-275` creates the staging directory during
  preparation, but its cleanup is only in the returned apply callback's
  `finally`. `src/blueprints/lifecycle.ts:806-818` applies ordinary handlers
  before invoking prepared initializers. If an earlier Agent, Instruction, or
  Skill application fails, the Just callback is never invoked and the
  `.spindle-just-modules-*` directory remains in the project root, containing
  staged files. This leaves an unintended project artifact after an
  unsuccessful command. Arrange for every prepared initializer's disposable
  resources to be cleaned when application aborts before invoking it; add a
  real-CLI test with a selected Just Module and injected earlier-kind failure
  that asserts the staging directory is removed.

- **FINAL-02 — An active managed Just Module can retain a noncanonical alias.**
  `src/blueprints/just.ts:79-102` looks up expected imports by the parsed alias.
  For an existing line such as
  `mod tools '.github/scripts/just-modules/format.just'`,
  `expected.get("tools")` is
  undefined, so the managed-path import is retained; the canonical
  `mod format ...` line is then appended at `:105-115`. The root justfile ends
  up importing the same managed module under both names, contrary to the
  filename-stem import contract and potentially exposing duplicate recipe
  namespaces. Reconcile selected managed imports by resolved module target
  regardless of alias, normalizing to the filename stem or failing with an
  actionable conflict; cover this case in a CLI test.

## Recommendations

- The two Minor findings do not block readiness, but addressing them would keep
  failed runs free of staging artifacts and make active managed imports
  canonical and unambiguous.
- Keep the successful preparation-failure, application partial-progress, and
  packaged CLI tests in the regression gate; they cover critical lifecycle
  contracts introduced by this delivery.

## Checks

- **Reviewed snapshot:** base
  `33a7515fabbd13aaa46710ae3a2acd1e00eba622`; HEAD
  `4f8608253ba8c1701794214ae5d9e02f8e6eb0db`; assigned uncommitted/untracked
  changes `NONE`. The worktree was clean at initial verification. The supplied
  aggregate patch's SHA-256 matched the generated base-to-HEAD diff:
  `be729f793b58abcb8bde7085d39b11b11d06c308b04076dcae6fec60496585c1`.
  After report creation, status showed this assigned report and a separate
  untracked `final-code-slop-review.md`; HEAD remained unchanged and neither
  report is part of the reviewed source diff.
- **Coverage:** reviewed the canonical spec and design, all four tickets,
  glossary and ADR; inspected catalog parsing/expansion, lifecycle planning,
  removal and membership application, Just preparation/import reconciliation,
  install/update handling, handlers, package configuration, relevant CLI
  tests, migrated catalog/source layout, authoring documentation, and prior
  ticket findings and controller rulings. The full diff package and changed
  path inventory were checked; review focused on behavior and integration
  risks rather than re-reading every unchanged Blueprint asset.
- **Evidence inspected:** final ticket 04 implementation/addendum and task-review
  reports resolve the earlier package-omission finding. The final controller
  evidence reports `just test::test` 196/196; focused coordinated,
  membership, and agent tests 50/50; `just test::types`; scoped format and
  lint; `just tool::git diff --check HEAD`; and fresh packaging build plus
  packaged CLI tests 4/4. Earlier integrated ticket gates and scoped reviews
  are documented in the corresponding reports.
- **Reviewer-run checks:** checkout revision/cleanliness and aggregate diff
  statistics; `git diff --check` from assigned base to HEAD; aggregate patch
  SHA-256 comparison. These passed. Project tests, type checking, formatter,
  linter, and build were not rerun by this reviewer; their results above are
  controller-reported evidence.
- **Limitations:** no dynamic reproduction of the two new Minor findings was
  run. Findings are based on the control flow and conditions inspected.
  Review recommendations are not controller acceptance decisions.

## Declined to judge

- **Full rollback after application begins:** explicitly outside the spec; the
  required behavior is to stop, report completed changes, and avoid claiming
  rollback. This review assessed those requirements.
- **Backward compatibility with legacy layouts, implicit discovery,
  overlays/composition, or migration of historical installations:** explicitly
  out of scope; the delivery removes those mechanisms rather than preserving
  compatibility.
- **Cleanup inferred from catalog-entry disappearance or a changed historical
  path:** explicitly out of scope; deletion requires an explicit removal record.
- **Preserving local additions inside selected directories:** not a declined
  requirement; the spec explicitly makes selected directory membership
  authoritative and permits those additions to be removed.
- No unresolved in-spec behavior was declined.

## Assessment

**Ready to merge? Yes.** No Critical or Important findings remain, and there are
no unresolved declined-behavior decisions. The two Minor findings above are
nonblocking recommendations. Current snapshot evidence is sufficient, subject
to the stated limitation that project checks were inspected as reported rather
than rerun independently.
