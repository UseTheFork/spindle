Reporter: unknown
Category: enhancement
Status: ready-for-agent

# 02: Retire Just Modules as a Blueprint kind

**What to build:** Spindle manages only the remaining supported Blueprint kinds. A former `just` catalog entry is rejected through generic unknown-kind validation, and previously generated project files and imports remain untouched.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Remove Just Modules from catalog parsing and validation, lifecycle handlers, shipped Blueprint sources, and package assets.
- [ ] Keep generic unknown-kind validation with no Just-specific compatibility behavior or message.
- [ ] Remove Just-specific product tests and Just-only fixtures; preserve unrelated coverage and add no replacement tests.
- [ ] Update current user-facing documentation and applicable ADRs to remove Just-specific product guidance while preserving unrelated decisions.
- [ ] Leave existing project files and imports, and the repository's Just-based developer workflow, untouched.

## Comments
