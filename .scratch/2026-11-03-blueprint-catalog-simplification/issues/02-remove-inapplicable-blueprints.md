# 02: Remove retired and Stack-inapplicable content

Reporter: unknown
Category: enhancement
Status: ready-for-agent

Source: [Feature specification](../spec.md)

**What to build:** Initialization and update delete complete installed targets
when their catalog entries are removed or no longer match selected Stacks,
including managed Just imports, with explicit reporting and safe ownership
boundaries.

**Blocked by:** 01: Install and update through the Blueprint Catalog.

- [ ] Both initialization and update delete targets for removed entries
      independently of their Stack filters, including when their sources no
      longer exist.
- [ ] Both commands delete targets for active entries with no matching selected
      Stack. Multi-Stack entries remain applicable when any selected Stack
      matches; empty Stack lists remain universally applicable.
- [ ] File entries delete only their target file; directory entries delete
      their complete target subtree, including local edits and nested additions.
- [ ] Deletions require no confirmation and are not suppressed by conflict-skip,
      version decisions, or new-content selection options. Already-absent
      targets are normal no-ops; repeated reconciliation remains reliable.
- [ ] Remove managed root imports for retired or Stack-inapplicable Just
      Modules while preserving unrelated root content and unlisted modules and
      imports.
- [ ] Catalog entries disappearing entirely do not cause inferred deletion.
      Changing an entry's path does not infer its old destination; an explicit
      old-path removal entry performs any requested cleanup. No installation
      inventory or compatibility migration is introduced.
- [ ] Validate deletion targets and ancestors, reject unsafe paths and
      symbolic-link traversal, and reject overlapping ownership before changes.
      Deletion never escapes the designated kind root or affects unrelated
      content.
- [ ] Report every actual removal explicitly. Deletion failures produce
      unsuccessful exit status and actionable diagnostics rather than
      success-shaped outcomes. Expose planned deletion work for coordinated
      preparation in ticket 04.
- [ ] Real CLI tests cover all kinds, both commands, edited targets, nested
      local additions, source-less records, absent targets, repeated runs, Stack
      transitions, multi-Stack matching, skip/new-content options, and Just
      import cleanup.
- [ ] CLI tests verify missing catalog entries and path renames preserve old
      targets unless an explicit removal entry exists. Unsafe-target tests
      verify no writes or deletions outside declared roots.
- [ ] Update directly related removal documentation and run focused tests and
      type checking through project Just recipes.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
