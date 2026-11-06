# 07: Complete integration and packaged verification

Reporter: unknown
Category: enhancement

**What to build:** The complete refactor works consistently in source and packaged execution, with no remaining obsolete workflow APIs or ambient project-root discovery and with documentation matching the delivered architecture.

**Blocked by:** 03: Application-owned setup and SDD commands; 06: Application-owned Blueprint reconciliation.

**Status:** ready-for-agent

- [ ] Audit every existing CLI command and affected workflow for application-owned construction, correct boot use, immutable root usage, and import-safe application modules.
- [ ] Remove any remaining replaced workflow exports, compatibility adapters, stale imports, or obsolete executable wiring; migrate missed consumers directly rather than patching old APIs.
- [ ] Confirm only the executable bootstrap reads the current directory in production code, solely to seed Git-root discovery; explicit workspace arguments retain their established meaning.
- [ ] Confirm command classes occupy their own folders and pure helpers use focused utility files rather than a replacement catch-all module.
- [ ] Verify source and packaged CLI execution target the same Git root from root and nested directories, preserve Blueprint source lookup/overrides, and never write nested fallback project output.
- [ ] Verify workspace commands fail explicitly without successful Git discovery, while help and version work outside Git and with Git unavailable.
- [ ] Preserve all existing command options, prompts, output contracts, Blueprint lifecycle behavior, and Config semantics except for the agreed Git-root behavior change.
- [ ] Retain and complete public application API coverage for lifecycle, concurrency, failures, cycle diagnostics, fresh instances, and cross-application isolation.
- [ ] Verify repeated workflows through one application cannot reuse stale Config or computed contexts, including installation/reconciliation service reuse.
- [ ] Finish directly related user and developer documentation, including construction/boot rules, singleton versus per-run lifetimes, migration of internal APIs, and mandatory Git discovery.
- [ ] Run the complete existing test suite, type check, lint/format checks, and build through existing Just recipes; verify packaged execution against the freshly built artifact.
- [ ] Resolve regressions caused by the refactor without unrelated cleanup, new DI/testing frameworks, Config schema changes, or weakening existing tests.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
