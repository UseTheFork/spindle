# Application-owned services and immutable project roots

Reporter: unknown
Category: enhancement
Status: ready-for-agent

## Problem Statement

Spindle's application composition is spread across modules exporting multiple
functions, including a large executable entrypoint and installation helpers.
Maintainers want cohesive classes with a consistent construction contract,
application-owned dependencies, and explicit instance lifetimes rather than
continuing to expand these function-based modules.

Project paths also depend on ambient working-directory state. Invoking Spindle
from a nested directory does not guarantee that it targets the repository root.
Moving to long-lived services must not introduce shared Config, stale Computed
Variables, or cross-project writes.

## Solution

Introduce an application class that owns all CLI command and workflow services,
supplies immutable project and Blueprint source roots, and constructs services
through a shared base-class contract. Commands and services receive the
application rather than inheriting from it.

Provide asynchronous singleton and fresh-instance resolution, with a consistent
asynchronous boot lifecycle and explicit initialization failures. Move commands
into their own folders and pure utilities into focused files in a dedicated
utilities folder. Migrate imports and tests directly, without retaining old
function exports as compatibility adapters.

Discover the Git working-tree root before CLI workspace operations. Preserve
existing command behavior except for this intentional root-targeting change;
help and version remain usable without a Git repository.

## User Stories

1. As a maintainer, I want one application class to compose Spindle, so that ownership of commands and dependencies is explicit.
2. As a maintainer, I want a thin executable bootstrap, so that importing the application does not execute the CLI.
3. As a maintainer, I want every existing command to use the application structure, so that there are no parallel construction architectures.
4. As a maintainer, I want Init and Update to be separate classes in their own folders, so that each workflow has a clear home.
5. As a maintainer, I want shared installation and Blueprint reconciliation behavior in services, so that commands do not duplicate that behavior.
6. As a maintainer, I want computed-variable resolution included in the refactor, so that deeper workflows follow the same ownership model.
7. As a maintainer, I want existing Computed Variable provider classes retained, so that their established Config-based rendering contract is preserved.
8. As a maintainer, I want pure utilities to remain functions in focused files, so that stateless helpers do not become artificial services or another oversized module.
9. As a service author, I want a shared base class with an application constructor, so that all application-managed services follow one dependency contract.
10. As a service author, I want an empty asynchronous boot hook by default, so that services needing no initialization require no special handling.
11. As a service author, I want boot to run after derived fields initialize, so that initialization can safely use those fields.
12. As a service author, I want to await dependencies during boot, so that constructors do not perform asynchronous or operational work.
13. As a caller, I want asynchronous singleton resolution, so that repeated requests within one application share a fully initialized service.
14. As a caller, I want asynchronous fresh-instance creation, so that operation-scoped services do not share mutable state.
15. As a caller, I want concurrent singleton requests to share initialization, so that services are not constructed or booted redundantly.
16. As a caller, I want a read-only boot-completion flag, so that initialization success is observable without allowing callers to mark an uninitialized service ready.
17. As a caller, I want initialization errors propagated, so that a broken dependency is never returned as a usable service.
18. As a maintainer, I want circular dependencies reported with their chain, so that initialization fails diagnostically instead of hanging or returning partial instances.
19. As a test author, I want separate applications to own separate singleton instances, so that tests do not leak service state.
20. As a programmatic caller, I want to provide an explicit immutable root, so that application behavior does not depend on later working-directory changes.
21. As a maintainer, I want Blueprint source paths owned by the application, so that services use a consistent source root.
22. As a CLI user, I want commands invoked from nested directories to target the Git working-tree root, so that Spindle manages the intended project.
23. As a CLI user, I want failed Git-root discovery reported explicitly, so that Spindle never silently writes to a fallback directory.
24. As a CLI user, I want help and version outside a Git working tree, so that informational commands remain accessible.
25. As a CLI user, I want existing arguments, prompts, output, and Blueprint behavior preserved except for agreed root discovery, so that the structural refactor does not unexpectedly change workflows.
26. As a Blueprint author, I want Computed Variables evaluated against the current run's resolved Config, so that previous runs cannot contaminate generated content.
27. As a Blueprint author, I want repeated context requests within one run to share computed values, so that existing evaluation semantics remain stable.
28. As a maintainer, I want preparation-before-application reconciliation guarantees preserved, so that this refactor does not introduce partial writes during preparation failures.
29. As a test author, I want direct imports migrated to the new APIs, so that tests exercise the actual architecture rather than obsolete adapters.
30. As a release maintainer, I want the packaged executable to retain the same application behavior, so that source-mode success also holds for distributed Spindle.
31. As a maintainer, I want observable-behavior tests at the CLI, application, and existing workflow seams, so that coverage survives internal reorganizations.

