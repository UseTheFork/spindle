# Agent and Instruction Blueprints

## Intent

Ship Agents (`.github/agents/<name>.agent.md`) and Instructions (`.github/instructions/<name>.instructions.md`) as Blueprint kinds, using the same lifecycle as Skills, as anticipated by [ADR 0001](../../docs/adr/0001-blueprint-lifecycle.md).

## Success criteria

- `init` installs the shipped Agents into `.github/agents/` alongside Skills; `update` detects newer shipped Agents and offers or applies them with the same new/conflict/outdated rules as Skills.
- The `sdd-*` and `shared-*` agents are shipped as Agent Blueprints and install as working files in a user's repo (no links into Spindle's `src/`).
- The Instruction kind is registered and fully functional, even though no Instruction content ships yet.
- CLI output and prompts name the kind, so an Agent and a Skill with the same name are distinguishable.

## Scope

In scope:

- Agent and Instruction handlers registered in `src/blueprints/registry.ts`.
- A lifecycle extension that installs a Blueprint directory as a single file.
- Migrating `sdd-code-reviewer`, `sdd-code-slop-reviewer`, `sdd-implementer`, `sdd-orchestrator`, `sdd-re-review`, `sdd-task-reviewer`, `shared-explore`, `shared-orchestrator`, `shared-r`, `shared-rw`, `shared-rwx` into `src/blueprints/agents/`.
- Kind-aware CLI messages and prompts; updates to `author-blueprint` guidance and the glossary.

Out of scope:

- `ask.agent.md` and `testing.instructions.md` stay repo-local (Spindle-specific).
- `copilot-instructions.md` and any other GitHub content kinds.
- Dependency tracking between Agents and the Skills they reference.

## Decisions

User decisions:

- **Shipped content:** only the `sdd-*` and `shared-*` agents.
- **Update detection:** a SemVer `version` in frontmatter, as with Skills.
- **Source layout:** approach B: one directory per Blueprint, flattened to one file on install.
- **Existing unversioned agents:** preserve the Skill behavior: updates skip them with a warning rather than automatically adopting or overwriting them. Add `1.0.0` to this repo's tracked agent copies as part of the migration.
- **Instruction scope:** register and support the Instruction kind, but ship no Instruction content yet. A kind with no Blueprints is skipped.
- **Entry file names:** `AGENT.md` and `INSTRUCTION.md`, mirroring `SKILL.md`.
- **Architecture record:** document the single-file install mapping in a new ADR 0002, keeping ADR 0001 unchanged.

## Considered approaches

| Approach | Summary | Trade-off |
| --- | --- | --- |
| A. Flat sources | `src/blueprints/agents/<name>.agent.md`; handler declares a file layout | Source matches installed shape, but per-Blueprint stack overlays are lost and discovery/safety need a second code path. |
| **B. Directory per source, flattened** (selected) | `src/blueprints/agents/<name>/AGENT.md`, installed to `.github/agents/<name>.agent.md` | Reuses discovery, overlays, and duplicate detection unchanged; source shape differs from installed shape. |
| C. Handler-owned discovery/install | Each handler implements listing and installation | Most flexible, but duplicates lifecycle code that ADR 0001 aims to share. |

## Selected direction

### Source layout

```
src/blueprints/agents/<name>/AGENT.md
src/blueprints/agents/<name>/stacks/<stack-id>/AGENT.md     (optional)
src/blueprints/instructions/<name>/INSTRUCTION.md
src/blueprints/instructions/<name>/stacks/<stack-id>/INSTRUCTION.md
```

Existing behavior carries over: Nunjucks rendering, `variables`/`stacks` context, and duplicate output paths (shared file plus a selected overlay, or two overlays) are errors. A stack-specific variant of the same Agent therefore uses a Nunjucks conditional in the shared `AGENT.md`; an overlay-only `AGENT.md` makes the Agent available only for that stack.

### Handler contract

`BlueprintHandler` gains an optional single-file mapping, for example:

- `entryFile`: the one allowed planned output path (`AGENT.md`, `INSTRUCTION.md`).
- `targetPath(destinationDirectory, name)`: the install target; defaults to `join(destinationDirectory, name)` (directory, as Skills do). Agents return `<name>.agent.md`, Instructions `<name>.instructions.md`.

When a handler defines `entryFile`, the lifecycle:

- Requires the planned file set for each Blueprint to be exactly `[entryFile]`; any other file is an error naming the Blueprint.
- Skips a Blueprint whose planned file set is empty for the selected stacks (overlay-only Blueprint, no matching stack); it is not installed and not reported as new.
- Writes the rendered entry file directly to `targetPath`, uses `targetPath` for existence checks, overwrite removal, and symlink safety checks.

### Metadata and versioning

- `validateMetadata` for each kind requires a valid SemVer `version` in the rendered entry file's frontmatter, like Skills.
- Generalize `readSkillVersion` / `skillVersionIsTemplated` in `src/version.ts` to entry-file-agnostic names, and extract the Skill `planUpdate` into a shared versioned-update helper parameterized by entry file and installed target. All three handlers use it.
- Installed files with a missing or non-SemVer `version` are skipped with a warning, as Skills are.
- This repo's pre-existing agent files are migrated with `version: 1.0.0` and updated references, so they are not left in the unversioned state that causes update to skip them.

### Empty kinds

A missing or empty kind source directory means that kind has no Blueprints and is skipped. The existing "No ... Blueprints are available" error is raised only when no kind has any Blueprint.

### CLI output and prompts

- `BlueprintOutcome` carries the handler `kind`.
- `init`/`update` summaries are reported per kind (for example, "Installed 30 skill(s), 11 agent(s)") and conflict/new/outdated prompts name the kind.
- `update.ts` currently calls `listSkillBlueprints`; replace it with kind-agnostic discovery.
- Help text for `--on-conflict` and `--include-new` refers to Blueprints generally.

### Agent migration

- Move each `sdd-*` and `shared-*` agent into `src/blueprints/agents/<name>/AGENT.md`, add `version: 1.0.0`, and keep the remaining frontmatter.
- Rewrite links from `../../src/blueprints/skills/<skill>/SKILL.md` to `../skills/<skill>/SKILL.md` so they resolve from `.github/agents/`.
- Wrap any literal Nunjucks-looking text in `{% raw %}`.
- After migration, this repo's `.github/agents/` copies are produced by running Spindle, not edited by hand; `ask.agent.md` remains hand-maintained.

### Documentation

- Update the repo-local `.github/skills/author-blueprint/SKILL.md` with the Agent and Instruction source layout, entry files, and the single-file rule.
- Update `GLOSSARY.md` with **Agent** and **Instruction** terms, matching the existing **Skill** entry.
- Record the single-file install mapping in [ADR 0002](../../docs/adr/0002-single-file-blueprints.md).

## Assumptions and implementation details

- VS Code may flag `version` as an unsupported frontmatter attribute in `.agent.md` / `.instructions.md`; implementation verifies the agents still load. If they do not, revisit the versioning decision before shipping.
- Shipped Agents reference Skills by relative path and by name; installation does not verify that the referenced Skills are installed.
- The `sdd-*` agents use repo-local `just` recipes indirectly through skills; their content is not otherwise Stack-specific today.
- Exact helper names and the summary wording are left to implementation.
- Tests cover: single-file install and overwrite for both kinds, the exactly-one-entry-file error, overlay-only skipping, empty-kind skipping, version-based update planning for Agents, and kind-aware outcomes.
