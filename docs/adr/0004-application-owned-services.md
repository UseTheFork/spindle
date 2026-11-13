---
status: accepted
---

# Application-owned services

`Application` extends its reusable `Container`; it has no separate container
property or delegated resolver methods. Registration is explicit: `bind` creates
transient values, `singleton` shares initialization and its successful result, and
`instance` supplies an existing value. Keys are strings or actual class
constructors. Constructor keys normalize to their runtime `.name`, so every class
used as a key must have a stable, unique name within the application. A string key
with that name addresses the same binding, and duplicate registration throws even
when distinct constructors share a name. Runtime can validate class constructors
but cannot distinguish a named class declaration from a named class expression;
developers must follow the unique-name convention rather than relying on
fabricated module metadata. Unnamed classes and non-class function/object keys are
rejected. `bound` recognizes all registration kinds. Unbound resolution throws;
there is no implicit construction, global container, flush API, or compatibility
resolver. Class-key `make` is asynchronous and preserves the instance type;
string-key `make` returns `unknown`. Ordinary classes require explicit sync or
async factories receiving the application. Service constructors may omit the
factory, defaulting to `application => new ServiceType(application)`.
Class-key factories and supplied values are checked against the constructor type;
string factories infer their produced type at registration without widening the
return type of string-key `make`.
Abstract class keys support typed instance bindings and `make` resolution without
allowing implicit construction.

Only `Service` instances are automatically booted before resolution returns.
Booted-state tracking is module-private, and successful boot alone marks a service
usable. Supplied service instances must already be booted; ordinary objects with
`boot` methods are not lifecycle participants. Concurrent singleton requests
coalesce, failed initialization can retry, and isolated applications never share
container caches. The extracted resolver retains ancestor-cycle detection and a
reference-counted dependency graph, including cycles between concurrently started
shared initializations. Factories and service hooks run inside the same asynchronous
resolution context.

Providers declare command classes in static `commands()`; the inherited default
is empty. Declared commands extend `Command` and satisfy `CommandConstructor`,
which requires a static Commander schema registration method. TypeScript cannot
declare an abstract static method, so the constructor contract enforces it at
the provider boundary. Application binds each distinct command class as a singleton
before its provider's register hook; providers explicitly bind dependencies.
`BlueprintManagementServiceProvider` owns `init` and `update`, and registers
reconciliation and installation as explicit singletons. `ProjectServiceProvider`
owns the explicitly bound `ProjectService` singleton for project guidance
initialization; `ToolingServiceProvider` owns `spindle tool` and its explicitly
bound `ToolingService` singleton. `ComputedContextService` is a transient Template Rendering dependency,
as established by [ADR-0009](./0009-shared-template-rendering.md).
`ComputedContextService` is transient: reconciliation resolves a fresh instance per
run, retaining memoization within that run without carrying computed values between
runs. Project Settings, prompt answers, plans, and operational mutable state remain per-run.
Stateless utilities remain standalone functions, not artificial services.

`FoundationServiceProvider` explicitly binds the ordinary, stateful
`ConsoleOutputService` singleton. CLI dispatch configures its invocation-local
human or JSON mode after bootstrap. CLI adapters submit human messages and typed
data; command operations and domain services do not print results.
The executable uses the same service policy for pre-application failures.
See [CLI output](../cli-output.md) for the stream and envelope contracts.

`Application` requires only `{ basePath }`. This explicit invocation starting path
is normalized to an absolute path and never changes. The workspace root is bound
by bootstrap, not supplied as a constructor argument. The getter-only
`workspaceRoot` accessor reads `path.workspace` and validates its value as a
string. Blueprint assets derive from `assetsPath("Blueprints")` rather than a
separately bound root. `basePath(path = "")` is a method using the immutable
constructor base path, also bound under `path.base`. `workspacePath(path = "")` joins
the discovered workspace root, throwing before it is bound. `appPath(path = "")`
joins the module-relative installation directory (`src/` from source, `build/`
when compiled), not the Git root. `assetsPath(path = "")` joins the package's
`assets/` directory in both source and compiled execution. All delegate to
`joinPaths(basePath, path = "")`,
which preserves the base for an empty suffix, replaces it for an absolute suffix,
and joins relative suffixes without resolving relative bases against cwd.
Application does not read `process.cwd()`; the executable supplies it.
its initially empty mutable `config` is isolated between applications and available
before provider construction. Application Configuration is distinct from the
project's `.github/spindle.json` Project Settings. [ADR-0005](./0005-subagent-development-boundaries.md)
adds a distinct Project Settings snapshot bootstrap adapter without populating `app.config`.

