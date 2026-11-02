# Ticket 02 implementation report

**Status: DONE_WITH_CONCERNS**

## Snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `6a0024a103c343676a37ef41b646d3c0deb3619b`
- Final revision: `6a0024a103c343676a37ef41b646d3c0deb3619b` (no commit authorized or created)
- The worktree was clean before the controller's ticket-state edit. At dispatch, `.scratch/2026-11-02-cli-workflow-domains/issues/02-setup-project-command.md` was already modified by the controller; it remains untouched by this implementer.
- Exact tested snapshot: the unchanged starting HEAD plus this report's implementation/test changes, the controller-owned ticket-state edit, and no other pre-existing changes. The final focused run occurred after the last source/template edit.

## Implementation and evidence

- Added `src/setup-project/setup.ts` as a typed domain function. It accepts a typed workspace input and returns ordered `workspace`, `created`, and `preserved` values. It creates no output and parses no process arguments. It resolves the four feature-owned templates relative to the module.
- Added `spindle setup-project --workspace ...` dispatch, command help, top-level discovery, strict argument validation and JSON output in `src/index.ts`. The existing global `requireJust()` remains before dispatch.
- Preserved directory/file ordering, byte-for-byte custom-file preservation, idempotency, symlink rejection (including dangling file links), conflict errors and the existing partial-setup model. The public CLI tests also verify missing/relative/nonexistent workspaces, malformed and nested arguments, empty stdout on errors, non-Git operation, and operation without `.github`/prior init.
- Moved the four Blueprint defaults to `src/setup-project/templates/` and added the build asset-copy step to `package.json`. Verified the migrated assets against their Blueprint source; the issue-tracker default retains its content while invoking `spindle sdd workspace` directly.
- Ported the CJS setup cases to `tests/setup-project.test.ts`; extended `tests/just-prerequisite.test.ts` for setup command and help. Removed the superseded setup CJS files and Just module/import. Left `.github/scripts/utils/common.cjs` intact for ticket 03.
- Updated both setup Skill copies to invoke Spindle directly, describe CLI-bundled defaults without package-internal asset references, and use Blueprint version `1.1.0`. Removed duplicate Skill template files. Updated `docs/agents/tooling.md` to document direct Spindle workflows and current Just commands. The existing `docs/agents/issue-tracker.md` already used the direct SDD command and was not changed.

Behavior changes followed RED → GREEN: the first focused run failed as expected because setup-project was not yet routed. During expanded coverage, tests caught an incorrect no-argument help response and an expectation that overlooked fixture-created directories; both were corrected. The final fresh focused run:

```text
just test::test tests/setup-project.test.ts tests/just-prerequisite.test.ts
17 tests, 17 passed, 0 failed
```

## Changed files

- Added: `src/setup-project/setup.ts`, four files under `src/setup-project/templates/`, `tests/setup-project.test.ts`, and this report.
- Updated: `src/index.ts`, `package.json`, `tests/just-prerequisite.test.ts`, both setup-project Skill files, `docs/agents/tooling.md`, and root `justfile`.
- Removed: the old setup CJS implementation/test/Just module and the four duplicate templates from both the local installed Skill and Blueprint.
- Preserved: the controller-owned ticket edit and all ticket 01 work.

## Self-review and pending checks

- No additional source-level issues found in self-review. The public subprocess seam asserts exact JSON output/order, default bytes, and nonzero/empty-stdout failures.
- Concern: the registered `tool::pnpm` recipe changes into `packages/orchestration`, which is absent in this checkout; there is no usable build recipe in the current Just inventory. `docs/agents/tooling.md` records this rather than advertising it as a valid command.
- Not run by this implementer, as assigned to the controller: formatting, lint, type checks, ticket-wide regressions, and build/package checks. Source and built/package execution therefore remain for the controller's mechanical gate.
- No dependencies were installed and no shared CJS utility was removed.

## Hand-back

Focused setup-project and global Just-prerequisite checks pass on the reported snapshot. The implementation is uncommitted in the existing checkout; controller mechanical checks remain pending. Report path: `/home/sincore/source/spindle/.scratch/2026-11-02-cli-workflow-domains/reports/02-implementation.md`.
