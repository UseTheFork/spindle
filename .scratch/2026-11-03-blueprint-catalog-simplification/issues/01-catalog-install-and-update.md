# 01: Install and update through the Blueprint Catalog

Reporter: unknown
Category: enhancement
Status: ready-for-agent
Execution: integrated

Source: [Feature specification](../spec.md)

**What to build:** Project maintainers initialize and update all four Blueprint
kinds through an explicit catalog, with predictable Stack selection, preserved
names and recursive structure, existing rendering/version behavior, and
standalone Just Modules instead of legacy layouts or composition.

**Blocked by:** None (can start immediately).

- [ ] Require a YAML Blueprint Catalog with exactly the four kind sections.
      Empty mappings are valid; each logical entry requires a relative path,
      lifecycle status, and Stack list. Logical keys do not rename output.
- [ ] Support only active and removed statuses. Empty Stack lists mean all
      supported Stacks; nonempty lists use any-match semantics. Only matching
      active entries install or update; unlisted source content is ignored.
      Deletion behavior is delivered by ticket 02.
- [ ] Validate the complete catalog before changes: reject malformed YAML,
      unknown fields, invalid entry shapes/statuses/Stacks, missing active
      sources even for nonmatching entries, incompatible types, unsafe paths,
      glob syntax, symbolic-link traversal, and overlapping target ownership.
      Removed entries may have no source.
- [ ] A file selection copies one file; a directory selection recursively
      includes all files and preserves relative structure. A trailing slash
      denotes a directory, including for source-less removal records.
      Internally named Stack directories have no special treatment.
- [ ] Agents and Instructions use their final named source files, including
      nested grouping directories, and update independently per file without
      group versions. Skills retain whole-directory updates and their ordinary
      versioned entry.
- [ ] Preserve Variable/template rendering, binary bytes, metadata validation,
      version comparisons, malformed-installed-version handling, conflict
      choices, and new-content selection for applicable content.
- [ ] Adding or changing Skill content requires a version bump; a current Skill
      does not receive a new supporting file without one. New Agent and
      Instruction files remain independently eligible.
- [ ] Just Modules are standalone root-level named module files with existing
      identifier requirements. Separate Stack-specific files replace composed
      contributions; matching modules regenerate without version/conflict
      prompts. Managed import names derive from filename stems, not catalog keys.
- [ ] Preserve unrelated root Just configuration and unlisted installed modules
      and imports. Do not retain legacy inferred-obsolete-module deletion.
- [ ] Migrate shipped sources and applicable fixtures to the catalog model,
      preserving relevant guidance and recipes. Remove legacy implicit
      discovery, Agent/Instruction wrappers, overlay handling, Just composition,
      and obsolete tests rather than providing compatibility loaders.
- [ ] Load the catalog through the resolved collection root, including the
      existing external-root mechanism and packaged assets. Keep packaging
      inputs consistent with the new source layout.
- [ ] Real CLI tests verify initialization/update across all kinds, differing
      logical keys and filenames, same-named entries in different kinds, nested
      content, binary assets, rendering, all supported Stacks, multi-Stack
      matching, unlisted exclusion, independent file outcomes, and Skill
      version-bump rules. Invalid catalogs fail with actionable diagnostics and
      no installation changes.
- [ ] Update directly related authoring guidance and retained regression tests.
      Reuse the existing Node test and CLI harnesses; run focused validation and
      type checking through project Just recipes.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
