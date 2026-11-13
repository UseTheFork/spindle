---
status: accepted
---

# Separate subagent-driven development, Git, and Project Settings

ADR-0011 replaces this decision's caller-owned integration and shared-checkout
assumptions; the context ownership boundaries remain applicable.

The SDD CLI grammar remains unchanged, including positional `review require`,
ticket and delivery scope selectors, and caller-owned integration commits.
`SubagentDrivenDevelopmentServiceProvider` explicitly binds operation commands
and focused services as application singletons. Commands own Commander schemas
and delegation, while reusable command groups contain no workflow logic.
There is no legacy `SddCommand`, compatibility facade, or shared workflow base.

The context is organized into `Commands`, `Services`, `Persistence`, `Evidence`,
`Policies`, and `Models`. Feature creation and inspection, ticket records and
triage, assignments and corrections, checks and review, findings and requirements,
acceptance and integration, and delivery remain separate operations.
Dependencies flow through explicitly typed constructor injection, not dynamic
resolution proxies or circular references.

`WorkspaceTransaction` owns one ticket/delivery mutation boundary: acquire the
workspace lock, recover pending writes before executing the operation, journal
coordinated ticket/ledger writes, atomically replace files, and release ownership
on success or failure. Ledger schema validation and ticket reading are distinct
components, but do not introduce independent transactions. Feature creation
retains its separate creation lock and atomic staging publication protocol.
`ReadinessReader` owns stable read observations, and `ReadinessPolicy` evaluates
dependency and current-evidence gates without changing workspace state.
Persisted schemas, lock and journal formats, file modes, stale evidence checks,
ownership, idempotency, and path-safety behavior are unchanged.

Git repository discovery and process execution belong to the reusable
`GitService`, registered by `GitServiceProvider`. Binary output, exit statuses,
and caller-supplied process options are preserved; SDD content identities,
reports, inventories, and commit-evidence verification remain in SDD Evidence.
Git registration does not perform repository discovery.

This decision updates ADR-0004's constructor-provider exception and adds a
Project Settings bootstrap adapter. The Project Settings schema and reusable
operations belong to `src/Settings`; Foundation retains the adapter so the
snapshot loads before external provider registration. Application registers
Foundation and Git providers during construction. The default Kernel order is
`LoadConsoleArgs`, `DiscoverGitRoot`, `LoadProjectSettings`,
`RequireProjectSettings`, `RegisterProviders`. Git is therefore resolvable before
final provider registration, and Project Settings are available to external
providers. Blueprint assets derive from
`Application.assetsPath("Blueprints")`.

`settings.project` contains a discriminated absent, valid, or invalid snapshot of
`.github/spindle.json`. It is not the mutable `app.config` repository. Project
Settings operations are shared through the Settings context. Consumers use the
boot-bound snapshot rather than rereading the file, and successful writes refresh
that snapshot. The current schema, defaults, and resolved-state contract are
defined in [ADR-0012](./0012-resolved-project-settings.md). Update requires valid
Project Settings. Init accepts valid Project Settings with no selected Stacks and
preserves other fields while installing selected Blueprints. A successful
`spindle init` then initializes project guidance and the tooling registry. Project
initialization validates and preserves Project Settings. SDD does not require
valid Project Settings.

Tests mirror the SDD context and use typed direct services for workflows and
extracted boundaries. CLI subprocesses remain for executable parsing,
interruption, and competing-process behavior. All pre-extraction cases are
retained; focused Git/Project Settings/application and mirrored SDD selectors are
the verification boundary, not the whole repository suite.
