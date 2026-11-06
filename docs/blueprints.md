# Authoring Blueprints

## CLI workspace root

Spindle discovers the Git working-tree root before running workspace commands:
`init`, `update`, `sdd workspace`, and `setup-project`. They fail without
running if Git is unavailable or the current directory is not inside a Git
working tree; Spindle does not fall back to the current directory. Help and
version output remain available outside Git.

`init` and `update` always manage `.github` at the discovered root, including
when invoked from a nested directory. The explicit `--workspace` argument to
`setup-project` remains its target directory, even when it differs from the
discovered root or is outside Git. `sdd workspace` likewise honors its explicit
`--workspace` checkout and `--reports-dir`; root discovery is required for
invocation, but does not replace those report-path inputs.

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

`init` and `update` share an application-owned Blueprint reconciliation service.
It resolves the installation service during asynchronous boot and keeps each
run's Config, prompt answers, plans, and mutable state local to that operation.
The service creates a fresh computed-context instance for each run, so computed
values are memoized within a reconciliation but do not become stale across runs.

## Computed Variables

Variables and Computed Variables serve different purposes. A Variable is
user-supplied project input, available through `variables` and stored in the
project Config. A Computed Variable is a named string supplied by Spindle during
generation; reference it with standard Nunjucks interpolation through the
separate `computed` namespace, for example:

```yaml
description: "{{ computed.internal_skill_description }}"
```

Computed Variable names are explicit public keys in the typed
`computedVariableProviders` registry in `src/computed/computed-variable-providers.ts`;
they are not inferred from class names. Each provider has its own module under
`src/computed/providers/`. To add one, implement a `ComputedVariableProvider`
subclass and register its class under the desired template name. The provider
receives the resolved Config in its constructor: the selected Stacks and
effective Variables after normal resolution, including defaults. The Config is
read-only. Implement a parameterless synchronous `render(): string` method to
return the value, and add the provider class to the registry under its chosen
name.

Each reconciliation run gets a fresh application-managed computed-context
service. It copies and freezes the resolved Stacks and Variables passed to
providers. Each registered provider is instantiated and rendered once after
Config resolution; repeated or concurrent context requests in that run share
the resolved context and values, including across Blueprints and version
inspection. A later run resolves them again. Computed values are not persisted
in Config, prompted for, or directly overridable by project Variables or CLI
options. They are developer-shipped providers, not project plugins. The
provider contract does not expose machine-wide settings or arbitrary
environment inputs.

Errors identify the missing computed name or failing registered provider and are
reported during preparation, before Spindle applies generated files, Config
changes, deletions, or membership cleanup. Do not rely on an unresolved or failed
value being rendered as empty text.

Before changing a project, Spindle validates the catalog and prepares the
selected rendered writes, Config content, deletions, and directory-membership
cleanup. Preparation failures leave the project unchanged. An application-time
filesystem failure stops reconciliation and reports completed changes;
application is not transactional and does not roll back earlier writes.

The package build compiles the catalog and bundles the Blueprint tree under `build/blueprints`.
Published packages use that bundled tree and do not include a separate
`src/blueprints` fallback.

`SPINDLE_BLUEPRINTS_DIR` overrides only the Blueprint asset root, not the catalog.
The CLI resolves this override when it creates the application; installation
services use that application's fixed Blueprint source root for every operation.
Relative overrides are resolved against the discovered Git workspace root, not
the invocation directory, and remain fixed if the process later changes directory.
Without an override, source execution uses `src/blueprints/` and packaged
execution uses the bundled `build/blueprints/` assets. External YAML catalogs
are not loaded; overridden assets must satisfy the same compiled catalog.
Runtime validation still checks safe, nonoverlapping paths, source types and
existence, symbolic links, and required `SKILL.md` files.
