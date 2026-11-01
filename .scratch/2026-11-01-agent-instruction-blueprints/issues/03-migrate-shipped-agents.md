# 03: Migrating the Remaining Shipped Agents

Category: enhancement
Status: ready-for-agent
Reporter: unknown

**What to build:** Ship the remaining `sdd-*` and `shared-*` Agents as versioned Agent Blueprints, so they can be installed and maintained by Spindle without depending on paths inside Spindle's source tree.

**Blocked by:** 01: Installing and Updating an Agent Blueprint.

- [ ] Migrate the six `sdd-*` Agents and the remaining `shared-*` Agents, excluding `shared-r` already shipped by ticket 01.
- [ ] Each migrated Agent has valid frontmatter including `version: 1.0.0`, and retains its supported Agent metadata and content.
- [ ] Rewrite Skill references to point to installed Skills, and ensure literal Nunjucks-looking content survives rendering.
- [ ] Update this repository's tracked Agent copies to match the shipped content and version, so they are not treated as unversioned installed files.
- [ ] Keep `ask.agent.md` local-only and do not ship Instruction content.
- [ ] CLI integration tests verify all production Agents install with expected filenames, rendered content, valid versions, and working relative Skill links for supported Stack selections.
- [ ] Verify the migrated Agent files are still loadable by VS Code.

## Comments

