Category: enhancement
Status: ready-for-agent
Reporter: unknown

# Add Just Module Blueprints

## Problem Statement

Spindle currently has no Blueprint kind for Just modules. The repository's
modules are maintained outside the shared Blueprint lifecycle, so projects
cannot generate module content from their selected Stacks or reliably
reconcile module files and imports during `init` and `update`.

The root `justfile` is user-owned and may already contain recipes and imports.
Spindle needs to manage its module imports and generated module files without
replacing unrelated content or leaving stale modules after an update.

## Solution

Add Just Modules as an independently managed, versionless Blueprint kind.
Each module Blueprint has a required shared entry file and may have
same-named Stack overlays. Render the shared file and selected overlays with
Nunjucks, concatenate them in shared-first and configured-Stack order, and
install the result under `.github/scripts/just-modules/<name>.just`.

Regenerate all shipped modules on every `init` and `update`, without the
shared lifecycle's conflict or new-Blueprint prompts. Newly shipped modules
are installed automatically during `update`; modules no longer shipped are
removed. Create the root `justfile` if absent, or reconcile required imports
while preserving unrelated content when it exists.

## User Stories

1. As a project maintainer, I want `init` to install Just Modules alongside
   other shipped Blueprints, so that project recipes are available from the
   start.
2. As a project maintainer, I want `update` to regenerate every shipped Just
   Module, so that generated tooling reflects the current Spindle release.
3. As a project maintainer, I want Just Modules to regenerate without
   overwrite or skip prompts, so that the generated content always matches
   the shipped Blueprint and current project configuration.
4. As a Blueprint author, I want each Just module to be independently
   represented, so that projects can manage individual modules and imports.
5. As a Blueprint author, I want every module to have a shared entry file, so
   that selected Stack overlays only augment an existing module.
6. As a Blueprint author, I want the module Blueprint's directory name to
   identify the module, so that its generated file and import name are
   predictable.
7. As a Spindle maintainer, I want invalid module names to fail clearly,
   rather than being silently renamed into potentially different Just
   identifiers.
8. As a Blueprint author, I want a shared Just module and same-named Stack
   files to become one module, so that common recipes remain available with
   Stack-specific additions.
9. As a project maintainer, I want shared module content before Stack
   additions, so that generated files have a consistent, readable order.
10. As a project maintainer, I want selected Stack additions ordered by the
    configured Stack order, so that generation is deterministic.
11. As a project maintainer, I want blank lines between shared and Stack
    contributions, so that combined module content remains legible.
12. As a project maintainer, I want content from deselected Stacks removed on
    the next run, so that generated modules reflect only the current
    configuration.
13. As a Blueprint author, I want Nunjucks templates in shared and Stack
    module content, so that recipes can use the project's resolved Stacks and
    Variables.
14. As a project maintainer, I want missing template Variables to prompt in
    interactive runs and produce clear errors in non-interactive runs, so
    that required inputs are explicit.
15. As a project maintainer, I want template errors detected before managed
    files change, so that a failed render does not leave partially refreshed
    module content.
16. As a project maintainer, I want module contents installed at
    `.github/scripts/just-modules/`, so that generated modules have a
    predictable location within `.github`.
17. As a project maintainer, I want existing generated module files replaced
    on each run, so that local edits to generated outputs do not cause stale
    tooling to persist.
18. As a project maintainer, I want files no longer shipped as Just Modules
    removed from the managed module directory, so that obsolete recipes do
    not remain installed.
19. As a project maintainer, I want cleanup limited to obsolete direct `.just`
    files, so that nested directories and unrelated file types are preserved.
20. As a project maintainer, I want new modules automatically imported during
    `update`, so that newly shipped recipes become available without another
    prompt.
21. As a project maintainer, I want Spindle to create a missing root
    `justfile` containing only required module imports, so that modules are
    usable without imposing an unrelated default recipe.
22. As a project maintainer, I want existing root `justfile` recipes and
    unrelated imports preserved, so that Spindle does not take ownership of
    project-authored Just content.
23. As a project maintainer, I want each shipped module represented by a
    required `mod` import, so that missing generated modules fail visibly
    rather than being silently skipped.
24. As a project maintainer, I want repository imports migrated from `mod?`
    to `mod`, so that the repository uses the new required-import behavior.
25. As a project maintainer, I want managed imports consolidated at the end
    of the root `justfile` and sorted alphabetically, so that their order is
    stable and easy to review.
26. As a project maintainer, I want identical managed import declarations
    deduplicated, so that each module has one required import.
27. As a project maintainer, I want comments and all non-managed lines to
    remain in their original positions when imports are reconciled, so that
    unrelated file organization is preserved.
28. As a project maintainer, I want the root `justfile`'s line endings and
    final-newline style preserved, so that reconciliation does not reformat
    unrelated content.
29. As a project maintainer, I want import conflicts detected when an
    expected module name is already imported from another path, so that
    Spindle does not silently redirect the module.
30. As a project maintainer, I want import conflicts checked before any
    generated module is replaced or removed, so that conflicts do not leave
    managed files partially updated.
31. As a project maintainer, I want a root `justfile` symlink or non-regular
    file rejected, so that Spindle does not follow or replace an unexpected
    filesystem target.
