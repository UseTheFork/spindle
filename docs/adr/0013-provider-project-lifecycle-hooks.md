---
status: accepted
---

# Provider-owned project lifecycle hooks

Init and update currently combine Blueprint reconciliation with Project and
Tooling work across command and service boundaries. Move Project and Tooling work
into provider-owned `beforeInit`, `afterInit`, `beforeUpdate`, and `afterUpdate`
hooks, while retaining a coordinator for reconciliation, sequencing, and failure
reporting. Explicit phases preserve preparation before Blueprint changes and
application afterward without centralizing domain callbacks in arrays.

Prepared work uses an operation-local Container with typed class keys. Project
owns its prepared guidance type; other domains can supply their own types without
adding domain-specific fields to the lifecycle context.

## Lifecycle contract

- Validate target settings before invoking hooks. Commands retain core argument
  parsing and prompts; hooks may use `Application` services and read additional
  arguments owned by their domain.
- Pass the same typed, operation-scoped context to hooks. It contains validated
  target settings and domain-owned prepared work. Do not retain prepared work in
  long-lived provider fields.
- Run hooks sequentially in provider registration order in both phases. Project
  must precede Tooling. Do not introduce priorities or a dependency graph.
- Temporarily expose target settings through the application's settings service
  while running before-hooks and reconciliation. Restore temporary bindings on
  failure. After successful reconciliation and persistence, end the temporary
  scope and refresh application settings from disk before running after-hooks.
  Reject settings that no longer match the target instead of invoking
  after-hooks with inconsistent settings.
- Project prepares guidance in its before-hook and applies it in its after-hook.
  Tooling validates its paths before reconciliation and performs its work in its
  own after-hook, not through Project. Direct `ProjectService.initialize()` calls
  initialize guidance only; the coordinated lifecycle also initializes Tooling.
- Stop at the first failure, report the error and completed changes, and do not
  roll back. A before-hook failure prevents reconciliation and all after-hooks;
  a reconciliation failure prevents all after-hooks. An after-hook failure
  prevents subsequent hooks. After-hooks are not cleanup or finally callbacks.
- Apply the same update lifecycle to settings-driven updates.
- Reject init on an already initialized project before invoking hooks or changing
  files. Direct the user to update instead of refreshing guidance before
  reporting an error.

## Consequences

Provider registration order becomes a project lifecycle dependency as well as a
boot ordering rule. The phase boundary preserves the installation-before-guidance
ordering in [ADR-0010](./0010-unified-project-initialization.md); early rejection
of repeated init is an intentional behavior change. Settings visibility is
consistent at hook boundaries, but independently cached service values are not
automatically refreshed, and failures during application can leave partial
changes.

Operations on the same application cannot overlap because temporary settings
visibility uses a shared application binding. An overlapping operation fails
explicitly; separate applications retain independent lifecycle state.
