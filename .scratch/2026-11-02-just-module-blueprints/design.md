# Just Module Blueprints

## Intent and success criteria

Manage Just modules as independently managed Blueprints so Spindle can generate
project tooling for the selected Stacks on every `init` and `update`.

- Each Just module is an independently managed Blueprint, and supports a
  required shared file plus optional selected Stack-specific additions for
  that module. A Stack overlay cannot create a module by itself.
- The Blueprint directory name is the Just module name. Its shared entry is
  `JUSTMODULE.just`, and selected Stack additions use
  `stacks/<stack>/JUSTMODULE.just`; these combine into
  `.github/scripts/just-modules/<name>.just`.
- Validate each Blueprint directory name as a Just module identifier; fail
  clearly for invalid names rather than renaming them.
- Render shared and Stack module source files with Nunjucks using the
  project's resolved Stack and Variable context.
- Resolve missing template Variables with the existing lifecycle behavior:
  prompt interactively and fail clearly in non-interactive runs.
- Spindle does not validate Just syntax in rendered module files; Just reports
  syntax errors when users run it.
- Generated module files are installed under `.github/scripts/just-modules/`
  and regenerated on each `init` and `update`; existing generated files are
  replaced without overwrite/skip prompts. No version metadata or comparison
  is used.
- Newly shipped modules are installed and imported automatically during
  `update`, without the shared lifecycle's new-Blueprint prompt.
- Files at the generated module paths are Spindle-owned and replaced. Refuse
  to follow or replace a symbolic link or non-regular file at those paths.
- Each run rebuilds module output from the shared file and only the currently
  selected Stack contributions; content from deselected Stacks disappears.
- Remove obsolete generated module files and their imports when a module is no
  longer shipped. The designated generated module directory and imports
  targeting it are Spindle-managed.
- Cleanup removes only direct `.just` files whose module names are no longer
  shipped; nested directories and non-`.just` files are left untouched.
- If `.github/scripts/just-modules/` exists as a symbolic link or a
  non-directory, fail clearly without following or replacing it.
- The root `justfile` exists after installation. Create it when absent with
  only the required imports for shipped Just Modules.
- Ensure the root `justfile` has required `mod` imports for the installed
  modules. Preserve its unrelated recipes and content, add only missing
  imports, and replace generated module files on regeneration. Migrate this
  repository's existing optional imports to required imports.
- Recognize managed imports only as standalone `mod <name> '<path>'`
  declarations whose path resolves to a direct `.just` file in the
  Spindle-managed module directory.
- Preflight the root `justfile` for conflicts before replacing or removing any
  generated module files; a conflict leaves all managed files unchanged.
- Render and prepare every selected module before writing any managed files;
  a template or Variable error leaves generated modules and the root
  `justfile` unchanged.
- Stage prepared module files and the updated root `justfile` before applying
  replacements or cleanup.
- If replacement fails after applying staged changes begins, report the error
  without attempting rollback; a later run regenerates the managed outputs.
- If an existing root `justfile` is a symbolic link or not a regular file,
  fail clearly without following or replacing it.
- Tests cover module generation for selected Stacks, regeneration, creation of
  a missing root `justfile`, and preservation and idempotent imports in an
  existing root `justfile`.

## Scope and constraints

In scope: the Just module Blueprint handler and registry entry, module
Blueprint sources under `src/blueprints/just/`, Nunjucks rendering for
`.just` files, root Justfile import management, lifecycle integration, tests,
and the documentation of the versionless kind.

The existing Just module sources in `.github/scripts/just-modules/` establish
the initial generated output. The shared Blueprint lifecycle and Stack overlay
selection remain authoritative for file discovery and rendering. Same-named
shared and selected Stack module files contribute to one installed module file
rather than colliding or overwriting each other. Merge shared content first,
then Stack additions in configured stack order, separating contributions with
a blank line. Just Modules are the explicit exception to the usual Blueprint
SemVer convention.

## Considered approaches

