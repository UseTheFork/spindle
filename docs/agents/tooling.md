# Project Tooling

Run project commands directly with pnpm or Git, not Just. Run all commands
from the repository root. Replace `<args>` with optional command arguments.

## Build

- `pnpm run build` - Rebuild the Blueprint bundle from current sources and compile the CLI, removing stale bundled files.

## Linting

- `pnpm run lint <args>` - Check files without modifying them.
- `pnpm run lint:fix <args>` - Apply lint fixes.

## Formatting

- `pnpm run fmt <args>` - Format files.
- `pnpm run fmt:check <args>` - Check formatting without modifying files.

## Type checking

- `pnpm exec tsc --noEmit` - Type-check production sources without emitting files.

## Tooling

- `git --no-pager <args>` - Run Git without an interactive pager.
- `git --no-pager status --short --branch` - Inspect repository status.
- `git --no-pager diff --no-ext-diff` - Inspect unstaged changes.
- `git --no-pager diff --cached --no-ext-diff` - Inspect staged changes.
- `git ls-files --others --exclude-standard` - List untracked files.

## Testing

- `pnpm exec vitest run <args>` - Run migrated Vitest tests once.
- `pnpm exec vitest run tests/app.test.ts` - Run the migrated application tests.
- `pnpm exec vitest run tests/app.test.ts tests/container.test.ts tests/bootstrap.test.ts` - Run application composition and bootstrap tests.
- `pnpm exec vitest run tests/sdd/create.test.ts tests/sdd/status.test.ts` - Run explicitly selected SDD workflow tests.
- `pnpm exec vitest <args>` - Run Vitest in watch mode during local development.
- `pnpm exec vitest run --coverage <args>` - Run migrated tests with coverage; requires a compatible Vitest coverage provider.

## Spindle workflows

- `pnpm run spindle <args>` - Run the CLI from source with arbitrary arguments.
- `pnpm run spindle init <args>` - Install project Blueprints.
- `pnpm run spindle update <args>` - Update installed project Blueprints.
- `pnpm run spindle sdd <args>` - Run subagent-driven development workflow commands.
- `pnpm run spindle setup-project <args>` - Bootstrap missing project documentation defaults.

Pass workspace and spec paths as absolute paths. Append `--help` to inspect
command options, for example `pnpm run spindle sdd create --help`.

## Application services

Import `Application`, `ApplicationOptions`, and service/provider constructor types
from `src/foundation/Application.ts`, `Service` from
`src/services/Service.ts`, and the abstract `ServiceProvider` from
`src/services/ServiceProvider.ts`. There are no compatibility exports or old
`src/app.ts` module.
Application roots and service/provider ownership are getter-only; backing
references use TypeScript `private readonly` visibility.

Each application owns an initially empty `public readonly config`, a `Config`
from `src/config/Config.ts`, available before provider construction. Its mutable
contents are isolated between applications. This is Application Configuration,
not the project's `.github/spindle.json` Config; there is no settings constructor
argument, persistence, file loading, or configuration bootstrapper.

`Config` extends the self-contained `Repository` from `src/utilities/Repository.ts`.
`get(key, default?)` returns `unknown` (or `undefined` when absent without a default);
`set(key, value)` stores a live value, `has(key)` checks presence, and `delete(key)`
returns whether an own key was removed without pruning empty parents.
The `string`, `integer`, `float`, `boolean`, and `array` getters validate values
without coercion and throw on missing keys without defaults or on wrong types.
Integers must be safe integers; floats accept finite numbers, including integers.
Arrays are live `unknown[]` references. Defaults may be correctly typed literals
or lazy callbacks, are validated by typed getters, and apply only to absent keys:
present `null`, `undefined`, and wrong types never trigger defaults. Defaults
are not stored. `push(key, value)` and `prepend(key, value)` mutate an existing
array or create a missing one, rejecting existing non-arrays.

Dot paths traverse only own properties of plain objects (including null-prototype
objects). Arrays and class instances are leaves. Empty keys/segments and
`__proto__`, `prototype`, and `constructor` segments are rejected. Writes create
missing intermediate objects; all operations throw when traversing an existing
non-plain-object intermediate, rather than overwriting it or silently falling
back. Path validation completes before mutation.