`register(ProviderClass)` constructs and synchronously registers each provider once,
then queues its instance for boot. Providers receive getter-only application
ownership. Providers are registered before boot; bootstrap may prepare dependencies,
but commands and domain operations run only after provider boot completes.
`Application.boot()` awaits queued provider hooks sequentially and marks completion.
Concurrent and non-awaited reentrant calls share one initialization, retaining
either success or failure without retry.
The constructor binds its own instance under `app`, `Application`, and `Container`
before registering `FoundationServiceProvider` and `GitServiceProvider`, with
`path.base` and configuration already available. These are the explicit
constructor-time exceptions, before bootstrap processes external providers.
Git registration binds its singleton without discovering a repository.
Their hooks follow the same register-once and queued boot lifecycle as external providers.

The independent `Bootstrapper` abstraction implements
`bootstrap(application): void | Promise<void>` with no required constructor
arguments. `Application.bootstrapWith(list)` captures the first list and constructs
and awaits each hook sequentially, starting on a microtask. State belongs to the
application, including across kernels. Success sets getter-only
`hasBeenBootstrapped`; failure stops the sequence, remains cached, and leaves the
flag false. An empty list succeeds without registering additional providers;
the constructor-registered foundation provider is already queued.

The ordinary `Kernel` defaults to the explicit ordered list
`LoadConsoleArgs`, `DiscoverGitRoot`, `LoadProjectSettings`, `RequireProjectSettings`,
`RegisterProviders`.
Its protected list can be overridden without normalization.
`boot(invocation)` supplies the validated invocation under `console.invocation`
before bootstrap, then awaits application provider boot. Subsequent calls retain
the first invocation.
Bootstrap failure prevents any partial provider queue from booting through Kernel;
provider boot failure does not undo successful bootstrap.

`RegisterProviders.merge(list)` replaces its private, process-global provider list
with a fresh ordered, deduplicated, nullish-filtered array. Bootstrap ordinarily
loops over that list and calls `application.register`; dispatch instead supplies
an application-specific snapshot of its provider selection, preserving consistency
across concurrent invocations. This global list is configuration,
not a container: builders deliberately replace it, and tests reset it with
`merge([])`. There are no registration gates or hidden bootstrap-list normalization.

`ApplicationBuilder` offers fluent `withKernels`, `withProviders`, and `create`.
`withKernels` idempotently registers an ordinary Kernel singleton with an explicit
factory; resolving it never boots it. `Application.configure(basePath, providers = [])`
returns a builder preconfigured with kernels and the supplied providers. Default
provider arrays are fresh, and omission clears the previous global selection.
The executable explicitly supplies the concrete production service provider.

Commander remains the sole parser. Before constructing an application or
discovering Git, dispatch registers command schemas from the same explicitly
supplied provider selection used for bootstrap, including the foundation provider.
Repeated command class identities are deduplicated; conflicting command names
fail when Commander registers them. Only a parsed command action supplies an
invocation containing raw argument strings, script, command path, parsed options,
and positional arguments. Existing command-specific validation happens before
application construction. Dispatch composes the application, resolves Kernel,
boots that invocation, resolves the command, then invokes its operation. `LoadConsoleArgs` validates the invocation shape and
copies it into a `Repository` instance under `console.args`; it never reads or
reparses `process.argv`. The `ConsoleInvocation` type lives in its own module.
Help, version, and malformed arguments do not construct an application or
discover Git.

Git discovery starts at the immutable base path and binds the working-tree root
as the project workspace, with explicit failure and no current-directory fallback.
Blueprint source discovery preserves the environment override anchored to that
workspace and the packaged asset layout relative to the helper module. Mandatory
Git discovery intentionally changes workspace command behavior outside working
trees and when invoked from nested directories. Programmatic fixtures can bind
explicit root values without Git discovery.

Source imports use extensionless `@/` aliases with TypeScript Bundler resolution.
The production build rewrites aliases and file extensions for Node ESM, preserves
the Blueprint bundle and Project assets, and is verified as an executable
package. Source subprocess runners explicitly select the repository tsconfig when
their fixture working directory is elsewhere.

This trades direct function calls and implicit resolution for explicit composition
and application-local lifecycle ownership, while retaining standalone utilities.
There are no handle/terminate hooks, external constructor providers, alternate string
aliases, legacy `get`/`create` methods, or old application-module compatibility
exports.
