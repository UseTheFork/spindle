---
status: proposed
---

# Select whole Blueprints through an explicit catalog

The [Blueprint catalog design](../../.scratch/2026-11-03-blueprint-catalog-simplification/design.md)
selects whole files or directories by logical key, relative path, lifecycle
status, and applicable Stacks. This replaces internal Stack overlays and
Agent/Instruction wrapper directories from ADR-0001 and ADR-0002, avoiding
parallel discovery and layout conventions while preserving rendering and
existing update units.

Selected directories own destination membership: destination-only files,
including local additions, are removed even when version updates are skipped.
Removed or Stack-inapplicable entries delete their complete targets. Catalog
entries must remain as removal records when their destinations require cleanup;
no installation inventory is maintained. These explicit ownership boundaries
trade preservation of local additions for deterministic cleanup without tracking.

Reconciliation prepares catalog validation, selected rendered writes, Config
content, and all deletions and membership cleanup before applying any
installation changes. A preparation failure leaves the project unchanged. An
application-time filesystem failure stops reconciliation and reports completed
changes; it does not promise rollback. The package build
bundles the catalog and Blueprint assets under `build/blueprints`, which is the
runtime source for packaged CLI use.
