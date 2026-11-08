---
status: proposed
---

# Application-owned services

Replace the function-based application composition with an `Application` that owns
command and workflow services. Child services receive the application through
a shared base-class constructor rather than inheriting from `Application`. Keep a thin
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

`Application` and `ApplicationOptions` live in `src/foundation/Application.ts`;
the old application module and names have no compatibility exports.
`Service` lives in `src/services/Service.ts`. Type-only application imports in the service and provider modules avoid
runtime circular dependencies. Booted-state tracking stays module-private, shared
by the base service and the application's initialization helper.

Applications may receive a readonly constructor array of `ServiceProvider`
subclasses from `src/services/ServiceProvider.ts`. Each provider receives its
owning application through a getter-only reference and implements synchronous
`register(): void` and asynchronous `boot(): Promise<void>` hooks. The application
constructs a fixed collection once during application construction.
`Application.registerProviders()` synchronously registers all providers in supplied
order, once only. It distinguishes pending, in-progress, successful, and failed
registration. Reentrant registration rejects explicitly. Registration failures,
including arbitrary thrown values, propagate and are cached without retry; later
providers are not registered and no providers are booted.

`Bootstrapper` is an independent abstract class, not a service, in
`src/foundation/bootstrap/Bootstrapper.ts`. Its typed constructor list accepts
classes with no required constructor arguments. Each implements
`bootstrap(application: Application): void | Promise<void>`.
`Application.bootstrapWith(list)` captures the first list, directly constructs
each class, and sequentially awaits its hook before constructing the next.
Initialization begins on a microtask so concurrent and non-awaited reentrant
requests share the same initialization. The application retains its first result,
even if later calls supply a different list. Constructor and hook failures stop
the sequence and stay cached without retry. The getter-only
`hasBeenBootstrapped` becomes true only after the entire sequence succeeds;
failure leaves it false. An empty list succeeds without implicitly registering
providers.

The extendable `Kernel` in `src/foundation/Kernel.ts` owns a public readonly
application reference. Its protected `bootstrappers()` defaults to
`[RegisterProviders]`, whose synchronous hook calls `registerProviders()`.
Subclasses may replace or extend this list. `Kernel.bootstrap()` delegates to
application bootstrap; `Kernel.boot()` awaits bootstrap, then application boot.
Multiple kernels for the same application share all lifecycle state.

`Application.boot()` only boots providers sequentially after registration has
completed; it never registers them. Premature calls (including during registration)
explicitly reject without caching that misuse as a boot failure. Failed registration
instead rejects with its cached failure. Valid boot calls share one initialization
across concurrent requests and retain success or failure without retry. A failed
provider boot leaves successful bootstrap completion intact and skips later boot
hooks. Empty provider collections are valid but must still be registered. Direct
application callers may register and boot without a kernel.

These one-shot lifecycle failures differ intentionally from retryable singleton
service failures. No command execution integration, handle/terminate hooks,
environment/configuration loading, or no-op bootstrappers are introduced.
Application, kernel, bootstrapper, service, and provider members use explicit
TypeScript visibility; root and service/provider ownership backing references
remain private and readonly. These are architecture concepts, not domain glossary
terms.

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