**2026-11-03T16:06:40Z - @unknown**
Execution set to `claimed` at base `33a7515fabbd13aaa46710ae3a2acd1e00eba622` in `/home/sincore/source/spindle` to start the authorized delivery.
**2026-11-03T16:07:00Z - @unknown**
Execution set to `implementing` at base `33a7515fabbd13aaa46710ae3a2acd1e00eba622`; the SDD implementer is assigned ticket 01.
**2026-11-03T16:31:00Z - @unknown**
Execution set to `changes-requested` on the uncommitted ticket 01 diff after controller checks. Round 1 findings: `T01-01` migrate applicable legacy fixture/regression coverage to catalog-selected layouts and replace/remove obsolete wrapper, overlay, and Just-composition assertions; full suite reported 113 failures out of 185, with 72 passing. `T01-02` resolve changed-file formatter findings and `tests/install.test.ts:40` lint finding. No behavior changes for tickets 02/03 are authorized by this corrective dispatch. Checks: full tests failed; changed-file formatting failed; lint failed; type check passed.
**2026-11-03T16:47:00Z - @unknown**
Execution set to `in-code-review` on the uncommitted ticket 01 snapshot based at `33a7515fabbd13aaa46710ae3a2acd1e00eba622`; round 1 reports the legacy fixture migration and formatting/lint fixes. Controller reran full tests (174/174), type check, changed-file format check, and changed-file lint successfully; initial review is underway.
**2026-11-03T16:48:00Z - @unknown**
Execution set to `in-review` on the same frozen working-tree snapshot; code, code-slop, and task review are dispatched in parallel.
**2026-11-03T17:03:00Z - @unknown**
Execution set to `changes-requested` after round-1 reviews of the uncommitted ticket 01 snapshot. Blocking findings: `T01-R2-01` validate Just Module root-level names/identifiers in catalog parsing for both active and source-less removed entries, with a malformed removed-entry test (code review); `T01-R2-02` remove redundant Just module name validation after centralizing the rule (code-slop review); `T01-R2-03` add real-CLI `php-laravel` catalog Stack selection coverage (task review). Code reviewer found no Critical/Important issue; code-slop found no Important issue. Task Spec/Quality verdict is UNVERIFIED pending the Stack test. Reports: `../reports/01-code-review.md`, `../reports/01-code-slop-review.md`, `../reports/01-task-review.md`. One corrective dispatch has been used; round 2 of five is assigned.
**2026-11-03T17:04:00Z - @unknown**
Execution set to `implementing` for corrective round 2 at the same uncommitted ticket 01 base; findings T01-R2-01 through T01-R2-03 are assigned to the implementer.
**2026-11-03T17:21:11Z - @unknown**
Execution set to `in-review` after round-2 correction. A controller-only update aligned the legacy error-message assertion in `tests/init.test.ts` with the centralized catalog diagnostic; final fresh checks passed (full suite 175/175, types, scoped format, scoped lint). Scoped re-review of T01-R2-01, T01-R2-02, and T01-R2-03 is now in progress. Snapshot remains uncommitted at base `33a7515fabbd13aaa46710ae3a2acd1e00eba622`.
**2026-11-03T17:21:11Z - @unknown**
Execution set to `accepted` on the uncommitted ticket 01 snapshot after initial code, code-slop, and Spec/Quality reviews and scoped round-2 re-review. Findings `T01-R2-01`, `T01-R2-02`, and `T01-R2-03` are addressed; reports are `../reports/01-code-review.md`, `../reports/01-code-slop-review.md`, `../reports/01-task-review.md`, and `../reports/01-round-2-review.md`. Controller verification on the current code passed full tests (175/175), types, scoped formatting, and scoped lint. Ticket 02 deletion, ticket 03 membership cleanup, and ticket 04 coordinated preparation remain assigned to downstream tickets.
**2026-11-03T17:22:29Z - @unknown**
Execution set to `integrated` on the accepted ticket 01 diff based on `33a7515fabbd13aaa46710ae3a2acd1e00eba622`. The scoped re-review closed all three round-2 findings. Fresh controller checks on this source snapshot passed: `just test::test` 175/175; `just test::types`; scoped `just format::check`; scoped `just lint::check`; and `just tool::git diff --check HEAD`. All pending ticket 01 source, tests, docs, reports, and tracker evidence will be committed together before proceeding to dependent tickets.
