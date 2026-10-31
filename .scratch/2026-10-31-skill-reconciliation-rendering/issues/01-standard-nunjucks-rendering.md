# 01: Render Stub text with standard Nunjucks syntax

**What to build:** As a Stub author, I can use standard Nunjucks syntax to render Stubs, while installation preserves files that should not be rendered byte-for-byte.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Rendering uses Nunjucks standard expressions, blocks, and comments without global lexer mutation or custom delimiter configuration; legacy `<%...%>` syntax is not supported as template syntax.
- [ ] Literal Nunjucks-like content can be preserved with raw blocks; autoescaping remains disabled and undefined values remain errors.
- [ ] Rendering operates on text independently of file reads and classification; installation renders recognized UTF-8 text and copies binary, unsupported-extension, NUL-containing, and invalid-UTF-8 files byte-for-byte.
- [ ] Rendering tests cover template text behavior; installation tests cover file classification and preservation, retaining equivalent coverage to the existing behavior tests.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
