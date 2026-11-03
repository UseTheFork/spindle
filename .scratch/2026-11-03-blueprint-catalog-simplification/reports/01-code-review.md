# Code review — ticket 01

## Strengths

- The new `catalog.yaml` declares all four kinds, and `catalog.ts` validates
  required sections/fields, statuses, Stack names, safe paths, and overlapping
  ownership before reconciliation. Active sources are checked even when their
  Stack filters do not match.
- Catalog expansion preserves filenames and nested structure, treats nested
  `stacks/` as ordinary content, ignores unlisted sources, and rejects source
  symlinks. `lifecycle.ts` retains per-file Agent/Instruction version decisions
  and whole-Skill versioning; `install.ts` retains rendering and binary-byte
  copying.
- Shipped Agent and Just sources are migrated to final named files. The Just
  handler renders standalone modules, derives managed imports from filename
  stems, and preserves unrelated root configuration and unlisted modules.
- `tests/catalog.test.ts` exercises real CLI behavior across kinds, including
  multistack selection, nested/binary content, rendering, independent
  Agent/Instruction updates, Skill version bumps, validation failures, and
  symlink protection. The scoped authoring guidance matches the new model.

## Issues

### Critical

None.

### Important

None.

### Minor

- `src/blueprints/catalog.ts:126` and `:236` — Just Module filename/identifier
  validation is performed during expansion only after the `active`-status
  filter, while catalog parsing checks only that a Just path is a non-directory
  ending in `.just`. Therefore a `removed` Just record such as
  `subdir/not a module.just` is accepted despite the catalog contract requiring
  root-level named modules with valid identifiers. Validate the root-level
  filename and identifier in `parseBlueprintCatalog` for both statuses; keep
  source-existence checks active-only.

## Recommendations

- Add a parser regression case for a malformed source-less `removed` Just path,
  alongside the existing active-path and catalog validation cases.
- Keep removal reconciliation, selected-directory membership cleanup, and
  cross-kind atomic preparation in their assigned later tickets; this review
  does not assess or imply implementation of those behaviors.

## Checks

- Reviewed snapshot: base `33a7515fabbd13aaa46710ae3a2acd1e00eba622`, head
  `33a7515fabbd13aaa46710ae3a2acd1e00eba622`, plus the assigned frozen
  uncommitted/untracked ticket 01 worktree. `git status --short` and
  `git rev-parse HEAD` matched the supplied snapshot description. The report
  directory contained the implementer report before this review report was
  written.
- Coverage included the requirements spec, ticket 01 and its comments,
  confirmed design context, implementer hand-back, catalog parser and shipped
  catalog, lifecycle and kind handlers, Just integration, rendering/version
  helpers, packaging configuration, authoring docs, catalog CLI tests, and
  relevant fixture migrations. The design approval state was not changed.
- Controller-reported checks on the frozen snapshot: `just test::test` passed
  174/174; `just test::types` passed; changed-file `just format::check` and
  `just lint::check` passed. The implementer report independently records the
  same final results and states that packaged CLI coverage ran in the full
  suite. These checks were inspected, not rerun by this reviewer.
- No reviewer-run checks. Full-repository formatting was not run because
  unrelated baseline files are reported unformatted. Assessment is limited to
  the inspected snapshot and cited evidence.

## Declined to judge

- Ticket 02 explicit removal behavior and removal reporting: deliberately
  assigned later; no ticket 01 acceptance is conditioned on its implementation.
- Ticket 03 destination-only cleanup and authoritative selected-directory
  membership: deliberately assigned later.
- Ticket 04 cross-kind atomic preparation/application: deliberately assigned
  later.
- No other behavior was set aside as outside ticket 01 scope.

## Assessment

**Ready to merge? Yes**, with the noted Minor validation gap for controller
consideration. No Critical or Important findings were identified; later-ticket
behaviors are explicitly deferred rather than unresolved ticket 01 decisions.
This is a reviewer recommendation, not a controller acceptance decision.
