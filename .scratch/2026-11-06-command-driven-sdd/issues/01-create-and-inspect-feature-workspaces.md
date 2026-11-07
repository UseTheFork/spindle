# 01: Create and inspect feature workspaces

Reporter: User
Category: enhancement

**What to build:** A maintainer can create a uniquely numbered feature workspace
with its initial spec and durable ledger, then inspect its recorded policy and
progress through the public CLI without modifying it.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `sdd create` requires named title/author inputs and creates the initial spec, issue/report directories, and exactly one versioned `sdd.json` ledger without overwriting existing content.
- [ ] Feature names use a zero-padded repository-wide numeric ID and descriptive slug, without dates. Allocation chooses above the highest matching directory, ignores unrelated/historical dated entries, and uses a temporary lock covering scan and creation.
- [ ] Concurrent creation produces distinct IDs; no permanent allocator, cross-worktree allocator, deletion registry, or migration is introduced. Worktrees retain existing feature identities.
- [ ] Creation records the built-in policy version and actual issue/delivery review requirements with one comprehensive default reviewer. `--require-retrospective` records true; omission records false. Reloading does not silently replace stored policy with current defaults.
- [ ] `status --spec` returns structured feature state without mutation. There is no implicit active feature, selectable review profile, or separate initialization command.
- [ ] Commands follow application-owned service/root patterns, keep mutable operation data local, and validate schema/version/path inputs explicitly. New commands reject legacy workspace layouts rather than silently migrating them.
- [ ] Ledger mutation validates first, uses short-lived locks and atomic replacement, and preserves meaningful history. Failed creation or interrupted writes have explicit recoverable outcomes.
- [ ] Public CLI tests assert exact result shapes, help, named-option validation, explicit spec selection across features, creation defaults, concurrent allocation, applicable containment/symlink/ignored-target safety, and read-only inspection.
- [ ] Related CLI guidance describes the delivered behavior; validation uses project Just recipes. No agents, checks, or Git mutations are executed automatically.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
