# Ticket 03 code-slop review

## Findings

### Important

None.

### Minor

- **`src/blueprints/lifecycle.ts:529–584`** (alongside the corresponding
  catalog-deletion flow at `467–527`): membership cleanup adds a second
  validator and apply loop that repeat the catalog-deletion path-safety check,
  `lstat`/symlink/type validation, ENOENT handling, error wrapping, completed
  operation tracking, removal, and outcome construction. The remaining
  differences are meaningful policies—membership targets are files, catalog
  deletions may be directories, and their diagnostics differ—but duplicating
  the orchestration increases maintenance cost and risks behavior drifting
  between the two removal paths. Keep the two planned-operation categories
  separate, but route both through shared validation/application helpers
  parameterized by expected target type, recursive removal, and operation
  wording.

## Checks and Snapshot

- **Reviewed snapshot:** base and head
  `5be1be9e35d332c422152a3b5d09c2921a79af18`, plus the frozen uncommitted
  ticket 03 worktree. At inspection, tracked changes were the ticket 03 tracker
  update, `docs/blueprints.md`, `src/blueprints/catalog.ts`,
  `src/blueprints/lifecycle.ts`, and `tests/existing-repo.test.ts`.
  Untracked review inputs were `tests/directory-membership.test.ts` and
  `.scratch/2026-11-03-blueprint-catalog-simplification/reports/03-implementation.md`.
  This assigned report was not part of the reviewed source snapshot.
- **Evidence inspected:** scoped tracked diff and untracked CLI tests and
  implementation report; ticket 03 issue, feature specification, design
  context, changed lifecycle/catalog code, and related documentation.
- **Checks run by reviewer:** `git status --short` and `git diff --check HEAD`;
  both completed successfully. No tests or type checks were run by this
  reviewer.
- **Controller-provided verification:** `just test::test` passed (188/188),
  `just test::types`, scoped format and lint checks, and
  `just tool::git diff --check HEAD` passed on the assigned snapshot.
- **Limitations:** full-repository format was not run due to an unrelated
  baseline issue, per controller report. Ticket 04 cross-kind coordination is
  deferred. No code-review report or controller ruling was supplied; the
  assignment specified not to wait for it.

## Assessment

**Code slop found? Yes.** One concrete, low-severity simplification is
supported: the membership-removal executor duplicates most of the existing
catalog-removal validation and application flow. Remaining reviewed code and
tests did not support other material code-slop findings; cleanup planning
remains appropriately distinct as required by the ticket.

### Code Slop Ledger

| File | Verdict | Top findings | Suggested action |
| --- | --- | --- | --- |
| `src/blueprints/lifecycle.ts` | SUSPICIOUS | Duplicated catalog-removal and membership-cleanup execution flow | Share common removal validation/application while keeping operation policies distinct |
| `src/blueprints/catalog.ts` | CLEAN | — | — |
| `tests/directory-membership.test.ts` | CLEAN | Real CLI assertions check filesystem membership and surviving bytes | — |
| `tests/existing-repo.test.ts` | CLEAN | Assertions reflect authoritative cleanup behavior | — |
| `docs/blueprints.md` | CLEAN | Directly documents ownership and preserved version decisions | — |
