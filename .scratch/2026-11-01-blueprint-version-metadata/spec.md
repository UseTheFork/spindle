## Problem Statement

Blueprint versions currently live in a top-level frontmatter field. That field
is not clearly owned by Spindle and does not provide a namespaced home for
Spindle-managed metadata. Version extraction also conditionally renders source
content based on whether its frontmatter appears templated, and tests have
grown to cover many individual Nunjucks/YAML syntax combinations.

## Solution

Move every Blueprint kind's SemVer version to `meta.spindle.version`, including
future kinds. Render the complete entry file through Nunjucks with the normal
resolved project context before Gray-matter parses its frontmatter. Preserve
Nunjucks support in frontmatter and body content, existing SemVer comparison
and update behavior, and the guard that prevents installing an entry file that
changed after update planning.

Migrate shipped Blueprint sources and this repository's installed copies to
the nested field. Do not support or fall back to a top-level `version`; the
repository maintainer will reinstall installed Blueprints. Keep representative
CLI-level coverage for templated nested versions while removing redundant
syntax-permutation cases. Place generated test fixtures under
`tests/.generated/` and ignore that directory from within `tests/`.

## User Stories

1. As a Blueprint author, I want to put a Blueprint's SemVer version at
   `meta.spindle.version`, so that Spindle-owned metadata has a clear namespace.
2. As a Spindle maintainer, I want all current Blueprint kinds to use the same
   version location, so that Skills, Agents, and Instructions follow one
   consistent convention.
3. As a Spindle maintainer, I want future Blueprint kinds to use the same
   shared version convention, so that adding a kind does not create a separate
   versioning rule.
4. As a project maintainer, I want `init` to accept a Blueprint whose rendered
   frontmatter contains a valid nested SemVer version, so that new Blueprints
   follow the namespaced metadata convention.
5. As a project maintainer, I want `update` to compare the rendered nested
   shipped version with the installed nested version, so that outdated
   Blueprints are identified correctly.
6. As a project maintainer, I want installed Blueprints with a missing or
   invalid nested version to retain the current warning and skip behavior, so
   that Spindle does not unexpectedly replace content of unknown version.
7. As a Blueprint author, I want Nunjucks expressions in frontmatter to render
   before YAML parsing, so that templated `meta.spindle.version` values remain
   supported.
8. As a Blueprint author, I want Nunjucks rendering to remain available in the
   complete Blueprint entry file, so that both frontmatter and body content
   can use project Stacks and Variables.
9. As a project maintainer, I want update planning to render each complete
   source entry with the normal resolved project context, even when it may be
   up to date, so that version extraction has consistent template semantics.
10. As a project maintainer, I want normal variable prompts and
    non-interactive missing-input errors to apply during version checks, so
    that rendering does not invent fallback values or hide required input.
11. As a Blueprint author, I want undefined variables encountered during
    rendering to remain explicit errors, so that broken templates are not
    treated as successful updates.
12. As a project maintainer, I want Spindle to verify that the source entry
    has not changed between version planning and installation, so that a
    stale version decision cannot install different content.
13. As a Blueprint author, I want Spindle's version handling to read only its
    own `meta.spindle.version` value, so that other metadata namespaces and
    frontmatter fields keep their existing meaning.
14. As a Spindle maintainer, I want every shipped Blueprint source to use the
    nested version field, so that the shipped collection follows the new
    contract.
15. As a Spindle maintainer, I want this repository's installed Blueprint
    copies to be migrated to the nested version field, so that local managed
    content is consistent after reinstall.
16. As a Spindle maintainer, I want top-level `version` to have no fallback or
    backwards-compatible interpretation, so that there is one unambiguous
    metadata contract.
17. As a Spindle maintainer, I want one representative CLI regression for a
    Nunjucks-templated nested version, so that template support is verified
    without retaining a large suite of syntax permutations.
18. As a Spindle maintainer, I want ordinary nested-version validation and
    update coverage for every Blueprint kind, so that the shared rule is
    exercised through the public lifecycle.
19. As a Spindle maintainer, I want generated test fixtures to live in an
    ignored subdirectory of the test tree, so that test artifacts do not
    accumulate in the repository-root scratch area.

## Implementation Decisions

- Read SemVer only from `meta.spindle.version`. Require a valid SemVer value
  for all current and future versioned Blueprint kinds, using the existing
  shared validation and update behavior.
- Do not read, fall back to, or otherwise support a top-level `version`.
- Parse frontmatter with Gray-matter after rendering the complete entry file
  with Nunjucks and the normal resolved project context. Do this whether or
  not the version field itself contains Nunjucks syntax.
- Keep other frontmatter fields and metadata namespaces outside the ownership
  of version handling.
- Preserve existing version comparison, missing/invalid installed-version
  behavior, update policy, and the source-change guard between planning and
  installation.
- Preserve the existing explicit errors for undefined template variables.
  Prompts and non-interactive missing-input errors apply even when a Blueprint
  is ultimately up to date.
- Migrate shipped Blueprint source metadata and this repository's installed
  copies. The maintainer will reinstall local copies; backwards compatibility
  is not required.
- Record the shared metadata convention in the existing Blueprint lifecycle
  architecture decision.
- Store generated test fixtures in `tests/.generated/`, ignored by a
  test-directory ignore file.

## Testing Decisions

- Prefer tests of observable CLI behavior over tests coupled to helper
  implementation details.
- At the existing real-CLI integration seam, cover one representative update
  whose Nunjucks-rendered frontmatter supplies `meta.spindle.version`.
- At the same CLI seam, cover nested-version validation and update behavior
  for Skills, Agents, and Instructions, including relevant missing or invalid
  installed-version behavior.
- Verify that ordinary body rendering and source-change protection remain
  intact, and that undefined template variables fail explicitly during
  unconditional rendering.
- Remove redundant tests that differ only by frontmatter syntax permutation;
  retain meaningful external-behavior coverage rather than dropping
  frontmatter-template support.
- Reuse the existing Node test runner and real-CLI test helpers. Prior art
  includes the existing update, Agent, Instruction, and rendering integration
  suites.
- Confirm generated fixtures are created under the dedicated ignored test
  directory and cleaned up as appropriate.

## Out of Scope

- Reading top-level `version` for compatibility or migration fallback.
- Removing Nunjucks support from frontmatter or the Blueprint body.
- Changing Nunjucks rendering semantics outside the version-extraction flow.
- Changing SemVer comparison, update policies, or behavior for missing and
  invalid installed versions beyond reading the nested field.
- Adding a generic Spindle metadata parser or another abstraction for future
  metadata fields.

## Further Notes

- Full-entry rendering means body templates are evaluated during version
  planning, including for Blueprints that may be up to date. The existing
  resolved context, prompts, and errors therefore apply at that stage.
- The selected design and the lifecycle architecture decision document the
  metadata convention and rendering choice.
