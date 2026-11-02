Category: enhancement
Status: ready-for-agent
Reporter: unknown

# 01: Generate and import Just Modules during `init`

**What to build:** As a project maintainer, I want `init` to generate
independently managed Just Modules from shared and selected Stack content and
make them available through the root `justfile`, so that projects receive
rendered tooling during setup.

**Blocked by:** None (can start immediately).

- [ ] Register Just Modules as a versionless Blueprint kind and migrate
      existing module sources into independently named module Blueprints with
      required shared entries and optional same-named Stack overlays.
- [ ] Validate module names; render shared and selected Stack contributions
      with Nunjucks; combine shared content first and Stack contributions in
      configured order with blank lines between them.
- [ ] During `init`, replace generated module outputs without conflict prompts,
      create a missing root `justfile` with required module imports, and reconcile
      imports in an existing file without replacing unrelated content.
- [ ] Add end-to-end CLI coverage for installation, rendering, Stack
      composition, Variable prompts/errors, and creation or preservation of the
      root `justfile`.
- [ ] Document the versionless Just Module exception and module composition
      decision; add the canonical Just Module term to the glossary.
- [ ] Migrate this repository's optional module imports to required imports.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