## Implementation Decisions

- The requirements source is the agreed conversation, including the clarification
  that Git-root discovery is mandatory and the confirmed testing seams.
- Introduce `App` as the application composition and execution surface. Keep
  executable startup separate so application imports have no CLI side effects.
- Apply this structure to all existing CLI commands, including project setup and
  SDD workflows, not only Init and Update. Preserve the meaning of existing
  explicit command path arguments; do not silently reinterpret them as the
  bootstrap discovery directory.
- Init and Update become separate classes in their own folders. Shared
  installation, Blueprint reconciliation, and computed-variable resolution are
  included rather than leaving command classes as adapters around old workflow
  functions.
- Application-managed children inherit a shared service base class, not `App`.
  The base constructor accepts and stores the owning application. Constructors
  do not resolve dependencies, initiate asynchronous work, or run workflows.
- The base class supplies an empty asynchronous `boot(): Promise<void>`.
  Overrides also use this asynchronous contract.
- `App` constructs an instance completely before invoking its boot hook.
  Dependencies may be resolved during boot using the owning application.
  Operational work runs only after successful initialization.
- The shared base exposes a read-only `isBooted` flag. The application manages
  boot completion and checks it to avoid reinitializing a successfully booted
  instance. The flag is set only after boot succeeds, not when boot starts.
- `get(Service)` always returns a promise for the same successfully initialized
  instance within one application. Concurrent requests share the same in-flight
  initialization. No caller receives a partially initialized instance.
- `create(Service)` always returns a promise for a fresh instance, using the
  same construction and boot contract without adding it to the singleton cache.
- Singleton identity and initialization state are application-local, not static
  or process-global. Separate applications never share managed instances or
  cached Config.
- Boot failures reject the requesting operation and do not leave a failed
  instance available as a usable singleton. Ordinary concurrent callers must
  not be mistaken for circular dependencies.
- Circular construction or boot dependencies fail explicitly with a diagnostic
  dependency chain rather than causing unbounded recursion, deadlock, or
  partially initialized instance exposure. This applies to dependency
  resolution through both singleton and fresh-instance construction.
- The application owns immutable workspace and Blueprint source roots.
  Programmatic callers and tests can supply roots explicitly. Preserve packaged
  Blueprint lookup and the existing Blueprint source override behavior, but
  resolve source ownership at the application boundary.
- Only the executable bootstrap may read the current directory, solely as the
  starting point for Git working-tree root discovery. The application, commands,
  services, and utilities use application-owned roots rather than independently
  calling `process.cwd()`.
- CLI workspace operations require successful discovery of the Git working-tree
  root. Missing Git, an unsuccessful discovery command, and execution outside a
  working tree produce explicit errors with no current-directory fallback.
  Nested-directory invocation targets the discovered root.
- Help and version bypass workspace discovery because they do not operate on a
  project.
- Keep per-run mutable data outside long-lived services. In particular,
  computed-context resolution has a fresh context/cache per reconciliation
  rather than caching the first Config or its values on an application-wide
  installation singleton.
- Within a run, preserve existing computed-context memoization, including
  concurrent requests. Across runs, resolve fresh Config-derived values.
  Existing provider classes and their read-only resolved Config contract remain.
- Pure helper functions remain standalone, in focused utility files under a
  dedicated utilities folder rather than one large catch-all module. Types and
  constants need not become classes merely to eliminate function exports.
- Update all affected production imports, test imports, executable wiring, and
  directly related documentation. Remove replaced workflow exports instead of
  maintaining compatibility adapters.
- Preserve the shared Blueprint lifecycle, typed catalog selection, rendering,
  conflict and update policies, selected-directory membership cleanup, and
  preparation-before-application semantics. Preparation failures leave the
  project unchanged; application-time filesystem failures remain explicit and
  do not acquire a new rollback guarantee.
- Preserve existing CLI behavior, including prompts, options, output, and
  packaged execution, except for the explicitly agreed Git-root targeting and
  outside-repository failure behavior.
