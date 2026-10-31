Category: enhancement
Status: ready-for-agent
Reporter: unknown

# Manage GitHub content through Blueprints

## Problem Statement

Spindle currently organizes its shipped content and reconciliation workflow around Skills alone. The project is expected to manage other kinds of GitHub content, such as Instructions and Agents, and Blueprint content needs to vary by selected Stack. Without a shared architecture, each new kind risks duplicating configuration, rendering, file handling, and CLI workflow while making related code harder to locate.

## Solution

Manage shipped GitHub content as Blueprints through a shared lifecycle engine and a static TypeScript registry. Keep a handler and its Markdown Blueprints together for each supported kind, and keep common lifecycle behavior in the shared engine. Keep `init` and `update` as unified user workflows, initially registering Skills only.

Blueprints can combine shared files with optional Stack-specific files. Nunjucks rendering and shared Variables are the normal way to tailor content; Stack overlays are available for the less common case where whole files should only exist for selected Stacks. Use `gray-matter` for all frontmatter parsing, after Nunjucks renders the Markdown. This is a new direction; backwards compatibility with the current internal source layout or parsing implementation is not required.

## User Stories

1. As a Spindle maintainer, I want shipped content represented by the domain term Blueprint, so that Skills and future kinds of managed GitHub content fit one model.
2. As a Spindle maintainer, I want a shared Blueprint lifecycle engine, so that common discovery, rendering, file handling, and installation behavior is implemented once.
3. As a Spindle maintainer, I want a static TypeScript registry of supported Blueprint kinds, so that the CLI has one explicit, type-safe inventory of what it manages.
4. As a Spindle maintainer, I want each Blueprint kind's handler kept with that kind's Markdown Blueprints, so that its contract and content are easy to find together.
5. As a Spindle maintainer, I want the shared lifecycle engine kept separate from kind-specific handlers, so that common behavior stays local while kinds can express genuinely different rules.
6. As a project maintainer, I want `spindle init` to manage every kind registered by Spindle, so that initial setup remains one coherent workflow.
7. As a project maintainer, I want `spindle update` to manage every kind registered by Spindle, so that I do not need a separate command for each kind.
8. As a Spindle maintainer, I want the initial registry to contain Skills only, so that the architecture is ready to grow without shipping placeholder kinds.
9. As a Spindle maintainer, I want future kinds such as Instructions and Agents to be addable through their own handler and Blueprints, so that new content kinds can define distinct rules without duplicating common lifecycle behavior.
10. As a project maintainer, I want `.github/spindle.json` to continue recording selected Stacks and user-supplied Variable values, so that the project has one shared Config for all Blueprint kinds.
11. As a Spindle maintainer, I want validated Config passed explicitly to lifecycle modules, so that every kind sees the same choices without relying on mutable process-global state.
12. As a Spindle maintainer, I want shared Variable names and definitions declared in typed TypeScript, so that all Blueprint kinds use one validated Variable namespace without a JSON definition manifest.
13. As a project maintainer, I want one Variable name to resolve to one value across all selected Stacks and Blueprint kinds, so that shared Config has consistent meaning.
14. As a Blueprint author, I want Blueprints to use shared Variable values in any rendered text file, including nested Markdown files, so that content can be tailored without duplicating configuration.
15. As a Blueprint author, I want ordinary shared guidance to remain unconditional and Stack-specific passages to use Nunjucks conditionals, so that one Markdown file can cover common cases clearly.
16. As a Blueprint author, I want Nunjucks conditions to test the selected Stacks, so that multiple matching Stack sections can be included in the same rendered Blueprint.
17. As a Blueprint author, I want Markdown frontmatter to remain alongside the Markdown content, so that metadata has one source of truth with the Blueprint.
18. As a Blueprint author, I want Nunjucks expressions and conditions to work in frontmatter as well as the Markdown body, so that rendered metadata can reflect shared Variables and selected Stacks.
19. As a Spindle maintainer, I want all frontmatter parsing to use `gray-matter`, so that frontmatter behavior is consistent throughout the project and does not rely on custom parsing.
20. As a Spindle maintainer, I want Markdown rendered with Nunjucks before its frontmatter is parsed, so that templated metadata is interpreted from its final rendered form without monkey patching.
21. As a Spindle maintainer, I want each Blueprint kind's handler to declare its source, destination, and frontmatter or lifecycle rules, so that the shared engine can apply common behavior without assuming every kind has Skill semantics.
22. As a Skill maintainer, I want Skills to retain their version-aware update behavior, so that newer shipped Skills can be adopted without replacing current or newer installed versions unnecessarily.
23. As a Blueprint author, I want files at the Blueprint root to be shared across selected Stacks, so that common content is authored once.
24. As a Blueprint author, I want to place optional whole files under a Stack-specific overlay, so that files are included only when that Stack is selected.
25. As a Blueprint author, I want shared Markdown content to be the normal place for Stack-specific variation, so that whole-file overlays remain an escape hatch for genuinely optional or substantially different files.
26. As a project maintainer, I want files from all selected Stack overlays included alongside shared files, so that selecting multiple Stacks produces a combined Blueprint.
27. As a Spindle maintainer, I want files from unselected Stack overlays omitted, so that a project's generated content reflects only its selected Stacks.
28. As a Spindle maintainer, I want all source files mapped to output paths before applying a Blueprint, so that duplicate output paths can be detected rather than silently overwritten.
29. As a Blueprint author, I want duplicate output paths across shared files and selected overlays, or across multiple selected overlays, to produce an explicit error, so that source collisions cannot silently discard content.
30. As a Spindle maintainer, I want the test suite to cover duplicate output path errors, so that overlay collision behavior is verified in routine validation and can later be enforced by CI.
31. As a Spindle maintainer, I want Skills with nested directories and multiple Markdown files to be rendered recursively, so that their complete content is managed as a Blueprint.
32. As a project maintainer, I want non-renderable binary files to retain their bytes during installation, so that shared lifecycle behavior does not corrupt assets.
33. As a Spindle maintainer, I want no backwards-compatibility layer for the replaced internal Blueprint layout or custom frontmatter parser, so that implementation can follow the agreed architecture directly.

