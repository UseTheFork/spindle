# Spindle Constitution

## Core Principles

### DRY

Maintain one implementation for the same rule or responsibility. Similar code
may remain separate when the underlying responsibilities can evolve independently.

### You Aren't Gonna Need It

Implement capabilities for current, evidenced requirements rather than speculative
future needs. Include the error handling, tests, and known constraints required
to make those capabilities reliable.

### Domain and Feature Ownership

Organize related code by domain or feature, with clear ownership. Use role-based
folders when they improve navigation. Keep domain-specific helpers in their owning
domain; place genuinely cross-domain utilities in shared Support.

### One Class Per File

Place each class in its own file. Follow [ADR-0004](../adr/0004-application-owned-services.md)
for class ownership and stateless utility conventions.

### GitHub Directory Ownership

Do not modify files under `.github/` unless the user explicitly requests those changes.
Spindle manages this directory and can overwrite managed files during `spindle init`
or `spindle update`.

## Governance

Amendments require explicit user approval. Check proposed changes against
repository-wide instructions and architectural decisions. Use semantic versioning:
major for breaking principle changes, minor for added or removed principles, and
patch for clarifications. Keep the ratification date fixed and update the
last-amended date for each approved amendment.

**Status**: Ratified | **Version**: 1.1.0 | **Ratified**: 2026-11-15 | **Last Amended**: 2026-11-15
