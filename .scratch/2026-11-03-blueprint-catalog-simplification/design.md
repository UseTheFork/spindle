# Blueprint catalog simplification

Status: awaiting approval

## Intent and success criteria

Replace stack-dependent Blueprint file discovery with one explicit YAML catalog.
The catalog selects whole files or directories; selected directories copy
recursively without internal stack filtering or filename rewriting.

Success means:

- One catalog controls Skills, Agents, Instructions, and Just Modules.
- Files retain their names and paths relative to their kind's source directory.
- Every file within a selected directory is included, including nested files.
- A `removed` entry prevents installation and completely deletes its installed
  file or subtree, regardless of selected stacks.
- Legacy layouts, overlay composition, and their obsolete code and tests are
  removed, not supported through a compatibility layer.

## Confirmed user decisions

- Remove special treatment of `stacks/` directories inside Blueprints.
- Author Agents directly as named files such as
  `sdd-code-reviewer.agent.md`, not `<name>/AGENT.md`.
- Preserve Instruction filenames such as `testing.instructions.md` and allow
  nested directories.
- Preserve Just filenames rather than generating names from wrapper directories.
- Use logical catalog keys with an explicit `path` field.
- A directory path selects its entire subtree; glob syntax such as `/*` is not
  needed.
- Use one inactive status, `removed`, rather than separate deprecated and removed
  states. It deletes installed content, not merely suppresses future installs.
- Catalog entries select content but do not define update units. Agents and
  Instructions update independently per file; Skills update as whole directories.
- Active entries that no longer match the project's selected stacks are removed
  from the installed project, rather than retained or merely skipped.
- Preserve template rendering, Variable substitution, version metadata, and
  existing update/conflict behavior for applicable active content. "Copy" changes
  selection and layout, not template evaluation.
- Deleting an entry from the catalog does not remove its installed content.
  Retain a `removed` entry to clean up installations; no installed-content
  tracking database is introduced.
- Just Modules are standalone named `.just` files. Stack-specific recipes use
  separate files selected by the catalog, while shared modules apply to all
  stacks. Root import names come from filenames, not logical catalog keys.
- Use `catalog.yaml` with required `agents`, `just`, `instructions`, and `skills`
  sections, statuses `active` and `removed`, an empty stack list for all stacks,
  and any-match semantics for nonempty stack lists. Invalid fields, paths, and
  overlapping selections fail validation before changes are applied.
- Both `removed` status and stack mismatch unconditionally delete the full
  installed target, including local modifications and additions, without
  prompting. `--on-conflict skip` does not suppress deletion; report each removal.
- When a file disappears from an otherwise active, matching directory selection,
  remove that file from the installed directory. An explicit `removed` entry is
  not required for files removed within a selected subtree.
- Selected directories own their destination subtree. Remove every
  destination-only file, including local additions, without installed-content
  tracking. Surviving Agents and Instructions still update independently by
  version.
- Directory-membership cleanup runs even when a Skill is already current or its
  update is skipped. Version and conflict decisions control replacement of
  surviving files, not removal of destination-only files.
- Validate the catalog and prepare all selected writes before any deletion or
  other installation changes. Preparation failures leave the installation
  unchanged. Application-time filesystem failures stop the command and explicitly
  report changes already applied; full rollback is out of scope.
- Adding or changing Skill content requires a version bump. New supporting files
  are not installed into an already-current Skill without one. Only
  destination-only cleanup bypasses version checks. New Agent and Instruction
  files remain independently eligible under existing new-content selection.

## Catalog and selection

Filename: `src/blueprints/catalog.yaml`, packaged with the Blueprint
sources and loaded from the resolved Blueprint root.

```yaml
agents:
  code-reviewer:
    path: sdd-code-reviewer.agent.md
    status: active
    stacks: [typescript, python]

just:
  lint:
    path: lint.just
    status: active
    stacks: []

instructions:
  testing:
    path: testing/
    status: active
    stacks: []

skills:
  author-design:
    path: author-design/
    status: active
    stacks: []
  retired-skill:
    path: retired-skill/
    status: removed
    stacks: []
```

Each top-level key is required and may contain an empty mapping. Each logical key
identifies an entry within that kind. Each entry requires `path`, `status`, and
`stacks`.

- `path` is relative to that kind's source directory, without a leading `/`.
  A trailing `/` explicitly identifies a directory, including when a removed
  entry no longer has a source on disk.
- `status` is `active` or `removed`.
- `stacks: []` means all stacks. Otherwise, an active entry qualifies when any
  listed stack matches a project's selected stacks. A nonmatching active entry
  is excluded from installation and its installed target is removed.
- Unlisted source files are not implicitly discovered or installed.
- A removed entry remains in the catalog as a deletion record; its source may
  be absent.
- Stack selection applies only to entire active catalog entries. A literal
  `stacks/` directory within a selected subtree has no special behavior.

These catalog rules and stack-mismatch removal are confirmed user decisions.

## Source and destination mapping

| Kind | Source root | Destination root |
| --- | --- | --- |
| Agents | `src/blueprints/agents/` | `.github/agents/` |
| Just | `src/blueprints/just/` | `.github/scripts/just-modules/` |
| Instructions | `src/blueprints/instructions/` | `.github/instructions/` |
| Skills | `src/blueprints/skills/` | `.github/skills/` |

Append the catalog path unchanged to both roots. Logical keys do not rename
output. For example, `instructions.testing.path: testing/` copies its full tree
to `.github/instructions/testing/`.

