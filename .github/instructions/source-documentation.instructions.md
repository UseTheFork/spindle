---
name: Source Documentation
description: Use when creating or changing source files, especially classes and methods.
applyTo: "src/**/*"
---

# Source Documentation

- Follow the general guidance in [Code Commenting Rules](./code-commenting.instructions.md). These rules clarify when class and method comments add value.
- By default, add a class comment only when its responsibility, ownership, or lifecycle is not clear from its name, location, or authoritative project documentation. State the missing context; do not summarize members or implementation.
- By default, add a method comment only when its caller contract is not clear from its name, signature, or local code. State non-obvious preconditions, side effects, ordering, invariants, or failure behavior.
- When a task explicitly requests broader class or method documentation, follow that scope under the general code-commenting rules. Keep comments concise and factual; point to authoritative documentation instead of repeating it.
- Do not repeat details that are clear from code or already explained in an ADR or other authoritative documentation. Keep durable design decisions in those documents.
- Put command syntax and user-facing behavior in CLI help or user documentation, not in comments on internal methods.
- Do not require comments because a class or method is public or exported. TypeScript signatures already describe parameter and return types; use JSDoc tags only when they add information beyond those types.
