# 03: Reconcile authoritative directory membership

Reporter: unknown
Category: enhancement
Status: ready-for-agent

Source: [Feature specification](../spec.md)

**What to build:** Catalog-selected directories own installed membership:
destination-only files disappear even when updates are current or skipped,
while surviving content retains its existing version and conflict rules.

**Blocked by:** 01: Install and update through the Blueprint Catalog.

- [ ] Initialization and update compare matching selected source directories
      with their installed subtrees and delete every destination-only file,
      including nested local additions and previously shipped files.
- [ ] Cleanup runs for current Skills and Skills whose updates are skipped;
      version checks, conflict-skip decisions, and new-content choices do not
      suppress removal of destination-only files in an installed selected tree.
- [ ] Cleanup does not itself overwrite surviving files or install source-only
      files. Agent/Instruction version and new-content decisions remain per file;
      Skill additions and changes still require a whole-Skill version update.
- [ ] A new supporting file is withheld from a current Skill without a version
      bump, but is installed by an accepted qualifying Skill update.
- [ ] Grouped Agents and Instructions independently produce updated, current,
      skipped, unknown-version, and new-file outcomes while destination-only
      files are cleaned up.
- [ ] File selections do not authorize cleanup of neighboring files; directory
      cleanup stays inside the selected subtree. Preserve unrelated content
      outside catalog-owned targets.
- [ ] Reuse catalog ownership validation and reject symbolic-link traversal and
      unsafe cleanup targets before changes. No installed-content tracking
      database is introduced.
- [ ] Report actual cleanup removals and surface failures explicitly. Expose
      planned cleanup work for coordinated preparation in ticket 04.
- [ ] Real CLI tests assert exact filesystem membership and surviving bytes
      after upstream file disappearance, local additions, current/skipped Skill
      cleanup, grouped file updates, and repeated runs. Test nested paths and
      ordinary internally named Stack directories.
- [ ] CLI tests prove unrelated neighboring content is retained and unsafe
      cleanup targets cannot cause deletion outside the selected subtree.
- [ ] Update directly related ownership/versioning documentation and run
      focused tests and type checking through project Just recipes.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
