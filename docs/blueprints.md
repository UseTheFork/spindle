# Authoring Blueprints

## CLI workspace root

Spindle discovers the Git working-tree root before running workspace commands:
`init`, `update`, `settings`, `tool`, and `sdd`. They fail without
running if Git is unavailable or the current directory is not inside a Git
working tree; Spindle does not fall back to the current directory. Help and
version output remain available outside Git.

`init` and `update` always manage `.github` at the discovered root, including
when invoked from a nested directory. A successful `init` installs selected
Blueprints before applying project guidance and the tooling registry. Both
`init` and `update` render project guidance before changing the project, then
replace `docs/agents/domain.md` and `docs/agents/ticket-tracker.md` and
regenerate `docs/agents/tooling.md`. Copilot instructions between
`<!-- spindle:start -->` and `<!-- spindle:end -->` are replaced while content
outside a valid pair is preserved. Unmarked files and files with invalid
markers are replaced entirely.

The `tool` subcommands maintain project-specific entries in
`.github/spindle.json` and regenerate `docs/agents/tooling.md`. Spindle's three
built-in commands are always included in the guide and `tool list`; their keys
are reserved and are not stored in the registry. A missing `tooling` array is
initialized to an empty array by `init` or `update`; existing entries are
preserved. `sdd create` creates an ID-based feature workspace beneath `.scratch/` in the
discovered root, copying the shared SDD spec template and optionally a design
template with `--with-design`. Feature and ticket creation require a valid
project Config with `spindle_package_manager`, initialized by `spindle init`.
`sdd status` requires an
explicit `--spec` path within that checkout and reads the stored ledger without
mutation. The old report-path resolver is not available, and dated feature
workspaces are not migrated.

The shipped collection is controlled by the typed `blueprintCatalog` object in
`src/Assets/Blueprints/Catalog.ts`. Edit this object to add or retire entries, then
rebuild Spindle. TypeScript checks entry fields, supported
Stack names, and the trailing slash required for Skill directories. Every
catalog entry has a logical key, a source `path`, and a list of supported
`stacks`. Logical keys identify entries;
they do not rename installed content. An empty Stack list applies to every
Stack, and a nonempty list applies when any listed Stack is selected.

The catalog has exactly three sections: `agents`, `instructions`, and
`skills`. Empty sections are valid. Entries must name existing sources,
including entries that do not match the current Stack selection.

`update` scans installed Agents, Instructions and Skill entry files before
making changes. An item with a `metadata.spindle` key is managed regardless of
its version. Managed items absent from the selected catalog are removed,
including local edits and entire Skill directories. Unrelated unmanaged items
are preserved. Malformed or unreadable metadata outside selected catalog paths
stops the update before changes are applied.

Update installs all missing, stack-matching items and overwrites every selected
catalog path without prompting, including local edits and unmanaged collisions.

Paths are relative to the corresponding kind directory under
`src/Assets/Blueprints/`. A path ending in `/` selects a directory recursively; its
filenames and relative structure are preserved. A path without a trailing slash
selects one file. Do not use glob patterns or internal Stack overlays. A nested
directory named `stacks/` is ordinary content.

For a selected Skill directory, files absent from the selected source
are removed, including nested local additions. Standalone unmanaged Agents and
Instructions outside selected catalog paths are preserved. Symbolic links and
unsafe cleanup targets are rejected.

Agents and Instructions are named Markdown files with their own version
metadata. They can be grouped in catalog-selected directories, but each file is
updated independently and keeps its source path. Skills remain directories led
by `SKILL.md`.

The asset catalog contains only declarative metadata and type-only imports.
`src/BlueprintManagement/Catalog/BlueprintCatalog.ts` owns its types, validation,
and validated export, including the reviewer metadata consumed by SDD.
Unlisted source files are not installed. Keep all three catalog sections and
validate catalog changes through the real CLI tests.

`init` and `update` share an application-owned Blueprint reconciliation service.
It resolves the installation service during asynchronous boot and keeps each
run's Config, prompt answers, plans, and mutable state local to that operation.
The service creates a fresh computed-context instance for each run, so computed
values are memoized within a reconciliation but do not become stale across runs.
Project guidance uses the same computed providers and configured Stacks when
rendered. Undefined template values stop preparation before files are changed.

