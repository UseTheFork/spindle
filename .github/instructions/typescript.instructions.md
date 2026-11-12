---
name: TypeScript Conventions
description: Use when creating or changing TypeScript imports, classes, visibility, or application infrastructure.
applyTo: "src/**/*.ts,tests/**/*.ts"
---

# TypeScript Conventions

- Import modules under `src/` using extensionless `@/` paths in production and tests, for example `import { Application } from "@/Foundation/Application"`.
- Keep bare package imports and `node:` imports unchanged. Use `import type` for type-only dependencies, especially across application, service, and provider boundaries.
- Do not assume TypeScript aliases resolve in emitted JavaScript. When introducing production aliases, ensure the compiler, source runner, and build-time alias rewriting support them. Verify the built CLI runs with Node and emitted imports contain no unresolved aliases or extensionless file paths.
- Use explicit `public`, `protected`, and `private` modifiers on class members and constructors. Use TypeScript `private` rather than ECMAScript `#` members.
- Mark backing references `readonly` when replacement is not intended. Preserve getter-only APIs where runtime assignment must remain disallowed; TypeScript `private` and `readonly` do not themselves enforce runtime privacy or immutability.
- Name class-focused production files in PascalCase matching the principal class, such as `Application.ts`, `ServiceProvider.ts`, and `Repository.ts`. Test filenames follow the separate conventions in [Testing](./testing.instructions.md); this class naming rule does not apply to non-class utility modules.
- Apply these conventions to new and changed code without unrelated mass renaming or refactoring. Update all necessary consumers when a file is intentionally renamed.
- Follow the lifecycle and configuration contracts in [Project Tooling](../../docs/agents/tooling.md#application-services) and the rationale in [Application-owned services](../../docs/adr/0004-application-owned-services.md). Reference those documents rather than duplicating their contracts in instructions.
- Run project commands through Just recipes as documented in [Project Tooling](../../docs/agents/tooling.md). Use focused validation and follow [Testing](./testing.instructions.md) for test selection.
