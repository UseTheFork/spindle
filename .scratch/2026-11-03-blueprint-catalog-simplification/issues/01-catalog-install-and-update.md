# 01: Install and update through the Blueprint Catalog

Reporter: unknown
Category: enhancement
Status: ready-for-agent

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
