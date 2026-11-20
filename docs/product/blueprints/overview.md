# Authoring Blueprints

## Installation and updates

`init` and `update` always manage `.github` at the discovered root, including
when invoked from a nested directory. A successful `init` installs selected
Blueprints before applying project guidance and the tooling registry. Both
`init` and `update` render project guidance before changing the project, then
replace `docs/agents/domain.md` and regenerate `docs/agents/tooling.md`.
Existing `docs/agents/ticket-tracker.md` files are left untouched. Copilot instructions between
`<!-- spindle:start -->` and `<!-- spindle:end -->` are replaced while content
outside a valid pair is preserved. Unmarked files and files with invalid
markers are replaced entirely. See [CLI workspace discovery](../cli/workspace.md),
[project initialization](../project/initialization.md), and
[tooling registry](../tooling/overview.md) for related behavior. [Project
Settings](../settings/overview.md) documents the settings CLI.

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
`assets/Blueprints/`. A path ending in `/` selects a directory recursively; its
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
`src/BlueprintManagement/Catalog/BlueprintCatalogOperations.ts` owns its types, validation,
and validated export, including the reviewer metadata consumed by SDD.
Unlisted source files are not installed. Keep all three catalog sections and
validate catalog changes through the real CLI tests.

`init` and `update` share an application-owned Blueprint reconciliation service.
It resolves the installation service during asynchronous boot and keeps each
run's Project Settings, prompt answers, plans, and mutable state local to that operation.
The service creates a fresh computed-context instance for each run, so computed
values are memoized within a reconciliation but do not become stale across runs.
Project guidance uses the same computed providers and configured Stacks when
rendered. Undefined template values stop preparation before files are changed.

Shared template rendering and Computed Variables are described in
[Template Rendering](../template-rendering/computed-variables.md).

Before changing a project, Spindle validates the catalog and prepares the
selected rendered writes, Project Settings content, deletions, and directory-membership
cleanup. Preparation failures leave the project unchanged. An application-time
filesystem failure stops reconciliation and reports completed changes;
application is not transactional and does not roll back earlier writes.

The package build compiles the catalog into `build/`. Both source execution and
published packages use the package-relative `assets/Blueprints/` tree. The
`assets/` directory must accompany `build/` when deploying the CLI. External
YAML catalogs are not loaded. Runtime validation checks safe,
nonoverlapping paths, source types and existence, symbolic links, and required
`SKILL.md` files.
