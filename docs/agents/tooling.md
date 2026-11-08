# Project Tooling

Run project build, test, lint, formatting, and Spindle workflow commands through Just. Recipes select the project directory and forward their arguments.

## Build

- `just build` — Rebuild the Blueprint bundle from current sources and compile the CLI, removing stale bundled files.

## Linting

- `just lint::check *args` — Check files without modifying them.
- `just lint::lint *args` — Apply lint fixes.

## Formatting

- `just format::format *args` — Format files.

## Type checking

- `just test::types` — Type-check without emitting files.

## Tooling

- `just tool::git *args` — Run Git in the repository root.

## Testing

- `just test::test *args` — Run all TypeScript tests when no paths are supplied; otherwise run the selected Node tests through tsx.
- Focused tests: `just test::test tests/<name>.test.ts`
- Issue-management CLI tests: `just test::test tests/sdd-issues.test.ts`
- `just test::coverage *args` — Run Node tests with coverage.

## Spindle workflows

These recipes run the Spindle CLI from source through `pnpm run spindle` in the repository root. Pass paths as absolute paths.

- `just spindle::init *args` — Install project Blueprints.
- `just spindle::update *args` — Update installed project Blueprints.
- `just spindle::sdd create --title <title> --author <author> [--require-retrospective]` — Create a numbered feature workspace with its initial spec and policy ledger.
- `just spindle::sdd status --spec <absolute-spec-path>` — Read a feature's recorded policy and progress without modifying it.
- `just spindle::run sdd issue create --spec <absolute-spec-path> --title <title> --reporter <reporter> --category <category> --author <author>` — Create a per-feature `I-0001` Markdown issue (`bug` or `enhancement`).
- `just spindle::run sdd issue update --spec <absolute-spec-path> --issue <id> --author <author> [--title <title>] [--reporter <reporter>] [--blocked-by <id...>] [--clear-blocked-by]` — Update descriptive metadata and dependencies; the two dependency options are mutually exclusive.
- `just spindle::run sdd triage --spec <absolute-spec-path> --issue <id> --status <status> --category <category> --details <text> --author <author>` — Record an attributed triage decision using a supported status and category.
- `just spindle::run sdd issue comment --spec <absolute-spec-path> --issue <id> --details <text> --author <author>` — Append an attributed comment.
- `just spindle::run sdd ready --spec <absolute-spec-path>` — Inspect unclaimed, triage-eligible issues and dependency blockers.
- `just spindle::run sdd claim --spec <absolute-spec-path> --issue I-0001 --author <controller>` — Claim a ready issue only from a clean Git checkout and record its baseline.
- `just spindle::run sdd implement --spec <absolute-spec-path> --issue I-0001 --author <controller>` — Persist and return an implementation assignment with its durable report path; does not launch an agent.
- `just spindle::run sdd correct --spec <absolute-spec-path> --issue I-0001 --findings F-0001 --details <objective> --author <controller>` — Persist an issue-scoped correction attempt and fix assignment. Later attempts require `--decision continue --assessment <progress> --assessment-result productive`; adjudication pauses use `--decision pause --reason <reason>`. Does not launch an agent.
- `just spindle::run sdd submit --spec <absolute-spec-path> --issue I-0001 --role implementation --report <assigned-report-path> --author <controller>` — Validate and register the assigned report. `--unavailable --details <reason>` records missing worker output as pending.
- `just spindle::run sdd review --spec <absolute-spec-path> --issue I-0001 --inventory <json-array> --author <controller>` — Freeze the controller-confirmed Git inventory and persist initial reviewer assignments after current checks pass.
- `just spindle::run sdd review require --spec <absolute-spec-path> --issue I-0001 --agent <catalog-agent> --details <objective> --author <controller>` — Pin one justified specialist before review; only known agents with `canReview: true` qualify, and the controller separately confirms harness callability.
- `just spindle::run sdd finding create --spec <absolute-spec-path> --issue I-0001 --source <assigned-review-report> --snapshot <snapshot> --severity <high|medium|low> (--blocking|--non-blocking) --summary <text> --details <text> --author <controller> [--link F-0001]` — Register a canonical finding, or explicitly link a duplicate observation while retaining report provenance.
- `just spindle::run sdd finding update --spec <absolute-spec-path> --issue I-0001 --finding F-0001 --status <open|confirmed|fixed|dismissed|deferred> --author <controller> [--evidence <current-snapshot>] [--details <text>] [--follow-up <reference>] [--requirements-decision R-0001]` — Record an attributed disposition; fixed requires passing checks on the current snapshot, which must differ from every observation snapshot; dismissal requires rationale, and deferral requires rationale plus follow-up.
- `just spindle::run sdd requirements decide --spec <absolute-spec-path> --issue I-0001 --finding F-0001 --decision <approved|rejected> --details <text> --author <controller>` — Record a requirements decision; approval invalidates prior review coverage and requires a fresh review.
- `just spindle::run sdd submit --spec <absolute-spec-path> --issue I-0001 --role review --assignment <id> --report <assigned-report-path> --result <passed|failed|unavailable> [--findings F-0001 F-0002 | --no-findings] [--details <text>] --author <controller>` — Declare the complete canonical findings list or exclusively attest no findings; all results require a declaration, and failed/unavailable results also require details.
- `just spindle::run sdd accept --spec <absolute-spec-path> --issue I-0001 --author <controller>` — Accept only with current passing checks, complete passing initial review coverage, and no unresolved blocking findings.
- `just spindle::run sdd integrate --spec <absolute-spec-path> --issue I-0001 --author <controller>` — Return the exact accepted-file inventory and pending delivery records without changing Git.
- `just spindle::run sdd integrate --spec <absolute-spec-path> --issue I-0001 --commit <sha> --author <controller>` — Verify an existing caller-created commit and record integration; commit returned delivery records separately before another claim.
- `just spindle::run sdd resume --spec <absolute-spec-path> --issue I-0001 --author <controller>` — Restore the recorded gate and assignment; a changed owner must confirm stopped editing with `--confirm-handoff`.
- `just spindle::run sdd next --spec <absolute-spec-path>` — Read-only permitted actions, pending assignments, registered findings, requirements decisions, and blockers.
- `just spindle::run sdd status --spec <absolute-spec-path>` — Read-only expanded feature state, actions, pending assignments, registered findings, requirements decisions, and blockers.
- `just spindle::setup-project --workspace <absolute-project-root>` — Bootstrap missing project documentation defaults.
- `just spindle::run *args` — Run any other Spindle CLI command with arbitrary arguments.
- Append `--help` to any recipe to see the command's options, for example `just spindle::sdd create --help`.

`sdd create` allocates an ID-based directory under `.scratch/` in the
discovered Git checkout. `sdd status` requires an explicit spec path inside
that checkout. Historical dated workspaces are not migrated. `setup-project`
continues to use its explicit `--workspace` target, which may differ from the
invocation repository root.

## Application services

The executable bootstrap is the only production code that reads the current
directory, and only to discover the Git working-tree root. Workspace commands
require that discovery; help and version do not. Commands and services use the
immutable workspace and Blueprint source roots supplied to `App`.

Application-managed commands and services extend `Service` and receive their
owning `App` in the constructor. Constructors only store the application and
initialize ordinary fields; resolve dependencies and perform asynchronous
initialization in `boot()`. Call `app.get(ServiceClass)` for an application-local
singleton or `app.create(ServiceClass)` when a fresh instance is required. Both
await initialization before returning the instance.

Keep mutable operation data out of long-lived services. In particular,
reconciliation creates a fresh computed-context service per run; its Config and
memoized values must not leak into later runs. Migrate consumers and tests to
the current service classes and focused utility modules directly; do not restore
replaced workflow-function exports or compatibility adapters.
