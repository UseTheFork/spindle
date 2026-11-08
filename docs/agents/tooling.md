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
- `pnpm exec vitest run tests/sdd/*.test.ts` - Run only the migrated SDD workflow tests.
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

Supply an optional readonly array of provider constructors in `ApplicationOptions.providers`.
The application constructs its own fixed provider instances immediately, passing
itself to each constructor. `app.registerProviders()` synchronously registers all
providers once, in supplied order. Registration success and failure are distinct
states: failures are cached and rethrown without retry, including non-Error thrown
values. Reentrant registration is explicitly rejected.

Import the extendable `Kernel` from `src/foundation/Kernel.ts`. It holds a
`public readonly app` reference. Its protected `bootstrappers()` returns
`[RegisterProviders]` by default; override it to choose an ordered readonly
constructor list. `Bootstrapper` and `BootstrapperConstructor` live in
`src/foundation/bootstrap/Bootstrapper.ts`; `RegisterProviders` lives alongside
them. Bootstrappers are independent of `Service`, take no required constructor
arguments, and implement `bootstrap(application): void | Promise<void>`.

`await kernel.bootstrap()` delegates to `app.bootstrapWith(list)`. The first call
captures the list, directly constructs each bootstrapper, and awaits each hook
before constructing the next. Execution starts on a microtask, allowing concurrent
and non-awaited reentrant calls to share one initialization. State belongs to the
application, not the kernel: later calls, even from another kernel with a different
list, reuse that first result. `app.hasBeenBootstrapped` becomes true only after
every hook succeeds; failures stay cached without retry and leave it false.
An empty bootstrap list succeeds but does not register providers.

`await kernel.boot()` first awaits bootstrap completion, then calls `app.boot()`.
Application boot only awaits provider boot hooks sequentially, after registration
has completed; it never registers providers itself. Calls before or during
registration explicitly reject without poisoning a later valid boot. After failed
registration they reject with the cached registration failure. Valid boot calls
share one initialization and cache success or failure without retry. A provider
boot failure does not undo successful bootstrap completion. Omitting providers or
supplying an empty array is valid, but still requires registration before boot.
Direct callers may register providers and boot without using a kernel.

This lifecycle does not add command dispatch, environment/configuration loading,
or handle/terminate hooks. Existing CLI command execution remains unchanged.

`app.get(ServiceType)` still shares a booted singleton per application, and
`app.create(ServiceType)` still boots a fresh instance. Service initialization
marks `isBooted` only after successful boot and rejects dependency cycles;
failed singleton service initialization can retry on a later `get` call,
independently of the one-shot application provider lifecycle.
