# 01: Render Stub text with standard Nunjucks syntax

**What to build:** As a Stub author, I can use standard Nunjucks syntax to render Stubs, while installation preserves files that should not be rendered byte-for-byte.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent
**Execution:** accepted

- [X] Rendering uses Nunjucks standard expressions, blocks, and comments without global lexer mutation or custom delimiter configuration; legacy `<%...%>` syntax is not supported as template syntax.
- [X] Literal Nunjucks-like content can be preserved with raw blocks; autoescaping remains disabled and undefined values remain errors.
- [X] Rendering operates on text independently of file reads and classification; installation renders recognized UTF-8 text and copies binary, unsupported-extension, NUL-containing, and invalid-UTF-8 files byte-for-byte.
- [X] Rendering tests cover template text behavior; installation tests cover file classification and preservation, retaining equivalent coverage to the existing behavior tests.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-10-31T14:31:15Z - @unknown**
Execution set to `claimed` at `d8fdab23663a028cb0af96a3f485d4eeb0431a18`; starting ticket 01 in the existing clean checkout.

**2026-10-31T14:31:15Z - @unknown**
Execution set to `implementing` at `d8fdab23663a028cb0af96a3f485d4eeb0431a18`; dispatching the ticket implementation.

**2026-10-31T14:37:00Z - @unknown**
Execution set to `blocked` at `d8fdab23663a028cb0af96a3f485d4eeb0431a18`; the documented `just test::test` recipe is unavailable in this checkout, and the available Just testing module has no recipes. The implementation report records unverified test drafts but no source implementation. Need maintainer direction: authorize a direct test command or approve repairing the missing Just recipes before implementation resumes.

**2026-10-31T14:38:00Z - @unknown**
Execution set to `claimed` at `d8fdab23663a028cb0af96a3f485d4eeb0431a18`; maintainer authorized repairing the missing Just test recipe, and ticket 01 is resuming with that tooling repair in scope.

**2026-10-31T14:38:00Z - @unknown**
Execution set to `implementing` at `d8fdab23663a028cb0af96a3f485d4eeb0431a18`; resuming ticket 01 with the test-runner repair authorized.

**2026-10-31T14:46:00Z - @unknown**
Execution set to `blocked` at `d8fdab23663a028cb0af96a3f485d4eeb0431a18`; implementation and the 41 focused ticket tests are complete, but controller mechanical checks are incomplete. `just test::test` fails one unrelated stale internal-skill roster assertion in `tests/stubs.test.ts`; formatting, lint, and type-check commands are unavailable because the Just tooling module/recipes are absent. Review and integration are paused pending maintainer direction on the missing project checks and unrelated baseline failure.

**2026-10-31T14:47:00Z - @unknown**
Execution set to `implementing` at `d8fdab23663a028cb0af96a3f485d4eeb0431a18`; maintainer authorized adding the missing formatting, lint, and type-check Just recipes and correcting the stale `tests/stubs.test.ts` expected source to match shipped Stubs. This resumes controller gate work; ticket implementation remains subject to review afterward.

**2026-10-31T14:55:00Z - @unknown**
Execution set to `in-code-review` at `d8fdab23663a028cb0af96a3f485d4eeb0431a18` plus the current uncommitted changes; controller checks pass for changed-file formatting, lint, types, and all 48 tests, and three parallel reviews are starting.

**2026-10-31T15:15:00Z - @unknown**
Execution set to `accepted` at the current ticket 01 worktree snapshot after task Spec/Quality PASS, code review, code-slop review, corrective round 1, and scoped re-review PASS. All four acceptance criteria are complete. Focused ticket tests passed 41/41; full suite passed 48/48; changed source/test formatting, lint, types, and `git diff --check` passed. Unscoped formatting reports unrelated existing files and is outside this ticket's changed-file check.
