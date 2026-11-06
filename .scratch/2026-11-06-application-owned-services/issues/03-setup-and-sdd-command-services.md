# 03: Application-owned setup and SDD commands

Reporter: unknown
Category: enhancement

**What to build:** Project setup and SDD workflows use the same application-owned command architecture as Init and Update, without changing their explicit workspace arguments or existing results.

**Blocked by:** 02: Git-root bootstrap and Init/Update commands.

**Status:** ready-for-agent

- [ ] Migrate all remaining existing commands, including project setup and SDD workflows, into application-managed classes in their own command folders.
- [ ] Use the shared application constructor and asynchronous boot contract; resolve service dependencies during boot and perform command work after readiness.
- [ ] Route these commands through application dispatch rather than retaining separate executable construction paths or command-function wrappers.
- [ ] Remove ambient working-directory path discovery from migrated command code and its operational helpers; use application-owned roots where defaults are needed.
- [ ] Preserve existing explicit workspace and report path argument semantics rather than replacing those paths with the bootstrap discovery root.
- [ ] Preserve existing arguments, output shapes, errors, generated documentation, and report destination behavior except for mandatory CLI Git-root discovery.
- [ ] Update affected production and test imports directly and remove replaced exports; retain pure utilities as focused standalone functions rather than manufacturing services.
- [ ] Existing setup and SDD integration tests cover successful execution, explicit paths distinct from the invocation repository, and existing error cases using the confirmed CLI/workflow seams.
- [ ] Verify these workspace commands obey bootstrap discovery failures and help behavior without introducing fallback paths.
- [ ] Update directly related command documentation and validate focused tests and type checking through Just.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
