# 03: Application-owned setup and SDD commands

Reporter: unknown
Category: enhancement

**What to build:** Project setup and SDD workflows use the same application-owned command architecture as Init and Update, without changing their explicit workspace arguments or existing results.

**Blocked by:** 02: Git-root bootstrap and Init/Update commands.

**Status:** ready-for-agent
**Execution:** integrated

The earlier regression blocker was the four additional agents already present in the checkout catalog. At the user's direction, the stale expected-agent lists and count were updated in `tests/stubs.test.ts` and `tests/catalog.test.ts`; no Blueprint source or catalog code was changed.

Corrective round 1 persisted before dispatch (1 of 5). Code-review finding REV-03-01: the test named “help and version work outside Git when Git is unavailable” uses `runCli`, whose helper initializes Git in the project directory before invoking the executable. Controller ruling: use `runCliRaw` for this informational-only test so the directory remains non-Git and `PATH` stays empty; retain assertions for all help/version commands, success, no stderr, nonempty output, and no filesystem writes.

- [X] Migrate all remaining existing commands, including project setup and SDD workflows, into application-managed classes in their own command folders.
- [X] Use the shared application constructor and asynchronous boot contract; resolve service dependencies during boot and perform command work after readiness.
- [X] Route these commands through application dispatch rather than retaining separate executable construction paths or command-function wrappers.
- [X] Remove ambient working-directory path discovery from migrated command code and its operational helpers; use application-owned roots where defaults are needed.
- [X] Preserve existing explicit workspace and report path argument semantics rather than replacing those paths with the bootstrap discovery root.
- [X] Preserve existing arguments, output shapes, errors, generated documentation, and report destination behavior except for mandatory CLI Git-root discovery.
- [X] Update affected production and test imports directly and remove replaced exports; retain pure utilities as focused standalone functions rather than manufacturing services.
- [X] Existing setup and SDD integration tests cover successful execution, explicit paths distinct from the invocation repository, and existing error cases using the confirmed CLI/workflow seams.
- [X] Verify these workspace commands obey bootstrap discovery failures and help behavior without introducing fallback paths.
- [X] Update directly related command documentation and validate focused tests and type checking through Just.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
