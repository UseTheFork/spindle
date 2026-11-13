---
name: Source Architecture
description: Use when adding, moving, or refactoring source files.
applyTo: "**/*"
metadata:
  spindle:
    version: 1.0.0
---

# Source Architecture

- Organize code by feature or domain so related responsibilities can evolve together. Treat this as a flexible convention, not a required architecture label or fixed directory tree.
- Keep each file focused on one clear responsibility. Split it when it has multiple reasons to change or becomes difficult to navigate; do not use an arbitrary line-count limit.
- Add role-based subfolders when they help separate responsibilities or improve navigation as a feature grows.
- Put stateful behavior on the class or service that owns it. Use module-level functions for stateless helpers; use static methods when grouping helpers with a class improves cohesion or clarity.
