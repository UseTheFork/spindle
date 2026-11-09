# Project Tooling

Run project commands through Just from the repository root. Recipes select the
repository working directory. Replace `<args>` with optional command arguments.

## Build

- `just build` - Rebuild the Blueprint bundle from current sources and compile the CLI, removing stale bundled files.

## Linting

- `just lint check <args>` - Check files without modifying them.
- `just lint lint <args>` - Apply lint fixes.

## Formatting

- `just format format <args>` - Format files.
- `just format check <args>` - Check formatting without modifying files.

## Type checking

- `just tool pnpm exec tsc --noEmit` - Type-check production sources without emitting files.
- `just tool pnpm exec tsc --noEmit -p tests/tsconfig.sdd.json` - Type-check mirrored SDD, Foundation, Git, Config, and Git-root integration tests.
- `just tool pnpm exec tsc --noEmit -p tests/tsconfig.assets-project-setup.json` - Type-check BlueprintManagement, ProjectSetup, Foundation, and related tests.

## Tooling

- `just tool git --no-pager <args>` - Run Git without an interactive pager.
- `just tool git --no-pager status --short --branch` - Inspect repository status.
- `just tool git --no-pager diff --no-ext-diff` - Inspect unstaged changes.
- `just tool git --no-pager diff --cached --no-ext-diff` - Inspect staged changes.
- `just tool git ls-files --others --exclude-standard` - List untracked files.

## Testing

- `just tool pnpm exec vitest run <explicit-files>` - Run selected Vitest tests once.
- `just tool pnpm exec vitest run tests/Foundation/app.test.ts tests/Foundation/bootstrap.test.ts` - Run application composition and bootstrap tests.
- `just tool pnpm exec vitest run tests/SubagentDrivenDevelopment/Services/create.test.ts tests/SubagentDrivenDevelopment/Services/status.test.ts` - Run initial feature workflow tests.
- `just tool pnpm exec vitest run tests/SubagentDrivenDevelopment` - Run all mirrored SDD tests, without selecting unrelated repository tests.
- `just tool pnpm exec vitest run tests/Git/git-service.test.ts tests/Config/project-configuration.test.ts tests/integration/GitRoot.test.ts tests/BlueprintManagement/Commands/update.test.ts tests/BlueprintManagement/Commands/init.test.ts` - Run explicitly impacted Git, project configuration, and installation commands.
- `just tool pnpm exec vitest run tests/integration/PackagedCli.test.ts` - Run the packaged CLI smoke tests after `just build`.
- `just tool pnpm exec vitest <explicit-files>` - Watch selected tests during local development.
- `just tool pnpm exec vitest run --coverage <explicit-files>` - Collect selected-test coverage; requires a compatible Vitest coverage provider.

## Spindle workflows

- `just tool pnpm run spindle <args>` - Run the CLI from source with arbitrary arguments.
- `just tool pnpm run spindle init <args>` - Install project Blueprints.
- `just tool pnpm run spindle update <args>` - Update installed project Blueprints.
- `just tool pnpm run spindle sdd <args>` - Run subagent-driven development workflow commands.
- `just tool pnpm run spindle setup-project <args>` - Bootstrap missing project documentation defaults.

Pass workspace and spec paths as absolute paths. Append `--help` to inspect
command options, for example `just tool pnpm run spindle sdd create --help`.

## Application services

Import `Application`, `ApplicationOptions`, and service/provider constructor types
from `src/Foundation/Application.ts`, `Service` from
`src/Foundation/Service.ts`, and the abstract `ServiceProvider` from
`src/Foundation/ServiceProvider.ts`. There are no compatibility exports or old
`src/app.ts` module.
Workspace and Blueprint roots and service/provider ownership are getter-only; backing
references use TypeScript `private readonly` visibility.

Each application owns an initially empty `public readonly config`, a `Config`
from `src/Config/Config.ts`, available before provider construction. Its mutable
contents are isolated between applications. This is Application Configuration,
not the project's `.github/spindle.json` Config; there is no settings constructor
argument or persistence for Application Configuration. After Git discovery,
`LoadProjectConfiguration` separately binds `config.project` as an absent,
valid, or invalid snapshot containing original project data/error. Loading does
not rewrite Config, inject defaults, deduplicate Stacks, or discard unknown fields.
Unexpected I/O errors propagate. Update requires a valid snapshot; init still
rejects an existing malformed Config as already existing. SDD and setup-project
do not require valid Config.

`Config` extends the self-contained `Repository` from `src/Support/Repository.ts`.
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

