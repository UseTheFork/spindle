# 02: Git-root bootstrap and Init/Update commands

Reporter: unknown
Category: enhancement

**What to build:** Init and Update run as application-managed command classes through a thin executable, targeting the Git working-tree root even when invoked from nested directories.

**Blocked by:** 01: Application construction and boot lifecycle.

**Status:** ready-for-agent

- [ ] Introduce application dispatch and a thin executable bootstrap without running CLI startup when application modules are imported.
- [ ] Move Init and Update into separate command classes in their own folders, receiving the application through the shared base contract and resolving dependencies during boot.
- [ ] Transfer command workflow ownership into the classes rather than retaining command-function compatibility wrappers; migrate affected imports and tests directly.
- [ ] The executable may read the current directory only to seed Git working-tree root discovery; Init and Update use the application's immutable root for project paths.
- [ ] Workspace-operation dispatch requires successful Git-root discovery, including while remaining commands await their class migration. Missing Git, unsuccessful discovery, and non-Git execution fail explicitly without current-directory fallback or workspace writes.
- [ ] Help and version bypass Git discovery and remain usable outside Git and when Git is unavailable.
- [ ] Resolve the Blueprint source root at the application boundary, preserving source overrides and packaged lookup behavior; command services use the immutable application-owned value.
- [ ] Preserve Init/Update arguments, prompts, output, Config behavior, and reconciliation policies except for the agreed Git-root targeting change.
- [ ] Keep existing shared installation and reconciliation workflows operational until their dedicated migrations, without creating obsolete command export adapters.
- [ ] Migrate affected workspace CLI fixtures to real temporary Git working trees that cannot accidentally resolve to the surrounding repository; retain deliberately non-Git failure and informational fixtures.
- [ ] Existing CLI integration tests verify equivalent root and nested-directory results, no unintended nested output, discovery failures, and informational exceptions.
- [ ] Include directly related user documentation for mandatory Git discovery and nested-directory behavior, and run focused command tests and type checking through Just.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
