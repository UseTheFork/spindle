Reporter: unknown
Category: enhancement
Status: ready-for-agent

# Remove Just Support

## Problem Statement

Spindle currently requires the Just executable to be available before running
any CLI command, and manages Just Modules as a Blueprint kind. This makes Just
a prerequisite even for users who only want Spindle's other Blueprints and
workflow commands.

## Solution

Remove Just as a Spindle product dependency and Blueprint kind. Users can run
Spindle without installing Just, and Spindle no longer installs or reconciles
Just Modules. Keep the repository's own Just-based developer workflow
unchanged.

## User Stories

1. As a Spindle user, I want to run its commands without installing Just, so
   that an unrelated executable does not block my workflow.
2. As a project maintainer, I want `init` and `update` to manage only the
   supported non-Just Blueprint kinds, so that Spindle no longer generates
   Just Modules for my project.
3. As a project maintainer with previously generated Just Modules, I want
   Spindle to leave those files untouched, so that removing the feature does
   not delete project content.
4. As a project maintainer with previously generated imports in my root
   `justfile`, I want Spindle to leave those imports untouched, so that
   removing support does not rewrite my Just configuration.
5. As a Blueprint author, I want the catalog to accept only the remaining
   supported kinds, so that retired Just Modules are not treated as active
   Spindle content.
6. As a Blueprint author, I want unsupported catalog kinds to use the
   catalog's generic unknown-kind error, so that there is no Just-specific
   compatibility behavior or special case.
7. As a contributor, I want Just-specific product tests and fixtures removed,
   so that the test suite no longer asserts behavior Spindle does not support.
8. As a contributor, I want unrelated test coverage preserved, so that this
   removal does not weaken verification of other features.
9. As a Spindle user, I want current user-facing documentation to describe
   only supported Blueprint kinds and requirements, so that guidance matches
   the product.
10. As a repository contributor, I want the project's Just developer recipes
    and tooling left intact, so that this product change does not disrupt
    repository development.
11. As a maintainer, I want Just-specific material removed from current ADRs
    while unrelated decisions remain, so that architectural guidance matches
    the supported product without losing other design context.

## Implementation Decisions

- Remove the CLI's Just executable prerequisite and its installation guidance.
- Remove Just Modules as a Blueprint Catalog kind, including catalog parsing
  and validation support, handler registration, shipped Blueprint sources,
  and package assets.
- Keep generic unknown-kind validation. A catalog containing a former `just`
  kind is rejected as an unsupported kind, without a Just-specific check or
  message.
- Remove Just-specific tests and fixtures, including prerequisite coverage.
  Add no tests to replace removed behavior; preserve tests for unrelated
  features.
- Do not migrate or clean up existing project files or imports created by
  previous Spindle runs. The product no longer manages them.
- Remove Just-specific product guidance from current documentation and ADRs,
  preserving unrelated content in mixed documents.
- Keep the repository's root `justfile`, its developer recipes, and its own
  Just module directory and development workflow.

## Testing Decisions

- Do not add tests for the removal or for behavior that is explicitly left
  unmanaged.
- Remove Just-specific tests and Just-only test fixtures. When shared test
  fixtures also support unrelated tests, update them to the remaining catalog
  kinds without removing unrelated assertions.
- Preserve existing tests for non-Just CLI commands, Blueprint kinds, and
  workflows.
- No new test seam is needed. The existing CLI is the highest-level seam, but
  no replacement CLI test for the removed Just prerequisite is required.

## Out of Scope

- Removing Just from the repository's contributor and developer workflows.
- Deleting or rewriting existing project Just Module files or root `justfile`
  imports.
- Providing a migration path or backward compatibility for the removed
  Blueprint kind.
- Adding replacement tests for removed Just behavior.

## Further Notes

- The glossary's Just Module term has already been removed.
- Catalog and authoring documentation, product help text, and applicable ADRs
  should be checked for remaining Just-specific product behavior descriptions.
- Just references that describe this repository's developer workflow are
  intentionally retained.