| Approach | Summary | Trade-off |
| --- | --- | --- |
| **1. Blueprint-native, independently regenerated modules** | Treat each module as its own Blueprint, combine its shared file and selected Stack additions, overwrite the generated module on each run, and maintain its import in the root `justfile`. | Reuses lifecycle behavior while allowing selective module ownership; generated-file edits are intentionally replaced. |
| 2. Install only missing modules | Leave existing generated modules unchanged. | Preserves edits but prevents regeneration from updating installed modules. |
| 3. Generate the entire root `justfile` | Make one generated file own module imports and recipes. | Simple generation, but risks replacing user-owned Justfile content. |

## Selected direction

Use approach 1 (user-selected). Each module is an independent Blueprint
installed under `.github/scripts/just-modules/`. Combine its shared content
with same-named overlays for selected Stacks into one generated module file,
in shared-first and configured-stack order with blank lines between
contributions. Regenerate and replace generated module files on every `init`
and `update`, bypassing the shared lifecycle's overwrite/skip prompts and
without versions. Rebuild output using only currently selected Stacks so
deselected Stack content is removed. Newly shipped modules are installed and
imported automatically during `update`, without a new-Blueprint prompt. Render
shared and Stack contributions with Nunjucks in the resolved project Stack and
Variable context; use existing prompts for missing Variables interactively and
clear errors non-interactively. Files at the
generated module paths are Spindle-owned and replaced; refuse to follow or
replace a symbolic link or other non-regular file. The Blueprint directory
name supplies the module name; sources live under
`src/blueprints/just/<module-name>/`;
`JUSTMODULE.just` holds its shared entry and Stack overlays with that entry
name contribute to the generated `<name>.just` file. Validate the directory
name as a Just module identifier and fail clearly rather than renaming it.
Remove direct `.just` files no longer present in the shipped Blueprints and
only the imports whose paths target those obsolete files. Leave nested
directories and non-`.just` files untouched. Treat files in
`.github/scripts/just-modules/` and imports targeting that directory as
Spindle-managed. Spindle renders these files but leaves Just syntax validation
to Just when users run it. If the managed module directory is a symbolic link
or non-directory, fail without following or replacing it.

Preflight the root `justfile` and reject module-name/path conflicts before
changing generated files. Render and prepare every selected module before
writing managed files, so template or Variable errors leave generated files
and the root `justfile` unchanged. Stage all prepared module files and the
updated root `justfile` before applying replacements or cleanup. If applying
staged changes fails partway through, report the error without rollback; a
later run regenerates managed outputs. Ensure a root `justfile` exists and has
required `mod` imports for the
installed modules. Create the file with only those imports when missing; when
it exists, preserve its other content and add only missing imports. Repeated
runs must not duplicate imports. Deduplicate identical existing managed
imports, keeping one required import per module. Consolidate imports targeting the
Spindle-managed module directory at the end of the file, separated from
unrelated content by a blank line. Keep all managed imports sorted
alphabetically by module name, including existing managed imports; unrelated
imports and other content remain unchanged. If the same module name is already
imported from another path, fail clearly and leave the existing import
untouched.
Move only managed import declarations; comments and all other lines remain in
their original positions. Preserve the existing line endings and
final-newline style of the root `justfile`.
Amend ADR 0001 to record Just Modules as a versionless exception. Convert this
repository's current `mod?` imports to required `mod` imports; no legacy
compatibility behavior is needed. If the root `justfile` path is a symbolic
link or another non-regular file, fail without following or replacing it.

## Assumptions left to implementation

- The existing module files are migrated into the Blueprint source tree and
  continue to provide their current recipes; a same-named Stack file adds to
  the required shared module rather than replacing it. Every Just Module
  Blueprint must define its shared `JUSTMODULE.just` file.
- Import paths are relative to the project root and follow Just's required
  `mod` syntax.
- Backward compatibility with legacy optional `mod?` imports is out of scope.
- Alternate names for imports targeting Spindle-managed module files are out of
  scope; Spindle manages imports by each module's expected name and path.
- Root Justfile updates should be narrowly scoped to imports targeting the
  Spindle-managed module directory; unrelated user content remains unchanged.
- Shared and Stack module contributions will not define duplicate recipe names;
  no separate collision check is needed.