32. As a project maintainer, I want the managed module directory rejected
    when it is a symlink or non-directory, so that Spindle does not write
    through or replace an unexpected filesystem target.
33. As a project maintainer, I want a generated module destination rejected
    when it is a symlink or non-regular file, so that Spindle does not follow
    or replace an unexpected filesystem target.
34. As a project maintainer, I want prepared modules and the updated root
    `justfile` staged before replacements and cleanup, so that preparation
    errors do not modify managed outputs.
35. As a project maintainer, I want filesystem errors reported explicitly if
    applying staged changes fails, so that a later run can regenerate
    Spindle-managed outputs.
36. As a Just user, I want Just syntax validation left to Just, so that
    Spindle can render and install module content without duplicating Just's
    parser.

## Implementation Decisions

- Register Just Modules as a distinct Blueprint kind in the shared lifecycle.
  Keep the kind versionless; it bypasses SemVer planning and the normal
  conflict and new-Blueprint selection prompts.
- Treat each module as an independent Blueprint. Its directory name is the
  module name, and it must contain a shared `JUSTMODULE.just` entry. A
  same-named entry under a selected Stack contributes to that module rather
  than replacing it. Stack overlays alone do not create modules.
- Combine rendered contributions in this order: shared file, then selected
  Stacks in configured order, with a blank line between contributions. No
  separate duplicate-recipe check is required; authors will avoid duplicate
  recipe names.
- Render `.just` content with Nunjucks using the normal resolved Stack and
  Variable context. Preserve existing behavior for interactive prompts and
  non-interactive missing-Variable errors. Leave Just syntax validation to
  Just.
- Rebuild and replace every shipped generated module on every `init` and
  `update`. Automatically include newly shipped modules. Remove obsolete
  direct `.just` files from the managed directory; leave nested directories
  and non-`.just` files untouched.
- Create the root `justfile` if missing with only required imports for shipped
  modules. For an existing file, preserve unrelated content and imports while
  reconciling required module imports.
- Recognize managed imports only as standalone required `mod <name> '<path>'`
  declarations whose path resolves to a direct `.just` file in the
  Spindle-managed module directory. Optional `mod?` imports are not part of
  the compatibility contract.
- Fail clearly if the same expected module name is imported from a different
  path. Preflight this and filesystem safety conditions before changing
  generated module files.
- Consolidate managed imports at the end of the root `justfile`, separated
  from unrelated content by a blank line. Keep one required import per
  module, sorted alphabetically by module name. Move only managed import
  declarations; leave comments and unrelated lines in place.
- Preserve the root `justfile` line endings and final-newline style.
- Refuse to follow or replace a symbolic link or non-regular file at the root
  `justfile`, managed module directory, or generated module file destinations.
- Render and prepare every selected module before changing managed files.
  Stage prepared module files and the updated root `justfile` before applying
  replacements or cleanup. If applying changes fails partway through, report
  the error without rollback; a later run regenerates managed outputs.
- Record the versionless Just Module exception and module composition
  behavior in the Blueprint lifecycle architecture decision, and define “Just
  Module” in the project glossary.

## Testing Decisions

- Test observable CLI behavior rather than internal handler details.
- Use the existing real-CLI test helpers with temporary projects and Blueprint
  fixtures; exercise both `init` and `update`.
- Verify installation of shipped modules, automatic installation of a newly
  shipped module on `update`, replacement without prompts, and cleanup of
  obsolete direct module files.
- Verify independent module Blueprints, required shared entries, selected
  Stack composition, shared-first/configured-Stack ordering, blank-line
  separation, and removal of deselected Stack content.
- Verify Nunjucks rendering against resolved Stacks and Variables, including
  interactive missing-Variable prompts and non-interactive errors.
- Verify root `justfile` creation, required imports, import ordering,
  deduplication, idempotency, obsolete-import cleanup, and preservation of
  unrelated recipes, imports, comments, line endings, and final-newline style.
- Verify a same-name/different-path import conflict is reported before
  generated files change.
- Verify symlink and non-regular-file refusals for the root `justfile`, the
  managed module directory, and generated module destinations.
- Verify render, Variable, and staging errors occur before managed files
  change; verify applying a staged change failure is explicitly reported.
- Prior art is the existing CLI integration coverage for Blueprint
  installation, Stack overlays, rendering, conflicts, and update behavior.

## Out of Scope

- SemVer metadata, version comparisons, and update prompts for Just Modules.
- Compatibility with legacy optional `mod?` imports or alternate module names
  for Spindle-managed files.
- Rewriting or replacing unrelated root `justfile` recipes, comments, or
  imports.
- Just syntax parsing or duplicate-recipe validation by Spindle.
- Removing nested directories or non-`.just` files from the managed module
  directory.
- Full rollback if a filesystem error occurs after staged replacements begin.

## Further Notes

- The current repository's optional module imports will be migrated to
  required imports.
- The source and glossary use “Just Module” as the canonical term.
- The implementation may need Just-specific composition because the current
  shared Blueprint planner rejects duplicate output paths rather than
  concatenating same-named shared and Stack files.
