Reporter: unknown
Category: enhancement
Status: ready-for-agent

# 01: Remove the Just CLI prerequisite

**What to build:** Spindle users can run CLI commands without installing Just. Spindle no longer checks for the executable or directs users to install it.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Remove the Just executable prerequisite and its installation guidance.
- [ ] Remove Just-specific prerequisite tests while preserving unrelated CLI coverage; do not add replacement tests.
- [ ] Leave the repository's Just-based developer workflow unchanged.

## Comments
