# Ticket 01 corrective round 1 fix package

## Snapshot identity

- Checkout: `/home/sincore/source/spindle`
- Fix base HEAD: `d8fdab23663a028cb0af96a3f485d4eeb0431a18`
- Fixed HEAD: `d8fdab23663a028cb0af96a3f485d4eeb0431a18` (unchanged)
- Fixed worktree snapshot: the same previously reviewed uncommitted ticket 01 snapshot recorded in `01-code-review.md`, plus only the two corrective hunks below in `tests/install.test.ts` and `.github/scripts/just-modules/lint.just`. No implementation or index changes were made by the reviewer.
- Scope baseline: initial ticket 01 review snapshot and uncommitted inventory are recorded in `01-code-review.md` and `01-implementation.md`. This package contains the complete round-1 fix-only changes relative to that reviewed worktree; the other pre-existing dirty/untracked files remain unchanged.

## Fix-only unified diff

```diff
diff --git a/.github/scripts/just-modules/lint.just b/.github/scripts/just-modules/lint.just
--- a/.github/scripts/just-modules/lint.just
+++ b/.github/scripts/just-modules/lint.just
@@
 set positional-arguments

+[doc('Lint files and automatically fix issues')]
+lint *args:
+    @cd {{ justfile_directory() }} && pnpm lint:fix "$@"
+
 [doc('Lint files without modifying them')]
 check *args:
     @cd {{ justfile_directory() }} && pnpm lint "$@"
diff --git a/tests/install.test.ts b/tests/install.test.ts
--- a/tests/install.test.ts
+++ b/tests/install.test.ts
@@
-    ["assets/nul.txt", Buffer.from([0x41, 0x00, 0x42, 0xff])],
+    ["assets/nul.txt", Buffer.from("A\0B")],
```

## Corrective finding mapping

- `T01-Q-001`: `.txt` is a recognized text extension; `Buffer.from("A\0B")` is UTF-8-valid apart from the NUL scalar and the existing byte-equality assertion verifies preservation.
- `CS-T01-001`: restores the pre-existing `lint *args` fix recipe without removing the new non-mutating `check *args` recipe.

## Worktree inputs included in the fixed snapshot

Tracked modifications carried from the prior review: `.github/scripts/just-modules/format.just`, `.github/scripts/just-modules/lint.just`, `.github/scripts/just-modules/testing.just`, `.scratch/2026-10-31-skill-reconciliation-rendering/issues/01-standard-nunjucks-rendering.md`, `justfile`, `src/install.ts`, `src/render.ts`, `tests/rendering.test.ts`, `tests/stubs.test.ts`, `tests/update.test.ts`, and `tests/variables.test.ts`.

Untracked files carried in the worktree: `.scratch/2026-10-31-skill-reconciliation-rendering/reports/` (implementation and initial review reports, including this package) and `tests/install.test.ts`.

Only the two diff hunks above are corrective-round implementation changes. No commit was created.

## Current reported verification

- Focused installation test: 1/1 passed.
- `just --list lint`: both `lint *args` and `check *args` listed.
- `just lint` and `just lint::check`: passed.
- `just format::check tests/install.test.ts`: passed.
- `just test::types`: passed.
- `just test::test`: 48/48 passed.
- `git diff --check`: passed.

Full command output and the implementer's snapshot notes are in `01-implementation.md`.
