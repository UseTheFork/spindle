---
name: author-blueprint
description: Author or revise a shipped Blueprint in this repository.
disable-model-invocation: true
user-invocable: true
---

# Authoring Blueprints

Create and update reusable content shipped from `src/blueprints/`. Start by identifying the Blueprint kind and its actual handler; the registered kind determines where its sources live and what metadata is required.

## Process

1. **Inspect the kind.** Read `docs/adr/0001-blueprint-lifecycle.md`, `docs/adr/0002-single-file-blueprints.md`, the relevant handler and a sibling Blueprint. For rendering and file selection, check `src/install.ts`, `src/render.ts`, and `src/variables.ts`. Confirm the source path, generated destination, metadata validation, available stack IDs, and declared Variables against the current code. **Complete when** the kind's authoring contract is clear. Skills, Agents, and Instructions are registered; a new kind needs handler and registry integration, not just a new source folder.

2. **Author the shared content.** For a Skill Blueprint, create or update `src/blueprints/skills/<skill-id>/SKILL.md`. For an Agent Blueprint, use `src/blueprints/agents/<agent-id>/AGENT.md`; it installs directly as `.github/agents/<agent-id>.agent.md`, not as a directory. For an Instruction Blueprint, use `src/blueprints/instructions/<instruction-id>/INSTRUCTION.md`; it installs directly as `.github/instructions/<instruction-id>.instructions.md`. Keep the entry valid for its kind and include YAML frontmatter with a SemVer `meta.spindle.version` (for example `1.0.0`) plus the kind's fields: `name` and `description` for Skills and Agents; `description` and an `applyTo` glob for Instructions. Each handler validates the rendered version. Bump the version when shipping an update: `update` replaces an installed Blueprint only when the shipped version is newer. An installed file with a missing or invalid version is skipped with a warning. **Complete when** the shared Blueprint is self-contained and its metadata meets the handler's rules.

3. **Template only real variation.** Nunjucks renders recognized UTF-8 text files before installation. Its context exposes selected stack IDs as `stacks` and configured shared values as `variables`; use `{{ variables.owner }}` for a declared value and `{% if 'typescript' in stacks %}...{% endif %}` for stack-specific text. Undefined values are errors, and autoescaping is off. Wrap Nunjucks-looking text meant for the installed content in `{% raw %}...{% endraw %}`. **Complete when** every template reference resolves from the real context and intended literal placeholders survive rendering.

4. **Choose overlays deliberately.** Put stack-only files under `stacks/<supported-stack-id>/`; their paths are installed relative to that overlay, alongside shared files. Selected overlays are combined, and duplicate output paths fail rather than override one another—including collisions between a shared file and an overlay, or between two selected stacks. A selected Agent or Instruction plan must contain exactly its entry file (`AGENT.md` or `INSTRUCTION.md`) and no supporting files. An overlay-only Agent or Instruction with no selected entry is omitted; two selected entries or a shared entry plus an overlay entry collide. Use a Nunjucks conditional in a shared entry for content variants at the same path. **Complete when** every relevant stack selection has unique output paths and receives the intended shared and stack-specific content.

5. **Verify the shipped result.** Check frontmatter and Nunjucks output after rendering, all referenced Variables against `src/variables.ts`, and stack IDs against `supportedStacks` in `src/install.ts`. For tooling or handler changes, use the relevant `just` recipes and focused tests. **Complete when** metadata is valid after rendering, no template markers are unintentionally left unresolved, and the final file set is correct for each affected stack selection.

Example Skill source:

```markdown
---
name: deploy-checks
description: Run the team's deployment checks.
meta:
  spindle:
    version: 1.0.0
---

Owner: {{ variables.owner }}
{% if 'typescript' in stacks %}Run the TypeScript checks.{% endif %}
{% raw %}Preserve `{{ installed_tool.placeholder }}` literally.{% endraw %}
```

## Common mistakes

- Treating a stack overlay as an override; output-path duplicates are errors.
- Inventing a Variable or stack ID; only registered values are available.
- Forgetting Nunjucks also processes ordinary recognized text files, not only `.njk` files.
- Leaving template syntax in content intended to be literal; use a Nunjucks `raw` block.
- Adding a second output to an Agent or Instruction, or expecting an overlay to replace its shared entry.
- Linking an Agent to Spindle's source tree instead of using an installed Skill path such as `../skills/<skill-id>/SKILL.md`.
