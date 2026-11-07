# Code-slop review — Ticket 03

## Findings

### Important

None.

### Minor

- `src/commands/sdd-workspace/sdd-workspace-command.ts:63` and `src/commands/setup-project/setup-project-command.ts:27` — Both files define the same `once(option)` callback factory, including identical duplicate-option error handling. Keeping two copies makes a shared CLI constraint easy to change inconsistently. Move the small factory to the existing shared-options module (or another narrowly scoped shared utility) and use it in both registrations; this preserves option parsing and error behavior.

## Checks and Snapshot

- Workspace: `/home/sincore/source/spindle`
- Reviewed base/head: `1c51cccfae11981a0abd269946e4ba4d097f9c4b` / same HEAD, uncommitted changes only.
- Snapshot verification: controller-supplied tracked worktree diff SHA-256 `98fd9b9847cda9d3c96f719e8a5a234da63d1871889062475886978fa55cd9d3` matched a read-only `git diff --binary HEAD` hash. No staged changes were present.
- At final status, a separate untracked `.scratch/2026-11-06-commander-cli/reports/03-code-review.md` artifact was present; it was not part of the supplied implementation snapshot and was not reviewed. Its appearance did not change the tracked diff or source hashes. The assigned review report was also added as an untracked report.
- Content hashes matched for `src/cli.ts` (`a8a204e8cf2ceced788deb2dd547fa320c8189d13f488731317544b179df0636`), `src/index.ts` (`1321753ec8516af577498eccffa4d60caee546e09f1a61e3ea463f4cdd02ebba`), `src/commands/sdd-workspace/sdd-workspace-command.ts` (`29ea4c43012b48285db0a90a236c86d4341829faf651f01d2382b57cf57fb5f7`), `src/commands/setup-project/setup-project-command.ts` (`c9a9a7e77afe00741a9ea15763e71338450682b386b6300f009b60d6ca0a4ed4`), `tests/sdd-workspace.test.ts` (`8dc5980836b7679156af00e9016efbe35220c0b65137186c2d53f31bed25a4a9`), `tests/setup-project.test.ts` (`5c6260dbc689f9787d205fa33cf0d2ca1bf2e9e36517c66d27b25ffe27d1f13b`), and `tests/git-root.test.ts` (`273686fc15e2fe8066b6fd79c1f264ae658d208a0c3b2f4fa75a35d9cd8b3dbd`). The corrected untracked implementation report hash was `210a2cfe55afe82b1b2d2ea28d4bffd582841c13110e8590e38024bcc0bd1bf5`.
- Covered diff: CLI routing/bootstrap, both command registrations, and the three changed subprocess test files; also read the controller-owned ticket metadata change and implementation report. The complete tracked diff was retrieved with `git diff --binary HEAD`. No Blueprint changes were listed.
- Requirements/evidence inspected: canonical spec and ticket; applicable testing instructions and project tooling conventions; corrected implementation report; changed code and tests; existing init/update registration and shared-options conventions. No repository `AGENTS.md` was found.
- Checks run by reviewer: read-only snapshot/hash verification and source inspection only. No tests or formatters were run by reviewer.
- Controller-supplied verification, confirmed to cover this source snapshot: targeted format check passed; targeted lint passed; type-check passed; ticket regression command passed (81/81); `git diff --check` passed. Exact commands:
  - `just format::check src/commands/sdd-workspace/sdd-workspace-command.ts src/commands/setup-project/setup-project-command.ts src/cli.ts src/index.ts tests/sdd-workspace.test.ts tests/setup-project.test.ts tests/git-root.test.ts`
  - `just lint::check` on the same seven paths
  - `just test::types`
  - `just test::test tests/sdd-workspace.test.ts tests/setup-project.test.ts tests/git-root.test.ts tests/init.test.ts tests/update.test.ts tests/computed-variables.test.ts`
  - `just tool::git diff --check`
- Coverage limits: full test suite, packaged executable, and build were not run. The implementation report notes no direct `run` tests for these two commands; the focused CLI subprocess suites are the established test seam.

## Assessment

**Code slop found? Yes.** One minor, behavior-preserving deduplication is supported: the duplicate-option helper is copied in two command modules. The rest of the implementation appears proportionate to the requested Commander-owned declarations; repeated validation is needed both before lazy application creation and for the Commander-independent `run` APIs.

| File | Verdict | Top finding | Suggested action |
|---|---|---|---|
| `src/commands/sdd-workspace/sdd-workspace-command.ts` | SUSPICIOUS | Duplicate `once()` helper | Share the helper with setup-project |
| `src/commands/setup-project/setup-project-command.ts` | SUSPICIOUS | Duplicate `once()` helper | Share the helper with SDD workspace |
| `src/cli.ts` | CLEAN | — | — |
| `src/index.ts` | CLEAN | — | — |
| `tests/sdd-workspace.test.ts` | CLEAN | — | — |
| `tests/setup-project.test.ts` | CLEAN | — | — |
| `tests/git-root.test.ts` | CLEAN | — | — |

No material comment, naming, dead-code, defensive-check, debug-artifact, or test-mirroring issue was supported by the reviewed changes.
