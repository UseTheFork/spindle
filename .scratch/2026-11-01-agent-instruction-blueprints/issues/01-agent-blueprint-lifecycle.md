# 01: Installing and Updating an Agent Blueprint

Category: enhancement
Status: ready-for-agent
Reporter: unknown

**What to build:** Make a versioned Agent Blueprint install and update end to end through Spindle's existing CLI, while preserving the Skill workflow. Ship `shared-r` as the first Agent vertical slice and establish the shared single-file lifecycle behavior needed by later Agents and Instructions.

**Blocked by:** None (can start immediately).

- [ ] `init` installs the Agent entry file directly into the Agents directory using its Agent filename, and its user-facing result identifies the Agent kind.
- [ ] Agent Blueprints support the declared `AGENT.md` entry file and selected Stack overlays; reject unexpected planned files and duplicate outputs before changing installed content.
- [ ] An Agent with no entry file for the selected Stacks is omitted. Missing or empty kinds are skipped when other kinds have Blueprints; fail clearly if every registered kind is empty.
- [ ] The actual Agent destination is checked for conflicts and symlinks. Existing conflict policies apply to single-file destinations.
- [ ] Agent frontmatter requires a rendered SemVer version. `update` detects newer versions, leaves equal or newer installed versions unchanged, and skips installed files with missing or invalid versions with a warning.
- [ ] Generalized version handling preserves current Skill update behavior, including templated versions and warnings.
- [ ] New-Blueprint selection, conflict/outdated prompts, outcomes, summaries, and CLI help identify kinds and work for both Skills and Agents.
- [ ] Ship `shared-r` with version `1.0.0`; its installed content is valid Agent Markdown.
- [ ] Preserve the behavior that installed unversioned Agent files are skipped with a warning rather than automatically adopted or overwritten.
- [ ] Update the local authoring guide with Agent Blueprint authoring rules; define Agent and Instruction in the glossary and record the single-file lifecycle choice in ADR 0002.
- [ ] CLI integration tests cover Agent installation, update/version cases, conflicts, overlay behavior, kind-aware output, and preservation of existing Skill behavior.

## Comments

