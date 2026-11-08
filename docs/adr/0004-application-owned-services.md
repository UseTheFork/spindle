---
status: accepted
---

# Application-owned services

Each `Application` composes its own reusable `Container`. Registration is explicit:
`bind` creates transient values, `singleton` shares initialization and its successful
result, and `instance` supplies an existing value. Keys are constructor identities
or typed `ValueToken`s, never strings. Every duplicate registration throws, and
`bound` recognizes all registration kinds. Unbound resolution throws; there is no
implicit construction, global container, flush API, or compatibility resolver.
`make` is asynchronous for every key. Ordinary classes require explicit sync or
async factories receiving the application. Service constructors may omit the
factory, defaulting to `application => new ServiceType(application)`.

Only `Service` instances are automatically booted before resolution returns.
Booted-state tracking is module-private, and successful boot alone marks a service
usable. Supplied service instances must already be booted; ordinary objects with
`boot` methods are not lifecycle participants. Concurrent singleton requests
coalesce, failed initialization can retry, and isolated applications never share
container caches. The extracted resolver retains ancestor-cycle detection and a
reference-counted dependency graph, including cycles between concurrently started
shared initializations. Factories and service hooks run inside the same asynchronous
resolution context.

Commands, reconciliation, and installation are explicit production singletons.
`ComputedContextService` is transient: reconciliation resolves a fresh instance per
run, retaining memoization within that run without carrying computed values between
runs. Config, prompt answers, plans, and operational mutable state remain per-run.
Stateless utilities remain standalone functions, not artificial services.

`Application` requires only `{ basePath }`. This explicit invocation starting path
is normalized to an absolute path and never changes. Workspace and Blueprint source
roots are separate typed values bound by bootstrap, not constructor arguments.
Getter-only root accessors use instance-token synchronous access for filesystem
consumers. Application does not read `process.cwd()`; the executable supplies it.
Its initially empty mutable `config` is isolated between applications and available
before provider construction. Application Configuration is distinct from the
project's `.github/spindle.json` Config; no file-loading configuration bootstrapper
is introduced.

`register(ProviderClass)` constructs and synchronously registers each provider once,
then queues its instance for boot. Providers receive getter-only application
ownership. There are no registration phase gates or completion markers: callers
control registration-before-boot ordering. `Application.boot()` only awaits queued
provider hooks sequentially. Concurrent and non-awaited reentrant calls share one
initialization, retaining either success or failure without retry.

The independent `Bootstrapper` abstraction implements
`bootstrap(application): void | Promise<void>` with no required constructor
arguments. `Application.bootstrapWith(list)` captures the first list and constructs
and awaits each hook sequentially, starting on a microtask. State belongs to the
application, including across kernels. Success sets getter-only
`hasBeenBootstrapped`; failure stops the sequence, remains cached, and leaves the
flag false. An empty list succeeds without implicitly registering providers.

The ordinary, extendable `Kernel` defaults to the explicit ordered list
`LoadConsoleArgs`, `DiscoverGitRoot`, `ResolveBlueprintSourceRoot`,
`RegisterProviders`. Its protected list can be overridden without normalization.
`boot(invocation)` supplies the validated invocation token before bootstrap, then
awaits application provider boot. Subsequent calls retain the first invocation.
Bootstrap failure prevents any partial provider queue from booting through Kernel;
provider boot failure does not undo successful bootstrap.

`RegisterProviders.merge(list)` replaces its private, process-global provider list
with a fresh ordered, deduplicated, nullish-filtered array. Bootstrap loops directly
over that list and calls `application.register`. This global list is configuration,
not a container: builders deliberately replace it, and tests reset it with
`merge([])`. There are no provider-list snapshots, registration gates, or hidden
bootstrap-list normalization.

`ApplicationBuilder` offers fluent `withKernels`, `withProviders`, and `create`.
`withKernels` idempotently registers an ordinary Kernel singleton with an explicit
factory; resolving it never boots it. `Application.configure(basePath, providers = [])`
returns a builder preconfigured with kernels and the supplied providers. Default
provider arrays are fresh, and omission clears the previous global selection.
The executable explicitly supplies the concrete production service provider.

Commander remains the sole parser. Only a parsed command action supplies an
invocation containing raw argument tokens, script, command path, parsed options,
and positional arguments. Existing command-specific validation happens before
application construction. Dispatch composes the application, resolves Kernel,
boots that invocation, resolves the command, then invokes its operation.
`LoadConsoleArgs` copies the validated structure into a `Repository` value token;
it never reads or reparses `process.argv`. Help, version, and malformed arguments
do not construct an application or discover Git.

Git discovery starts at the immutable base path and binds the working-tree root
as the project workspace, with explicit failure and no current-directory fallback.
Blueprint source discovery preserves the environment override anchored to that
workspace and the packaged asset layout relative to the helper module. Mandatory
Git discovery intentionally changes workspace command behavior outside working
trees and when invoked from nested directories. Programmatic fixtures can bind
explicit root values without Git discovery.

Source imports use extensionless `@/` aliases with TypeScript Bundler resolution.
The production build rewrites aliases and file extensions for Node ESM, preserves
the Blueprint bundle and setup-project templates, and is verified as an executable
package. Source subprocess runners explicitly select the repository tsconfig when
their fixture working directory is elsewhere.

This trades direct function calls and implicit resolution for explicit composition
and application-local lifecycle ownership, while retaining standalone utilities.
There are no handle/terminate hooks, root constructor providers, string aliases,
legacy `get`/`create` methods, or old application-module compatibility exports.