## Computed Variables

Variables and Computed Variables serve different purposes. A Variable is
caller-supplied text available through `variables`, such as an SDD command's
title. A Computed Variable is a named value derived by Spindle from workflow
context; that context may include Config values. Reference it with standard
Nunjucks interpolation through the separate `computed` namespace, for example:

```yaml
description: "{{ computed.internal_skill_description }}"
```

Computed Variable names are explicit public keys in the typed
`computedVariableProviders` registry in
`src/TemplateRendering/Computed/ComputedVariableProviders.ts`; they are not
inferred from class names. Each provider has its own module under
`src/TemplateRendering/Computed/Providers/`. To add one, implement a
`ComputedVariableProvider` subclass and register its class under the desired
template name. Providers receive the Application and choose which application
state to use; project Config-dependent providers should read the current project
Config. Ordinary template inputs remain caller-supplied and are independent of
Computed Variables. Implement a synchronous `render(): string | undefined`
method to return the value when its required application state is available, and
add the provider class to the registry under its chosen name.

Each reconciliation run gets a fresh application-managed computed-context
service. Each registered provider is instantiated with the Application and
rendered once per operation; repeated context requests reuse the resolved values
across Blueprints and version inspection. SDD feature creation likewise shares
one render context across its spec and optional design, and ticket creation
renders with its existing command inputs. A later operation resolves providers
again.
Computed values are not independently persisted in Config, prompted for, or
directly overridable by project Variables or CLI options. Their source inputs
may be stored in Config. They are developer-shipped providers, not project
plugins. The provider contract does not expose machine-wide settings or
arbitrary environment inputs.

Errors identify the missing computed name or failing registered provider and are
reported during preparation, before Spindle applies generated files, Config
changes, deletions, or membership cleanup. Do not rely on an unresolved or failed
value being rendered as empty text.

## Settings and commit guidance

`spindle settings` walks through the known settings interactively. Use
`spindle settings get [key]` to read values and `spindle settings set <key> <json>`
to change one value without a terminal, for example
`spindle settings set commit.allow_body true`. Set `commit.allowed_scopes` before
enabling `commit.scopes_enabled`. Each change runs the update workflow and
overwrites selected catalog paths.

The `commit` object controls the internal Conventional Commits skill:
`allow_body` (default `false`), `title_max_length` (default `72`),
`scopes_enabled` (default `false`), `allowed_scopes` (default `[]`), and
`allow_breaking_changes` (default `false`). Enabled scopes must be nonempty,
distinct lowercase kebab-case names that fit within the title limit. The limit
must be at least 11 characters (12 when breaking changes are enabled), so every
supported type can fit. Existing
configurations without `commit` use these defaults.

Before changing a project, Spindle validates the catalog and prepares the
selected rendered writes, Config content, deletions, and directory-membership
cleanup. Preparation failures leave the project unchanged. An application-time
filesystem failure stops reconciliation and reports completed changes;
application is not transactional and does not roll back earlier writes.

The package build compiles the catalog and bundles the Blueprint tree under `build/Assets/Blueprints`.
It copies only distributed Agents, Instructions, and Skills; catalog JavaScript
is emitted by TypeScript rather than overwritten with source files.
Published packages use that bundled tree and do not include a separate
`src/Assets/Blueprints` fallback.

The CLI uses module-relative Blueprint assets: source execution uses
`src/Assets/Blueprints/` and packaged execution uses the bundled `build/Assets/Blueprints/`
assets. External YAML catalogs are not loaded. Runtime validation checks safe,
nonoverlapping paths, source types and existence, symbolic links, and required
`SKILL.md` files.

## Project initialization and tooling

`src/Assets/Templates/Catalog.ts` declares typed source/destination pairs for
project assets and shared SDD document templates. After installing selected
Blueprints, `spindle init` initializes project assets and creates
`.github/spindle.json` with the selected stacks and the tooling registry. The
`spindle tool` commands list, add, update, and remove registry entries; they do
not discover or execute project commands. Tooling owns the registry and its
generated `docs/agents/tooling.md` guide. SDD feature documents use the numbered
feature workspace: a design is optional, but when present it is approved before
the spec, and tickets are derived from the spec.
