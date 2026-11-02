# Ticket 03 code review

## Strengths

- `src/version.ts` and `src/blueprints/versioned.ts` now read and validate only
  `meta.spindle.version`. The Skill CLI tests cover a Nunjucks-rendered nested
  value, a separate `meta.vendor.version`, and no fallback for top-level
  `version`.
- Version planning resolves project context and renders the whole shipped
  entry before Gray-matter parses its metadata. The update tests cover
  rendering an up-to-date entry body and failing on an undefined variable.
- The raw-source comparison in `src/blueprints/lifecycle.ts` remains in place
  when preparing an update. A CLI regression mutates the source after planning
  and verifies that the installed file is preserved.
- Nested metadata is used by Skill, Agent, and Instruction lifecycle fixtures,
  with installed missing/invalid-version behavior covered. Shipped metadata
  and this repository's installed copies were migrated; authoring guidance
  also documents the new location. ADR 0001 already records the convention.

## Issues

### Critical

None.

### Important

None.

### Minor

- `src/blueprints/skills/int-codebase-design/SKILL.md:77-89` (also reflected
  in `.github/skills/int-codebase-design/SKILL.md`): the formatting change
  removed the three-space continuation indentation from conditional code
  fences under numbered list items. On rendering, those fences are at the
  document margin, so the examples are detached from their list items and
  disrupt the section's Markdown structure. Preserve the list indentation for
  these fences and their contents in both the shipped source and installed
  copy (or prevent the formatter from stripping it).

## Recommendations

None beyond the non-blocking correction noted under Minor.

## Checks

- **Snapshot reviewed:** base and HEAD both
  `f5a7619c049f2372e1a4e14a9daaebbf2cbe5e85`, plus the supplied uncommitted
  diff and untracked implementation report. The initial status matched the
  dispatch. During review, two additional untracked files appeared:
  `.scratch/2026-11-01-blueprint-version-metadata/reports/03-code-slop-review.md`
  and `03-task-review.md`. They are review reports, not source files, but were
  not included in the supplied snapshot. HEAD remained unchanged. Approval is
  withheld until the controller rules whether these files are outside the
  implementation snapshot or provides a refreshed snapshot.
- **Coverage:** inspected the version reader/validator, lifecycle planning and
  installation guard, changed lifecycle tests, shipped and installed
  metadata/guidance, ticket and design, implementation report, and ADR 0001.
  No `AGENTS.md` was present within the workspace.
- **Reviewer-run:** `git diff --check HEAD` passed. `just test::test
  tests/rendering.test.ts` passed: 12 tests, 0 failures.
- **Controller-reported for this snapshot:** changed-file format check passed
  for 95 modified tracked paths; the specified TypeScript lint and type checks
  passed; the broad CLI test command passed 136 tests with 0 failures after
  excluding `only author-blueprint remains a local skill`; focused lifecycle,
  shipped-metadata, source-guard, and template tests also passed as recorded
  in the dispatch and implementation report. These checks were inspected but
  not rerun by this reviewer.
- **Known limitation:** the full unfiltered suite is reported to fail only on
  the baseline local-content inventory test
  `tests/stubs.test.ts: only author-blueprint remains a local skill`; the
  controller excluded that exact test. A build and the unfiltered suite were
  not run by this reviewer.

## Declined to judge

None. No considered behavior was set aside as outside the specification.

## Assessment

**Ready to merge? No, pending snapshot resolution.** The two additional
untracked review reports must be ruled outside the implementation snapshot or
the controller must provide a refreshed assignment/snapshot. Apart from this
snapshot discrepancy, the review found no Critical or Important code issues;
the Minor Markdown-layout issue should be corrected when convenient. Findings
and recommendations are not controller acceptance decisions.
