---
status: proposed
---

# Application-owned services

Replace the function-based application composition with an `App` that owns
command and workflow services. Child services receive the application through
a shared base-class constructor rather than inheriting from `App`. Keep a thin
executable entrypoint, separate Init and Update classes in their own folders,
and a shared installation service. All existing CLI commands use this
application/service structure rather than retaining separate construction paths.
Stateless utilities remain functions in focused files under a dedicated
utilities folder. Migrate consumers and tests directly to the new APIs without
compatibility exports, preserving CLI behavior except for the root-discovery
changes below.

Init and Update delegate shared Blueprint lifecycle planning, preparation, and
application to an application-owned reconciliation service. It resolves the
installation service during asynchronous boot; each reconciliation keeps its
Config, prompt answers, plans, and mutable state local to that run. It creates a
fresh computed-context service per run, preserving memoization within a run
without retaining computed values across runs.

The refactor includes shared Blueprint reconciliation and computed-variable
resolution, not just command wrappers around existing workflow functions.
Existing computed provider classes remain, and computed-context caches retain
their per-run lifetime rather than becoming application-wide state.

The application provides asynchronous `get(Service)` for an application-local
singleton and `create(Service)` for a fresh instance. Separate applications never
share instances or cached Config. Concurrent requests for a singleton share its
initialization. Constructors only receive and store the application; dependencies
are resolved during `boot()`, and operational work follows initialization.

The shared base class provides an empty asynchronous `boot(): Promise<void>`
and a read-only `isBooted` flag managed by the application. The application calls
the hook after construction, when derived fields exist, and marks the instance
booted only after success. Failed instances are not retained as usable singletons.
Circular dependencies fail explicitly with the dependency chain rather than
exposing partially initialized services.

The application owns immutable workspace and Blueprint source roots. Services
use those roots instead of ambient working-directory state; production code must
not independently derive paths from `process.cwd()`. The executable bootstrap
may use the current directory only as the starting point for discovering the
Git working-tree root, which becomes the application's workspace root. CLI
workspace operations require successful Git root discovery and fail explicitly
if it is unavailable; there is no current-directory fallback. Programmatic
callers and tests may supply an explicit root. Per-run data stays outside
long-lived services.

Help and version output remain available without Git root discovery because
they do not operate on a workspace.

This trades direct function calls and explicit dependency arguments for a shared
application dependency and asynchronous service resolution. Application-local
ownership supports isolated projects and tests, while retaining standalone
utilities avoids turning stateless helpers into artificial services.

Mandatory Git root discovery intentionally changes CLI behavior outside Git
working trees and when invoked from a nested directory.