## Implementation Decisions

- Replace the Skill-only source concept with Blueprints and organize the implementation around the Blueprint concept rather than adding broad Laravel-style domain/service layers.
- Use a shared lifecycle engine, a static TypeScript registry, and a handler per Blueprint kind. The handler declares kind-specific source, destination, and metadata/lifecycle rules; common workflow stays in the engine.
- Keep each kind's handler and Markdown Blueprints together. Keep the shared lifecycle engine and shared Config handling separate from the kind-specific content.
- Preserve unified `init` and `update` commands. Start with the Skill kind only; add Instructions, Agents, and other kinds when their Blueprints and behavior are ready.
- Keep `.github/spindle.json` as the project's Config containing selected Stacks and user-provided Variable values. Load Variable definitions from typed TypeScript and pass a resolved Config to the relevant modules rather than using mutable global state.
- Use one shared Variable namespace across all Blueprint kinds. A Variable name has one value even when multiple Stacks are selected; distinct names represent distinct values.
- Keep frontmatter in Markdown. Render Markdown with Nunjucks first, then parse the rendered document with `gray-matter`. Use `gray-matter` for all frontmatter parsing, and let each kind validate and interpret its own metadata.
- Use Nunjucks Stack conditionals for the normal case of Stack-specific text. Support optional whole files under Stack-specific overlay directories in addition to shared files.
- Combine shared files with all selected Stack overlays. Omit unselected overlays. Detect any duplicate relative output path across shared and selected overlay sources and fail explicitly; do not silently prioritize a source.
- Do not add a backwards-compatibility layer for the old internal source layout or frontmatter parser.

## Testing Decisions

- Test observable behavior through the agreed highest-level seam: CLI-level `init` and `update` runs using fixture Blueprints and temporary consumer projects. Tests should exercise the registered handler and shared lifecycle as users experience them rather than assert internal helper structure.
- Cover rendering of nested Markdown and other supported text files, Nunjucks conditions using selected Stacks, shared Variable interpolation, templated frontmatter parsed after rendering, and omission/inclusion of Stack overlays.
- Cover collisions across a shared file and selected overlay, and between multiple selected overlays. Assert a clear failure and no silent overwrite.
- Cover the unified `init`/`update` workflows and Skill-specific version rules, including relevant existing conflict, skip, and update behavior.
- Cover preservation of binary and non-renderable files through the shared installation workflow.
- Tests should assert generated files, Config, CLI exit status, and actionable error messages; avoid coupling tests to registry internals unless needed to verify public behavior.
- Use the existing built-in `node:test` runner, `node:assert/strict`, and `tsx`-based CLI test harness. Existing CLI test patterns are in `init.test.ts` and `update.test.ts`; recursive rendering and file-byte behavior are covered in `install.test.ts`; Skill lifecycle behavior is covered in `reconciliation.test.ts`.
- Include the collision checks in the normal test suite. No CI workflow exists yet; future CI is expected to run the test suite.

## Out of Scope

- Implementing Instructions, Agents, or other Blueprint kinds in this initial change; the registry begins with Skills only.
- Introducing independent CLI commands for each Blueprint kind.
- Replacing `.github/spindle.json` with a different consumer Config format.
- Adding per-kind Variable namespaces or separate Variable values per Stack.
- Adding a separate exclusion manifest for shared files. Whole-file optionality is handled by Stack overlays; ordinary content variation uses Nunjucks.
- Adding a CI workflow as part of this spec.
- Maintaining compatibility with the prior internal source layout or custom frontmatter parser.

## Further Notes

- The current source organization and reconciliation workflow are Skill-centric. The implementation should migrate to the new organization rather than preserve an adapter for the old internal layout.
- The repository currently has `gray-matter` as a dependency, and the Skill version reader currently uses custom frontmatter extraction; the new implementation should use `gray-matter` for that behavior as well.
- There is no existing CI workflow. Collision validation belongs in the test suite now, with future CI expected to run that suite.
- No migration or backwards compatibility is required for this architectural change.