- Use the project's existing Just recipes for validation; no dependency
  injection framework or additional testing tool is required by this design.

## Testing Decisions

- The user confirmed three seams: existing CLI integration tests, the public
  application API, and existing workflow tests. Prefer these over adding
  separate seams for every new class.
- Good tests assert observable results: returned identity and readiness, rejected
  promises and diagnostics, output and exit status, generated files, Config
  contents, and absence of unintended writes. Do not assert private fields,
  private cache structures, or incidental internal call sequences.
- At the application API, use small fixture services to verify singleton
  identity, distinct fresh instances, async initialization completion, derived
  field availability during boot, and the public read-only readiness contract.
  Verify successful instances are not rebooted on repeated retrieval.
- Verify concurrent singleton requests share construction and initialization
  and all wait for readiness. Include concurrent non-cyclic requests so cycle
  detection cannot reject legitimate sharing.
- Verify rejected boot promises surface the underlying failure and never expose
  a failed instance as ready. Verify circular dependencies reject with a useful
  chain instead of hanging, including paths involving fresh-instance creation.
- Verify separate applications do not share singleton instances, roots, Config,
  or generated results. Supply explicit roots in programmatic tests.
- Reuse existing subprocess CLI helpers and command integration coverage.
  Workspace-operation fixtures must be real temporary Git working trees rather
  than accidentally inheriting the surrounding repository's root. Keep
  deliberately non-Git fixtures for failure and informational-command cases.
- Verify invocation from both the Git root and a nested directory manages the
  same root destination and creates no unintended nested project output.
  Verify missing Git and failed root discovery produce explicit failures with
  no workspace mutation.
- Verify help and version remain successful outside Git, including when Git is
  unavailable.
- Retain coverage for every existing command, including setup and SDD command
  paths, and packaged CLI execution. Update fixtures affected by the new
  mandatory Git-root behavior without weakening their original assertions.
- Migrate existing direct-import workflow tests to the new APIs rather than
  retaining old exports to satisfy them. Reuse existing installation, rendering,
  reconciliation, and Computed Variable tests as prior art.
- Preserve existing computed-resolution assertions: one evaluation per run,
  concurrent/repeated context sharing, fresh evaluation across runs, read-only
  Config inputs, and provider error reporting. Exercise repeated runs through
  one application so service lifetime changes cannot introduce stale caches.
- Preserve existing coordinated-preparation, cleanup, removal, and update-policy
  tests, including no mutation after preparation failure.
- Run focused tests during implementation, then the complete existing test
  suite, type check, lint/format checks, and build through the established Just
  recipes because the refactor changes repository-wide imports and packaged
  entrypoint wiring.

## Out of Scope

- Compatibility exports or adapters for replaced internal workflow functions.
- Converting every type, constant, pure utility, or Computed Variable provider
  into an application-managed service.
- Process-global singleton registries or shared mutable Config across
  applications.
- New Blueprint kinds, catalog schema changes, template-language changes,
  Config migrations, or changes to Computed Variable output.
- New CLI features or prompt redesign beyond the agreed root-discovery change.
- A third-party dependency injection framework, general-purpose plugin
  container, teardown framework, or configurable lifetime hierarchy.
- Automatic creation of Git repositories or fallback to non-Git workspace
  discovery.
- Transactional rollback for application-time filesystem failures.
- Unrelated repository cleanup.

## Further Notes

- The architecture discussion is recorded in
  [the proposed application-owned services ADR](../../docs/adr/0004-application-owned-services.md).
  This spec captures the conversation as its requirements source; the ADR is
  supporting context, not a separately selected design input.
- Existing lifecycle and catalog ADRs describe Blueprint behavior that this
  structural refactor must preserve. Their existing proposed/supersession
  statuses are not changed by this spec.
- Application, singleton, service, and boot are general programming concepts,
  not new Spindle domain terms; no glossary entries are needed for them.
- Mandatory Git-root discovery is an intentional behavior change, not merely
  internal restructuring, and needs directly related user documentation.
- Exact service names, internal container data structures, and folder naming
  beyond the agreed boundaries remain implementation choices. Failed
  initialization must remain explicit and never yield a ready instance; this
  spec does not promise automatic retry or a public reset API.
- No unresolved requirement blocks implementation.
