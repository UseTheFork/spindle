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

## Catalog and selection

Proposed filename: `src/blueprints/catalog.yaml`, packaged with the Blueprint
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
  listed stack matches a project's selected stacks.
- Unlisted source files are not implicitly discovered or installed.
- A removed entry remains in the catalog as a deletion record; its source may
  be absent.
- Stack selection applies only to entire active catalog entries. A literal
  `stacks/` directory within a selected subtree has no special behavior.

These exact field names and stack rules are recommendations carried forward
from the discussion for approval with this document.

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

Directory entries may group multiple Instructions or Agents. Their files keep
their own metadata and version handling; a grouping directory does not introduce
a new group version.

## Reconciliation behavior

Both `init` and `update` read and validate the catalog before applying changes.

1. Resolve removed entries into destination deletions independently of stacks.
2. Select active entries using catalog-level stack matching.
3. Expand selected directories recursively, preserving relative paths.
4. Validate planned copies, deletions, metadata, and destination safety before
   destructive actions.
5. Apply normal installation/update behavior and explicit catalog removals.
6. Report removals and any failures explicitly.

Removing a directory entry deletes its entire installed subtree, including local
additions within that subtree. Removing a file entry deletes only that file.
Already-absent targets are a normal no-op. Removed entries do not depend on
`--include-new`, version comparisons, or overwrite/skip decisions: the catalog is
the explicit removal directive.

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
- Do not infer removals from missing catalog entries or a stack mismatch.

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
overlapping paths. Update the glossary, lifecycle ADRs, and directly related
authoring documentation to describe the new model.

## Assumptions for approval

- Stack mismatch skips an active entry but does not delete an existing install;
  only `removed` explicitly authorizes deletion.
- Removing an entry from the YAML entirely does not delete an installed copy.
  Keep a `removed` record for reliable future cleanup.
- Existing rendering and version-aware updates remain; "copy" changes selection
  and layout, not template evaluation.
- Just Modules remain individual `.just` files with the existing module-name
  requirements; nested Just module/import semantics are not introduced.
- No cleanup of historical destinations is inferred after a path rename.
  Explicit removed entries describe any desired cleanup.

Implementation must not begin until this document is approved.
