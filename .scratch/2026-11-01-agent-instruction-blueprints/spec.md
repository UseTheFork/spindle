Category: enhancement
Status: ready-for-agent
Reporter: unknown

# Add Agent and Instruction Blueprints

## Problem Statement

Spindle currently installs and updates Skills, but it does not manage Agents or Instructions through its Blueprint lifecycle. This leaves Agent content outside the normal install and update workflow, and prevents Spindle from consistently validating, rendering, versioning, and reporting these GitHub content kinds.

The existing lifecycle assumes each Blueprint installs as a directory. Agents and Instructions are single files, so they need to fit the shared lifecycle without losing its Stack overlay, conflict handling, version comparison, or safe-install behavior.

## Solution

Register Agent and Instruction as Blueprint kinds and extend the shared lifecycle to support a Blueprint directory whose one required entry file installs as a single file in the corresponding GitHub content directory. Preserve unified `init` and `update` workflows and make prompts, outcomes, and summaries identify the Blueprint kind.

Ship the existing `sdd-*` and `shared-*` Agents as versioned Agent Blueprints. Register the Instruction kind but ship no Instruction Blueprint content. Preserve Stack rendering and overlay behavior, and document the new authoring conventions for Spindle maintainers.

## User Stories

1. As a project maintainer, I want `init` to install every shipped Blueprint kind in one run, so that Agents are available alongside Skills without a separate setup command.
2. As a project maintainer, I want `update` to reconcile every registered Blueprint kind in one run, so that Agent updates follow the existing unified workflow.
3. As a Spindle maintainer, I want Agent and Instruction handlers in the static Blueprint registry, so that supported kinds are explicit and use the shared lifecycle.
4. As a Blueprint author, I want each Agent Blueprint to have its own source directory and one `AGENT.md` entry file, so that its source remains organized like existing directory-based Blueprints.
5. As a Blueprint author, I want each Instruction Blueprint to have its own source directory and one `INSTRUCTION.md` entry file, so that future Instructions follow the same authoring convention.
6. As a project maintainer, I want an Agent Blueprint installed as one `.agent.md` file in the Agents directory, so that VS Code can discover it in its expected format.
7. As a project maintainer, I want an Instruction Blueprint installed as one `.instructions.md` file in the Instructions directory, so that VS Code can discover it in its expected format.
8. As a Spindle maintainer, I want the lifecycle to map an Agent or Instruction Blueprint name to its kind-specific output filename, so that a single-file Blueprint does not create an extra directory.
9. As a Blueprint author, I want a single-file Blueprint to contain exactly its declared entry file after Stack selection, so that unexpected output files fail explicitly instead of being silently ignored.
10. As a project maintainer, I want an Agent or Instruction with no applicable entry file for my selected Stacks to be omitted, so that Stack-limited content is not installed when it does not apply.
11. As a Blueprint author, I want single-file Blueprints to support the existing shared files and selected Stack overlays, so that optional content can depend on project Stacks.
12. As a Blueprint author, I want duplicate paths across shared and selected overlay files to fail before replacement, so that an update cannot silently discard Blueprint content.
13. As a Blueprint author, I want Stack-specific variants of a single Agent or Instruction to use the established rendering and overlay rules, so that all kinds share consistent behavior.
14. As a Blueprint author, I want Nunjucks rendering and shared Variables to apply to Agent and Instruction text, so that their content can be tailored using the same project context as Skills.
15. As a Blueprint author, I want Markdown frontmatter rendered before it is parsed, so that templated metadata is validated from its final installed form.
16. As a Spindle maintainer, I want Agent and Instruction frontmatter versions validated as SemVer, so that update comparisons are reliable.
17. As a Blueprint author, I want the shipped version of an Agent or Instruction to determine whether an installed version is outdated, so that updates do not replace equal or newer installed content unnecessarily.
18. As a project maintainer, I want an installed Agent or Instruction with no valid SemVer version to be skipped with a warning during update, so that Spindle does not automatically overwrite content whose managed version is unknown.
19. As a Spindle maintainer, I want source-version parsing and templated-version handling shared among versioned Blueprint kinds, so that update rules remain consistent.
20. As a project maintainer, I want existing unversioned Agent files to retain the established skip-with-warning behavior, so that Spindle does not automatically adopt or overwrite unmanaged files.
21. As a Spindle maintainer, I want this repository's shipped Agent copies to carry version `1.0.0`, so that their existing tracked files are not treated as unversioned during updates.
22. As a Spindle maintainer, I want the shipped `sdd-*` and `shared-*` Agent files available as Agent Blueprints, so that Spindle can install and update them in other projects.
23. As a project maintainer, I want shipped Agents' Skill links to resolve within the installed GitHub content, so that following those references does not depend on Spindle's source tree.
24. As a Spindle maintainer, I want `ask.agent.md` to remain local-only, so that this Spindle-specific agent is not distributed as a Blueprint.
25. As a Spindle maintainer, I want `testing.instructions.md` to remain local-only and no Instruction content shipped yet, so that Spindle-specific test guidance is not installed into other projects.
26. As a Spindle maintainer, I want missing or empty kind source directories to be skipped when other kinds have Blueprints, so that registering an empty Instruction kind does not block installation.
27. As a Spindle maintainer, I want an explicit error when no registered kind contains any Blueprint, so that an empty Blueprint collection is not reported as a successful no-op.
28. As a project maintainer, I want overwrite and skip policies to apply to single-file destinations, so that existing-file conflicts behave consistently across kinds.
29. As a project maintainer, I want symlink checks to cover the actual single-file destination, so that installation does not write through a linked Agent or Instruction file.
30. As a project maintainer, I want prompts for existing, new, and outdated Blueprints to name their kind, so that same-named Skills, Agents, and Instructions are distinguishable.
31. As a project maintainer, I want initialization summaries to report installed counts by kind, so that I can tell what content was installed.
32. As a project maintainer, I want update summaries to report added, updated, skipped, and up-to-date counts by kind, so that the result of a multi-kind update is clear.
33. As a project maintainer, I want existing conflict policies, `--include-new`, and non-interactive behavior to apply consistently across kinds, so that adding Agents does not require learning a separate update interface.
34. As a Spindle maintainer, I want an empty Instruction kind omitted from successful summary counts, so that output reflects actual managed content.
35. As a Spindle maintainer, I want authoring guidance to explain Agent and Instruction Blueprint layouts and the single-entry-file rule, so that future Blueprints follow the supported contract.
36. As a Spindle maintainer, I want the local authoring guide to reflect the registered kinds and their metadata rules, so that this repository's maintainers use current instructions.
37. As a Spindle maintainer, I want the domain glossary to define Agent and Instruction, so that the project uses these terms consistently.
38. As a Spindle maintainer, I want the single-file installation choice recorded separately from the original lifecycle decision, so that future maintainers understand why these kinds flatten at installation.
39. As a Spindle maintainer, I want the existing Skill lifecycle behavior preserved while adding single-file kinds, so that common directory-based Blueprints continue to install and update as before.

