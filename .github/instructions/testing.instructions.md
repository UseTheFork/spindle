---
name: Testing
description: Use when creating or changing tests, including when no test file is open.
applyTo: "**/*.test.{ts,js,cjs,mjs}"
---

# Testing

- Use Vitest for all tests, with explicit imports (`expect`, `test`, `describe`, and lifecycle hooks). Do not rely on globals.
- Migrate existing `node:test` files one at a time when requested; do not mix runners within a file or convert unrelated files.
- Use Vitest `expect` for all assertions, not `node:assert/strict`. Convert assertions when migrating legacy files, preserving identity checks, rejection expectations, coverage, and behavior.
- Replace Node test-context lifecycle hooks with Vitest equivalents when needed, preserving fixture isolation and cleanup.
- Prefer typed, direct Application and service calls for in-process tests. Reuse isolated fixtures and existing helpers; do not recreate CLI argument parsing or erase service option types with casts.
- Retain subprocess tests for actual CLI parsing, executable behavior, process interruption, and competing-process ownership.
- Run project commands directly as documented in [Project Tooling](../../docs/agents/tooling.md), not through Just. During migration, select files explicitly and use the runner matching each file's imports.
- Do not run tests when the user explicitly requests conversion without execution.
- Run the smallest set of explicitly selected test files and named cases covering the change. Do not run the full suite by default; expand validation only when the change requires it and respect the user's test restrictions.
- Import source modules using extensionless `@/` paths, as specified in [TypeScript conventions](./typescript.instructions.md).
- Name files `<topic>.test.ts` next to the area they cover, or under `tests/` for CLI-level tests.

```ts
import { expect, test } from "vitest";
import { Application } from "@/foundation/Application";

test("retains its workspace root", () => {
  const app = new Application({
    basePath: "/workspace",
  });

  expect(app.basePath).toBe("/workspace");
});
```
