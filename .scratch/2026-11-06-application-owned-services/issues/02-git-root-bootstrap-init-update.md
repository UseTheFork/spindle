# 02: Git-root bootstrap and Init/Update commands

Reporter: unknown
Category: enhancement

**What to build:** Init and Update run as application-managed command classes through a thin executable, targeting the Git working-tree root even when invoked from nested directories.

**Blocked by:** 01: Application construction and boot lifecycle.

**Status:** ready-for-agent
**Execution:** integrated

Corrective round 1 persisted before dispatch (1 of 5). Controller check finding F-01: `just test::test` and `just test::test tests/packaged-cli.test.ts` fail two packaged-workflow cases because fixtures invoke `setup-project` or `init` from non-Git directories after workspace commands began requiring Git-root discovery. Preserve the package behavior under test by invoking setup from a real temporary Git working tree while passing its distinct, non-Git explicit `--workspace` target, and by initializing the packaged Init project's own temporary Git repository. This corrects fixture assumptions without weakening mandatory root discovery.

Corrective round 2 persisted before dispatch (2 of 5). Task-review finding TR02-Q-01 is nonblocking but remains actionable: setup-project invalid-argument cases use their non-Git explicit target as process cwd, so mandatory discovery can satisfy the expected failure before parsing arguments. Controller ruling: use the already-valid temporary Git invocation workspace for all setup invalid cases while retaining explicit target arguments; assert stderr is not the Git-discovery failure so argument validation is actually reached.

- [X] Introduce application dispatch and a thin executable bootstrap without running CLI startup when application modules are imported.
- [X] Move Init and Update into separate command classes in their own folders, receiving the application through the shared base contract and resolving dependencies during boot.
- [X] Transfer command workflow ownership into the classes rather than retaining command-function compatibility wrappers; migrate affected imports and tests directly.
- [X] The executable may read the current directory only to seed Git working-tree root discovery; Init and Update use the application's immutable root for project paths.
- [X] Workspace-operation dispatch requires successful Git-root discovery, including while remaining commands await their class migration. Missing Git, unsuccessful discovery, and non-Git execution fail explicitly without current-directory fallback or workspace writes.
- [X] Help and version bypass Git discovery and remain usable outside Git and when Git is unavailable.
- [X] Resolve the Blueprint source root at the application boundary, preserving source overrides and packaged lookup behavior; command services use the immutable application-owned value.
- [X] Preserve Init/Update arguments, prompts, output, Config behavior, and reconciliation policies except for the agreed Git-root targeting change.
- [X] Keep existing shared installation and reconciliation workflows operational until their dedicated migrations, without creating obsolete command export adapters.
- [X] Migrate affected workspace CLI fixtures to real temporary Git working trees that cannot accidentally resolve to the surrounding repository; retain deliberately non-Git failure and informational fixtures.
- [X] Existing CLI integration tests verify equivalent root and nested-directory results, no unintended nested output, discovery failures, and informational exceptions.
- [X] Include directly related user documentation for mandatory Git discovery and nested-directory behavior, and run focused command tests and type checking through Just.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