Skills retain their ordinary `<skill>/SKILL.md` content structure. Agents and
Instructions no longer use synthetic `AGENT.md` or `INSTRUCTION.md` entry files.
Just Modules become ordinary named `.just` source files instead of
`<module>/JUSTMODULE.just` plus stack contributions.

For example, `test-typescript.just` and `test-python.just` can carry independent
stack filters; shared modules use the all-stacks convention. Selecting multiple
stacks installs each matching module without concatenating their recipes.
Root imports use the filename stem, such as `test-typescript`, independently of
the catalog's logical key. Just Modules remain individual root-level `.just`
files with the existing module-name requirements; nested Just module/import
semantics are not introduced.

Directory entries may group multiple Instructions or Agents. Their files keep
their own metadata and version handling; a grouping directory does not introduce
a new group version. An outdated file can be updated while a current file stays
unchanged and another file is skipped under the existing conflict/version rules.
Skills remain whole-directory update units, versioned by their `SKILL.md`.
Explicit removal still deletes the catalog entry's entire selected file or
subtree, not just independently versioned files.

Directory reconciliation also removes installed files that disappeared from the
selected source subtree. This is separate from deciding which surviving Agents
or Instructions need version updates. Every destination-only file is stale,
including local additions; selected directories are authoritative for membership.
No prior-install inventory is needed to distinguish shipped files from local
additions. Cleanup runs when the owning Skill is current or its update is
skipped. Version comparisons and conflict decisions do not suppress
directory-membership cleanup.

Adding or changing Skill content still requires a Skill version bump. A new
supporting file is not installed into an already-current Skill without one;
directory authority controls deletion, not unconditional replacement or addition.
New Agent and Instruction files are independently eligible through the existing
new-content selection behavior.

## Reconciliation behavior

Both `init` and `update` read and validate the catalog before applying changes.

1. Resolve removed entries into destination deletions independently of stacks.
2. Select matching active entries for installation/update and resolve nonmatching
   active entries into destination deletions.
3. Expand selected directories recursively, preserving relative paths.
4. Plan cleanup of installed files that disappeared from matching source
   directories.
5. Validate the complete catalog, planned copies, deletions, metadata, and
   destination safety; prepare all selected writes before any installation
   changes, including deletion.
6. Apply normal installation/update behavior, directory cleanup, and catalog
   removals.
7. Report removals and any failures explicitly.

Preparation failures leave the installation unchanged. Filesystem failures during
application stop the command and report which changes were already applied.
Full transactional rollback is out of scope.

Removing a directory entry deletes its entire installed subtree, including local
additions within that subtree. Removing a file entry deletes only that file.
Already-absent targets are a normal no-op. Removed entries do not depend on
`--include-new`, version comparisons, or overwrite/skip decisions: the catalog is
the explicit removal directive.

An active entry with no matching selected stack also loses its installed file or
subtree. Both removal conditions are unconditional: delete local modifications
and additions without prompting, regardless of `--on-conflict skip` or
`--include-new`. Report each removal explicitly.

Preserve existing Variable rendering, binary copying, version metadata, and
conflict behavior for active content. Preserve Just's versionless regeneration
and root `justfile` import reconciliation, but eliminate contribution
concatenation. Removed Just Modules must also lose their managed root imports.

## Constraints and validation

- Reject malformed YAML, unknown fields/statuses/stacks, missing active sources,
  and incompatible source types with actionable errors.
- Reject absolute paths, traversal, glob patterns, symbolic-link traversal, and
  destination paths outside the designated kind root.
- Reject overlapping catalog paths within a kind, including active/removed
  overlaps, so entries cannot copy and delete the same content.
- Preserve unrelated `.github` content and unrelated root `justfile` content.
  Local additions inside a catalog-selected directory are not unrelated content:
  they are removed when absent from the source subtree.
- Do not infer removals from missing catalog entries. Stack mismatch is an
  explicit removal condition for entries present in the catalog.
- Missing files within a matching selected directory are removed from its
  installed subtree; this differs from an entire catalog entry disappearing.

## Considered approaches

1. **Relative-path keys:** fewer fields, but couples identity to physical layout.
   Not selected.
2. **Logical keys plus explicit paths:** adds one field while making identity and
   source location explicit. Selected by the user.
3. **Glob paths:** expressive but adds matching rules and ambiguous recursive
   copy/deletion boundaries. The user accepted whole-directory selection instead.

## Migration and verification scope

Flatten shipped Agent and Just sources, register all shipped content in the
catalog, and replace any existing overlay-dependent sources with explicit
catalog-selected content. Preserve applicable guidance and recipes while
removing overlay mechanics. No old-layout loader or migration command is added.

Replace legacy discovery/overlay tests with coverage for catalog validation,
stack matching, recursive copying, unchanged names and paths, active update
behavior, removed files and complete directories, missing-source deletion
records, stack-independent removal, Just import cleanup, and unsafe or
overlapping paths, stack-mismatch cleanup, and files disappearing within active
directory selections, including local additions; current/skipped Skill cleanup;
and new Skill files requiring a version bump. Update directly related authoring
documentation to describe the new model.

## Architectural record and implementation details

The proposed catalog decision is recorded in
[ADR-0003](../../docs/adr/0003-catalog-selected-blueprints.md). It replaces the
overlay/composition and wrapper-directory choices in ADR-0001 and ADR-0002 upon
design approval, while preserving rendering, versioning, and per-kind behavior.

A path rename follows the confirmed no-inventory rule: no historical destination
is inferred from the logical key. Retain an explicit removed entry at the old
path when cleanup is wanted.

Implementation may choose the YAML parser and internal planning types, but must
not add compatibility paths, installation tracking, or change the confirmed
reconciliation rules.

Implementation must not begin until this document is approved.
