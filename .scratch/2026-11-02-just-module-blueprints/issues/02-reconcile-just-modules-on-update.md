Category: enhancement
Status: ready-for-agent
Reporter: unknown

# 02: Reconcile Just Modules during `update`

**What to build:** As a project maintainer, I want `update` to regenerate
modules for the current Stacks, install newly shipped modules, and remove
obsolete outputs and imports, so that generated Just tooling stays aligned
with the current Spindle release and project configuration.

**Blocked by:** 01: Generate and import Just Modules during `init`.

- [ ] Regenerate every shipped Just Module during `update` without overwrite,
      skip, or new-Blueprint prompts; automatically install newly shipped modules.
- [ ] Rebuild each module from its shared entry and currently selected Stack
      contributions, removing contributions from Stacks no longer selected.
- [ ] Remove only obsolete direct `.just` files from the managed module
      directory; preserve nested directories and non-`.just` files.
- [ ] Reconcile required imports: remove imports for obsolete generated files,
      add missing imports, deduplicate identical declarations, and consolidate
      managed imports at the end in alphabetical module-name order.
- [ ] Preserve unrelated recipes, imports, comments, line endings, and
      final-newline style in the root `justfile`.
- [ ] Fail clearly when a shipped module name conflicts with an import of the
      same module name from another path, before generated modules are changed.
- [ ] Add end-to-end CLI tests for regeneration, newly shipped modules,
      deselected Stacks, obsolete module/import cleanup, deterministic imports,
      idempotency, and import conflicts.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
