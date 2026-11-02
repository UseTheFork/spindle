# Just Module Blueprints

## Intent and success criteria

Manage Just modules as a Blueprint kind so Spindle can generate project tooling
for the selected Stacks on every `init` and `update`.

- A Just Modules Blueprint kind participates in the shared Blueprint lifecycle
  and supports shared files plus selected Stack-specific files.
- Generated module files are installed under `.github/scripts/just-modules/`
  and regenerated on each run; no version metadata or version comparison is
  used.
- The root `justfile` exists after installation. Create it when absent.
- Ensure the root `justfile` imports the installed modules. Preserve its
  unrelated recipes and content, make import installation repeatable, and
  replace generated module files on regeneration.
- Tests cover module generation for selected Stacks, regeneration, creation of
  a missing root `justfile`, and preservation and idempotent imports in an
  existing root `justfile`.

## Scope and constraints

In scope: the Just Modules Blueprint handler and registry entry, module
Blueprint sources, root Justfile import management, lifecycle integration,
tests, and the documentation of the versionless kind.

The existing Just module sources in `.github/scripts/just-modules/` establish
the initial generated output. The shared Blueprint lifecycle and Stack overlay
selection remain authoritative for file discovery and rendering. Just Modules
are the explicit exception to the usual Blueprint SemVer convention.

## Considered approaches

| Approach | Summary | Trade-off |
| --- | --- | --- |
| **1. Blueprint-native, regenerated modules** | Render shared and selected Stack files through the lifecycle, overwrite generated modules on each run, and maintain their imports in the root `justfile`. | Reuses existing lifecycle behavior; generated-file edits are intentionally replaced. |
| 2. Install only missing modules | Leave existing generated modules unchanged. | Preserves edits but prevents regeneration from updating installed modules. |
| 3. Generate the entire root `justfile` | Make one generated file own module imports and recipes. | Simple generation, but risks replacing user-owned Justfile content. |

## Selected direction

Use approach 1 (user-selected). Install modules under
`.github/scripts/just-modules/`, combining shared module files with overlays
for selected Stacks. Regenerate and replace those generated module files on
every `init` and `update`, without versions or update prompts.

Ensure a root `justfile` exists and imports the installed modules. Create the
file if missing; when it exists, preserve its other content and maintain the
module imports without adding duplicates on repeated runs. Amend ADR 0001 to
record Just Modules as a versionless exception.

## Assumptions left to implementation

- The existing module files are migrated into the Blueprint source tree and
  continue to provide their current recipes unless Stack overlays specialize
  them.
- Import paths are relative to the project root and follow Just's existing
  module syntax.
- Root Justfile updates should be narrowly scoped to the imports Spindle owns;
  unrelated user content remains unchanged.
