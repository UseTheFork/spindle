---
name: Testing
description: Use when creating or changing tests, including when no test file is open.
applyTo: "**/*.test.{ts,js,cjs,mjs}"
---

# Testing

- Write new and migrated tests with explicit imports from `vitest` (`test`, `describe`, and lifecycle hooks). Do not rely on globals.
- Migrate existing `node:test` files one at a time when requested; do not mix runners within a file or convert unrelated files.
- Keep existing `node:assert/strict` assertions during runner migration; Vitest supports them. Preserve test coverage and behavior rather than rewriting assertions unnecessarily.
- Replace Node test-context lifecycle hooks with Vitest equivalents when needed, preserving fixture isolation and cleanup.
- Prefer in-process application tests. Retain subprocess tests for executable behavior, process interruption, and competing-process ownership.
- Run project commands directly as documented in [Project Tooling](../../docs/agents/tooling.md), not through Just. During migration, select files explicitly and use the runner matching each file's imports.
- Do not run tests when the user explicitly requests conversion without execution.
- Name files `<topic>.test.ts` next to the area they cover, or under `tests/` for CLI-level tests.

```ts
import assert from "node:assert/strict";
import { test } from "vitest";

test("exits non-zero when just is missing", () => {
  assert.equal(result.status, 1);
});
```