Construct with only `new Application({ basePath })`. The normalized absolute
starting path is immutable; workspace and Blueprint source roots are separate
instance values bound during bootstrap. Do not read ambient cwd in services.
The executable alone supplies cwd as the base path.

`Application` extends `Container`; it has no separate `app.container` or
delegated resolver methods. Import `Container`, `Key`, and `Factory` from
`@/foundation/Container`. Keys are strings or actual class constructors.
Constructor keys normalize to their runtime `.name`, so class names must be
stable and unique within an application; an explicit string key with the same
name shares that normalized key. JavaScript cannot distinguish a named class
declaration from a named class expression at runtime, so use uniquely named
classes rather than relying on fabricated module metadata. Unnamed classes and
non-class function/object keys are rejected.

`app.bind(key, factory)` registers a transient; `app.singleton(key, factory)`
registers a shared value; `app.instance(key, value)` supplies an existing value.
Service constructors may omit factories, defaulting to construction with the
owning application. Ordinary constructors require explicit factories.
Constructor-key factories and instances are checked against the class type.
String-key factories infer their result for type checking at registration, while
`app.make(string)` deliberately returns `Promise<unknown>`; class-key
`app.make(Class)` preserves `Promise<Class>` inference. Factories may return
values or promises. `await app.make(key)` requires an explicit binding and
automatically boots only Service instances before returning. Supplied Service
instances must already be booted. Duplicate bindings of any kind throw, and
`app.bound(key)` checks all registration kinds.

`app.value(key)` returns `unknown` and permits synchronous access only to
instance bindings. The application stores `path.base`, `path.workspace`,
`path.blueprints`, `console.invocation`, and `console.args` under those string
keys. Application path getters validate that path values are strings, and
`LoadConsoleArgs` validates invocation shape before copying it into a Repository.
There are no `get`/`create` resolver methods or global containers. Singleton
initialization coalesces and can retry after failure; dependency cycles are
detected even across concurrent shared initializations.

`app.register(ProviderClass)` constructs and registers each provider once, queuing
its instance for boot. Register before calling `app.boot()`; there are no phase
gates. Boot hooks run sequentially, sharing and caching success or failure.
Configuration is available before provider construction.

`Application.configure(basePath, providers = [])` returns a fluent
`ApplicationBuilder` preconfigured with `withKernels()` and `withProviders()`.
`create()` returns the application. Kernel is an ordinary explicitly registered
singleton; `make(Kernel)` never boots it. Repeated `withKernels()` on the same
builder is idempotent, while duplicate container registration still throws.
`withProviders()` delegates to `RegisterProviders.merge(list)`, which replaces a
process-global ordered deduplicated nullish-filtered provider selection, not an
application container. Builder configuration replaces previous selection; tests
must reset it with `RegisterProviders.merge([])`.

The extendable Kernel's protected `bootstrappers()` defaults to
`[LoadConsoleArgs, DiscoverGitRoot, ResolveBlueprintSourceRoot, RegisterProviders]`.
Override the ordered list directly; it is not normalized.
Bootstrappers are independent of Service and implement asynchronous or synchronous
hooks. `app.bootstrapWith(list)` captures the first list and sequentially constructs
and awaits hooks, sharing one cached result across kernels.
`hasBeenBootstrapped` is true only after complete success. Failure remains cached
and prevents partial provider boot through Kernel.

`await kernel.boot(invocation)` first supplies the validated `ConsoleInvocation`
value, then bootstraps and boots providers. Commander alone parses raw arguments;
dispatch constructs the application only after parsing and command validation,
then resolves Kernel, boots the invocation, resolves the command and runs its
operation. Help/version/invalid arguments require no Application or Git.
`LoadConsoleArgs` binds a Repository with `raw`, `script`, `commandPath`,
`options`, and `positionals`; it never reparses or reads `process.argv`.
The `ConsoleInvocation` type lives in `@/foundation/ConsoleInvocation`.

The production provider explicitly registers command, reconciliation and
installation singletons, plus transient computed-context services.
Source subprocess fixtures set `TSX_TSCONFIG_PATH` to the repository tsconfig.
Compilation uses Bundler resolution and `tsc-alias` rewrites full `.js` paths so
the emitted ESM runs with Node. Build validation must include the packaged CLI
and preserved Blueprint/setup-project assets, not only source tests.

See [ADR 0004](../adr/0004-application-owned-services.md) for lifecycle rationale.
