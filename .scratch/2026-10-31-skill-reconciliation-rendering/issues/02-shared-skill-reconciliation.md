# 02: Consolidate init and update Skill reconciliation

**What to build:** As a Spindle maintainer, I want `init` and `update` to share a Skill reconciliation workflow, so that installation behavior is consistent and outcomes can be tested without relying only on full CLI runs.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `init` and `update` use a shared reconciliation workflow while retaining CLI-owned prompts and output.
- [ ] `init` considers all shipped Stubs, treats existing Skill directories as conflicts, supports per-Skill overwrite or skip, removes stale files when overwriting, and writes Config even when every Skill is skipped.
- [ ] `update` considers installed Skills, replaces only those with a strictly older version when overwrite is selected, leaves equal or newer versions unchanged, and warns and skips missing or invalid installed versions.
- [ ] An invalid shipped Stub version fails explicitly; current conflict-policy requirements for non-interactive outdated-Skill updates remain intact.
- [ ] Existing symlink path-safety checks remain effective before filesystem changes.
- [ ] The workflow returns per-Skill outcomes; tests at its interface cover reconciliation results, while CLI tests continue to cover user-visible behavior and summaries.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
