# Authoring Blueprints

The shipped collection is controlled by the typed `blueprintCatalog` object in
`src/blueprints/catalog.ts`. Edit this object to add or retire entries, then
rebuild Spindle. TypeScript checks entry fields, lifecycle statuses, supported
Stack names, and the trailing slash required for Skill directories. Every
catalog entry has a logical key, a source `path`, a `status` (`active` or
`removed`), and a list of supported `stacks`. Logical keys identify entries;
they do not rename installed content. An empty Stack list applies to every
Stack, and a nonempty list applies when any listed Stack is selected.

The catalog has exactly three sections: `agents`, `instructions`, and
`skills`. Empty sections are valid. Active entries must name existing sources,
including entries that do not match the current Stack selection. Removed entries
may retain a source-less path as a cleanup record.

In both `init` and `update`, a `removed` entry deletes its installed target even
when its source is gone. An active entry that does not match any selected Stack
also deletes its installed target. A file path removes only that file; a
directory path removes the complete destination subtree, including local edits
and additions. These explicit deletions do not prompt and are not suppressed by
conflict-skip or new-content options. Missing targets are harmless no-ops.
Cleanup is driven only by catalog entries: removing an entry from the catalog or
changing its path does not infer a deletion of its previous destination. Keep an
explicit `removed` entry for any old target that needs cleanup.

Paths are relative to the corresponding kind directory under
`src/blueprints/`. A path ending in `/` selects a directory recursively; its
filenames and relative structure are preserved. A path without a trailing slash
selects one file. Do not use glob patterns or internal Stack overlays. A nested
directory named `stacks/` is ordinary content.

For an active, matching directory selection, the installed subtree is
authoritative for file membership. During both `init` and `update`, files absent
from the selected source directory are removed, including nested local additions
and files that disappeared upstream. This membership cleanup also runs when a
Skill is current or its update is skipped. It does not replace surviving files
or install source-only files: Agents and Instructions retain their per-file
version and new-content decisions, and Skills still require a version bump for
content additions or changes. A file selection owns only that file and never
authorizes cleanup of neighboring files. Symbolic links and unsafe cleanup
targets are rejected; no installed-content inventory is maintained.

Agents and Instructions are named Markdown files with their own version
metadata. They can be grouped in catalog-selected directories, but each file is
updated independently and keeps its source path. Skills remain directories led
by `SKILL.md`; changes and additions require a Skill version bump.

Unlisted source files are not installed. Keep all three catalog sections and
validate catalog changes through the real CLI tests.

Before changing a project, Spindle validates the catalog and prepares the
selected rendered writes, Config content, deletions, and directory-membership
cleanup. Preparation failures leave the project unchanged. An application-time
filesystem failure stops reconciliation and reports completed changes;
application is not transactional and does not roll back earlier writes.

The package build compiles the catalog and bundles the Blueprint tree under `build/blueprints`.
Published packages use that bundled tree and do not include a separate
`src/blueprints` fallback.

`SPINDLE_BLUEPRINTS_DIR` overrides only the Blueprint asset root, not the catalog.
External YAML catalogs are not loaded; overridden assets must satisfy the same
compiled catalog. Runtime validation still checks safe, nonoverlapping paths,
source types and existence, symbolic links, and required `SKILL.md` files.