Use `app.basePath(path = "")` (a method, not a property) for the invocation
starting path, `app.path(path = "")` for the discovered Git workspace root,
and `app.appPath(path = "")` for the module-relative installation directory
(`src/` when running from source, `build/` in the compiled package, not the Git
root). `path()` throws until the workspace root is bound.
All return strings and use `app.joinPaths(basePath, path = "")`: an empty suffix
preserves the base unchanged, an absolute suffix replaces it, and a relative
suffix uses Node's path join without resolving a relative base against cwd.

`Application` extends `Container`; it has no separate `app.container` or
delegated resolver methods. Import `Container`, `Key`, and `Factory` from
`@/Foundation/Container`. Keys are strings or actual class constructors.
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
Abstract class keys support typed instance bindings and resolution, but do not
permit implicit construction.
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
keys. Workspace and Blueprint root getters validate that path values are strings, and
`LoadConsoleArgs` validates invocation shape before copying it into a Repository.
There are no `get`/`create` resolver methods or global containers. Singleton
initialization coalesces and can retry after failure; dependency cycles are
detected even across concurrent shared initializations.

`app.register(ProviderClass)` constructs and registers each provider once, binds
its declared commands as singletons, and queues its instance for boot. Command
class identities repeated across declarations are bound once; conflicting class
names still fail container registration. Register before calling `app.boot()`; there are no phase
gates. Boot hooks run sequentially, sharing and caching success or failure.
Configuration is available before provider construction.
The constructor first binds itself under `app`, `Application`, and `Container`,
preserving `path.base` and configuration availability. `FoundationServiceProvider`
and `GitServiceProvider` are registered in the constructor before the external
provider list. Git is available to `DiscoverGitRoot`, but registration does no
discovery. Both providers participate in the same register-once and queued boot lifecycle.

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
`[LoadConsoleArgs, DiscoverGitRoot, LoadProjectConfiguration, ResolveBlueprintSourceRoot, RegisterProviders]`.
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
The `ConsoleInvocation` type lives in `@/Foundation/ConsoleInvocation`.

Providers declare command classes once in static `commands()`; the inherited
default is empty. Each class extends `Command` from `src/Commands/Command.ts`
and must satisfy `CommandConstructor`, including static
`register(program, createApp)` for its Commander schema and action. TypeScript
cannot enforce abstract static methods on the base class, so the constructor type
enforces this contract at declaration. A command may register a leaf or an entire
command group. Dispatch receives the provider classes used for bootstrap, includes
the foundation provider, and registers each distinct command schema before parsing
without constructing providers or an application. Dispatch snapshots that selection
on the application for bootstrap, so concurrent dispatches do not compete through
the builder's global provider selection. Conflicting Commander command
names fail during schema registration. Commands are automatically bound before
their provider's `register()` hook, which explicitly binds their dependencies.
`runExecutable` supplies `BlueprintManagementServiceProvider`,
`ProjectSetupServiceProvider`, and `SubagentDrivenDevelopmentServiceProvider` as
siblings in one provider list used
for both CLI schema discovery and application registration. The
ProjectSetup provider owns `SetupProjectCommand` and explicitly binds the
`ProjectSetupService` singleton. The Blueprint Management
provider owns `init` and `update`, and registers reconciliation and installation
singletons plus transient computed-context services. The SDD provider owns thin per-operation Commands
and explicitly injected singleton Services, Persistence, Evidence, and Policies
under `src/SubagentDrivenDevelopment/`. Git process execution lives in
`src/Git/Services/GitService.ts`; SDD-specific content and report verification stays
inside the SDD context. `WorkspaceTransaction.run` is the single issue/delivery
lock, recovery, journal, and atomic-write boundary.
`Commands/CommandOptions.ts` owns the cross-domain static `once` parser factory,
with a new closure for every schema registration. Blueprint-only conflict
choices and noninteractive options live in
`BlueprintManagement/Commands/BlueprintCommandOptions.ts`.
Shipped Blueprint metadata lives in `Assets/Blueprints/Catalog.ts`;
Blueprint Management owns its types, validation, and validated export used by
SDD. `Assets/SetupProject/Catalog.ts` declares relative source/destination pairs
for setup defaults. Build copies distributed content under `build/Assets/` and
leaves emitted catalog JavaScript intact.
Source subprocess fixtures set `TSX_TSCONFIG_PATH` to the repository tsconfig.
Compilation uses Bundler resolution and `tsc-alias` rewrites full `.js` paths so
the emitted ESM runs with Node. Build validation must include the packaged CLI
and preserved Blueprint/setup-project assets, not only source tests.

See [ADR 0004](../adr/0004-application-owned-services.md) for lifecycle rationale.
