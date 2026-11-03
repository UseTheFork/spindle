# Remove Just Support

## Intent and success criteria

Remove Just as a requirement and supported Blueprint kind in Spindle. Users
should be able to run Spindle without installing Just, and Spindle should no
longer install or reconcile Just modules. Other Blueprint kinds and CLI
workflows remain available.

Success means:

- Spindle CLI commands no longer check for a `just` executable or link to its
  installation instructions.
- The Blueprint Catalog, parser, and lifecycle no longer recognize a `just`
  kind.
- Just Module handlers, shipped `.just` Blueprint files, and their catalog
  entries are removed.
- Just-specific tests and fixtures are removed. Do not add replacement tests
  for removed behavior; retain unrelated tests.
- Existing project files under `.github/scripts/just-modules/` and imports in
  the project's root `justfile` are left untouched. Do not add tests for this
  preservation behavior.
- User-facing documentation no longer describes Just Modules or Just as a
  Spindle requirement.
- Historical documents dedicated to Spindle's Just support are removed, and
  Just-specific material is removed from mixed historical documents while
  preserving their unrelated content. This cleanup covers ADRs and design
  documents, but not historical specs, issues, or implementation/review
  reports in `.scratch/`.
- The repository's root `justfile`, developer recipes, and Just-based
  development workflow remain unchanged.

## Scope and constraints

Remove the product-level Just prerequisite check and all Just Blueprint
support, including catalog typing and validation, handler registration,
packaged Blueprint assets, and product-specific test helpers and coverage.
Update directly related docs and catalog guidance.

Do not remove the root developer `justfile`, `.github/scripts/just-modules/`,
or Just recipes used to develop this repository. Do not remove unrelated
tests, add backward compatibility, or introduce a replacement workflow for
Just modules. Existing project-installed module files and imports are not
cleaned up or reconciled after Spindle support is removed; this behavior is
not tested. No package dependency on Just is declared; the current product
dependency is the CLI prerequisite check.

## Considered approaches

1. **Remove Just from Spindle only (selected).** Delete its Blueprint kind and
   prerequisite behavior while preserving repository developer tooling. This
   removes the user-facing dependency without changing how contributors run
   project commands.
2. **Remove Just throughout the repository.** Also replace the root developer
   recipes and update contributor tooling. This exceeds the requested product
   change and couples it to an unrelated workflow migration.

## Selected direction

Use approach 1, as confirmed by the user. Remove Just support completely from
Spindle without a compatibility layer. Preserve the repository's own Just
development workflow and all non-Just Blueprint kinds. Interpret “no tests”
as removing Just-specific tests and fixtures without adding replacement tests;
preserve unrelated test coverage. Existing user-project modules and imports
remain untouched, without a dedicated test. Catalog parsing has no Just-
specific compatibility path or check: a leftover `just` key fails through the
catalog's generic unknown-kind validation.

## Decisions left to implementation

- Remove only test code and fixtures whose purpose is Just prerequisite or
  Just Blueprint behavior. Update shared test catalog fixtures as needed to
  reflect the remaining catalog kinds, without dropping unrelated assertions.
-   Keep `just` references that describe this repository's developer workflow;
  remove product-facing references to Just Modules and the prerequisite.
  - Whether historical Just-only design documents under `.scratch/` are included
    in the cleanup remains open; specs, issues, and implementation/review reports
    there are preserved.