## Implementation Decisions

- Keep a shared Blueprint lifecycle, static registry, and per-kind handlers. Add handler metadata for the entry file and kind-specific install target while retaining directory installation as the Skill behavior.
- Validate that single-file Blueprint plans contain only the declared entry file. Treat a plan with no selected entry file as unavailable for that Stack selection.
- Use the existing rendering and duplicate-output detection for shared and selected Stack-overlay files.
- Generalize version-reading and templated-version handling, and share the version-aware update planning behavior across Skills, Agents, and Instructions.
- Read a source version statically only when its frontmatter contains no Nunjucks syntax. If any frontmatter syntax is present, render the frontmatter with the resolved update context before reading the version. Do not use partial template or YAML dependency analysis to avoid rendering; unresolved Variables follow the normal render behavior (maintainer ruling, 2026-11-01).
- Require SemVer `version` in the rendered Agent or Instruction entry file. Skip installed files with missing or invalid SemVer and surface the existing warning behavior.
- Treat missing or empty Blueprint source directories as empty kinds. Skip empty kinds, but fail if all registered kinds have no Blueprints.
- Include the Blueprint kind in lifecycle outcomes. Make prompts and command summaries kind-aware, and use kind-agnostic discovery instead of Skill-specific discovery in the update workflow.
- Ship only the `sdd-*` and `shared-*` Agents, each with version `1.0.0`. Update their Skill references to point to installed Skills. Keep `ask.agent.md` and `testing.instructions.md` local-only.
- Keep the authoring guide local-only; update it, the glossary, and the separate ADR for single-file Blueprint installation.
- Preserve the existing behavior for unversioned installed Agents: skip with a warning rather than automatically adopting or overwriting them. Update the repository's tracked Agent copies to `1.0.0`.
- Do not add dependency tracking between Agents and the Skills they reference.
- Verify that the added Agent version frontmatter does not prevent VS Code from loading the Agents. If it does, revisit the versioning decision before shipping.

## Testing Decisions

- Use the existing CLI integration-test seam only. Tests should execute the public `init` and `update` commands against temporary Blueprint roots and assert observable files, output, warnings, prompts, and failures; do not test lifecycle implementation details through a new test-only interface.
- Cover single-file installation and overwrite for both kinds; required entry-file validation; Stack-overlay selection, omission, and collisions; empty or missing kinds; SemVer updates and unversioned-installed warnings; kind-aware prompts and summaries; and symlink protection at the actual file destination.
- Exercise the production Blueprint collection through the CLI to verify that all shipped Skills and Agents install for supported Stack selections, with the expected file names, rendered content, valid versions, and working relative Skill links.
- A good test proves the externally visible behavior at the CLI boundary, preserves existing Skill behavior, and verifies that a failure leaves installed content unchanged where replacement could otherwise occur.
- Follow the existing `node:test` and `node:assert/strict` CLI tests, which use temporary projects, fixture Blueprint roots, a stub `just` executable, and the real CLI runner. Prior art includes the initialization, update, existing-repository, reconciliation, and production-Blueprint tests.

## Out of Scope

- Shipping `ask.agent.md` or `testing.instructions.md`.
- Shipping Instruction content in this change.
- Managing `copilot-instructions.md` or other GitHub content kinds.
- Tracking or automatically installing Skills referenced by an Agent.
- Automatically adopting or overwriting installed Agents without valid SemVer versions.
- Changing the existing Skill directory layout or its rendering and update behavior.

## Further Notes

- The selected design and trade-offs are recorded in the feature design document. The single-file installation mapping is recorded in ADR 0002; ADR 0001 remains unchanged.
- The new `version` frontmatter field may be reported as unsupported by VS Code. Confirm that Agents still load; if not, stop and revisit the versioning decision before shipping.
- The Instruction handler must work with no shipped Instructions; absence of Instruction content is expected, not a setup error.
