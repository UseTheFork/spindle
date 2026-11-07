# Command-driven SDD

Status: Refined; awaiting shared-understanding confirmation

## Intent and success criteria

Move durable bookkeeping and mechanical gate enforcement out of the
subagent-driven development prompt and into explicit `spindle sdd` commands.
Keep the agent responsible for dispatch, execution, and judgment.

Success means:

- A new session can discover the next permitted action without reconstructing
  workflow state from conversation history.
- Commands reject invalid transitions, missing or stale evidence, unresolved
  blockers, and corrective continuation without recorded progress.
- The skill describes how to use the commands and exercise judgment rather
  than independently maintaining another execution ledger.
- Existing Markdown briefs, issues, reports, and user changes are preserved.
- The implementation remains a small local controller, not an issue-tracker
  platform or an agent execution runner.

## Confirmed user decisions

- Use a guarded workflow engine rather than only a tracker or a complete runner.
- Use a structured ledger as the authority for execution state; retain Markdown
  requirements and reports.
- `create` creates one versioned `sdd.json` ledger per feature, holding execution
  state, findings, recorded review policy, and history. Do not add a database,
  separate event files, or configurable storage backends.
- Retrospective is optional by default. Feature creation can explicitly require
  it; persist that decision in `sdd.json`. `finish` enforces the recorded
  requirement, rather than imposing a retrospective on every delivery.
  Use `create --require-retrospective`, storing `retrospectiveRequired: true`;
  omitting it stores `false`.
- Prefer explicit commands such as `claim`, `review`, `correct`, and `accept`
  over generic `begin` and `record` commands.
- Have SDD commands assign issue IDs and create Markdown issue files.
- New issues require a title, reporter, and category; do not silently invent a
  reporter value. Default status to
  `needs-triage`, execution to `unstarted`, and blockers to empty.
- Reporter is required as a free-form value, not a mandated account or handle.
- Commands that append comments or record decisions require an explicit
  `--author`; never infer attribution from reporter, Git, or an `unknown`
  default. Read-only commands do not require an author.
- `resume --spec ... --issue ... --author ...` restores the recorded next
  action and existing assignment without resetting findings, evidence, or
  corrective counters or silently dispatching another fix.
- Rethink the existing `spindle sdd workspace` command and its functionality
  to fit the command-driven workflow, rather than preserving its shape by
  default.
- Replace standalone report-path resolution with report destinations returned
  by the workflow commands that dispatch implementation or reviews, including
  scoped corrections and aggregate review.
- Use **issue** rather than **ticket** as the canonical term.
- Number issues with an `I-` prefix and zero-padded numeric component (for
  example, `I-0001`).
- Issue numbers restart within each feature workspace.
- Finding IDs use the `F-` prefix with zero-padding and restart within each
  issue.
- Cross-issue aggregate findings belong to delivery scope, with a separate
  `F-0001` sequence. Use `--scope delivery` instead of `--issue` for delivery
  findings and final corrections; keep their attempt history separate from
  issue corrections.
- Finding severity is a closed enum/type: `high`, `medium`, `low`. A separate
  boolean `blocking` determines whether an unresolved finding prevents
  acceptance; impact and acceptance policy are independent.
- Finding status is a closed enum/type: `open`, `confirmed`, `fixed`,
  `dismissed`, `deferred`.
- `confirmed` means the controller agrees the finding is valid; it remains
  unresolved and does not clear a blocking finding.
- `fixed` clears a blocking finding only after verification.
- `dismissed` means invalid, with an explanation required. `deferred` means
  valid work postponed, with rationale and follow-up required; it does not mean
  fixed. Remove `wontfix` from finding statuses, not from issue triage.
- A blocking finding cannot be deferred to bypass an acceptance criterion.
  Changing scope requires an explicit requirements decision and fresh review.
  Acceptance requires blocking findings to be verified fixed, dismissed as
  invalid, or covered by an approved and freshly reviewed scope change.
- Replace the five-issue-round and one-final-fix limits with progress-based
  continuation. Preserve attempt history for both scopes. Repeated failed fixes,
  recurring blockers, or requirements disagreements pause delivery for
  controller/user adjudication; never relax acceptance to end a retry loop.
- Triage category is a closed enum/type: `bug`, `enhancement`; triage status is
  a closed enum/type: `needs-triage`, `needs-info`, `ready-for-agent`,
  `ready-for-human`, `wontfix`.
- Execution state is a closed enum/type: `unstarted`, `claimed`, `implementing`,
  `reviewing`, `changes-requested`, `accepted`, `integrated`, `blocked`.
  Pending assignments distinguish reviewer responsibilities and phases.
- Roles are typed: `implementation` and `review`. At creation, store the
  built-in policy version and actual required roles for issue and full-spec
  review in the ledger. CLI updates must not silently change these requirements.
  No selectable standard/lightweight profiles or configurable profile system.
  `--scope delivery` identifies aggregate and
  final corrective work; the recorded gate distinguishes review phases.
  `final-review` and `final-fix-review` are not role values.
- `create` initializes the feature files and ledger and records review policy.
  Do not provide a separate `sdd init`; delivery starts with `claim`
  after issues have been created and triaged.
- Issue front matter's `blocked_by` is authoritative for dependencies. Commands
  validate issue references and reject cycles; the ledger does not maintain a
  second editable dependency list.
- `issue update` changes descriptive metadata and dependencies. Requirements
  and acceptance criteria remain directly editable Markdown; triage and
  execution changes use their dedicated workflow commands.
- Future role-set changes apply to new features via a new built-in policy
  version; active deliveries retain their recorded
  requirements.
- Default to one comprehensive independent reviewer covering requirements,
  correctness, regressions, tests, maintainability, and unnecessary complexity.
  Specialist review is added only for a justified risk, not required as a
  separate code-slop/code/task batch for every issue.
- Introduce a comprehensive SDD reviewer Agent Blueprint and update the SDD
  controller skill, assignment templates, references, and orchestrator agent
  access list to use it. Name it `sdd-reviewer`; it replaces the existing
  code, task, code-slop, and re-review agents for ordinary SDD work. Initial,
  corrective, and aggregate assignments select scope, not different default
  reviewer agents.
- Explicit specialist requirements may be added before review, but required
  reviewers cannot be silently removed mid-delivery. `review require` records
  the agent and specialist objective via `--details`, with explicit spec,
  issue/delivery scope, and author.
  Agent entries in `BlueprintCatalogDefinition` declare review eligibility.
  Use an agent-only `canReview?: boolean`; only explicit `true` is eligible.
  Omitted or `false` is ineligible. Do not introduce a broader capabilities
  system.
  The CLI validates registered reviewers against that catalog metadata; the
  controller separately confirms actual harness access before dispatch.
  For this feature, do not add agent lifecycle-status, stack-applicability, or
  installation checks. Eligibility validation requires a known catalog agent
  with `canReview: true` only.
  No-review delivery and weakening requirements to bypass findings remain out
  of scope.
- Give each feature workspace a repository-wide zero-padded numeric ID before
  its slug, omit the date, and have an SDD command create those directories.
- Allocate workspace IDs by scanning only directories matching the new ID-based
  naming pattern; ignore unrelated `.scratch` entries.
- Features are created in the originating checkout before any worktree for
  their delivery is created. Worktrees carry the existing feature ID rather
  than allocating another one. Cross-worktree feature allocation is not a
  supported workflow and needs no shared allocator.
- A temporary local creation lock in the originating checkout protects scanning
  and workspace directory creation from concurrent `create` invocations.
- Choose the next ID above the highest matching workspace directory. Avoid a
  separate sequence file.
- Do not add a workspace-deletion command or permanent ID registry. If a
  highest-ID workspace is manually deleted, later ID allocation may reuse its
  number.
- Do not add legacy dated-folder parsing or migration to the command scope.
- Use YAML front matter as the canonical metadata format for generated issue
  files; do not add legacy-format parsing, dual-format support, or migration.
- Keep the solution simple.
- Prefer Git's existing revision, diff, status, and file-inventory mechanisms
  over implementing equivalent repository logic.
- Require a clean Git working tree when claiming an issue. Reject pre-existing
  staged, unstaged, or untracked changes rather than capturing a dirty baseline;
  do not automatically commit, discard, or stash them.
- The clean-start requirement includes feature documents and ledger preparation
  changes. Commit creation and triage changes before claiming; the CLI does not
  commit automatically.
- No automatic staging or commits. `integrate` returns the accepted file
  inventory and delivery records requiring a caller-owned commit, or explicit
  errors when content or pending changes make integration unsafe.
- After the caller commits, `integrate --commit <sha>` verifies the existing
  commit's contents and records integration. This option never creates a
  commit. Commit any resulting delivery-record changes before claiming another
  issue.
- Review requires controller confirmation of the Git-derived change inventory.
  Reuse that frozen reviewed inventory for acceptance and integration; do not
  add a separate ownership registry or infer intent from filenames.
- Reuse option names consistently across commands for equivalent inputs,
  especially explanatory text and comments; avoid command-specific synonyms.
- Use `--summary` for short descriptions and `--details` for explanations,
  rationales, failures, and comment bodies. Do not add `--rationale` or `--body`
  aliases.
- Checks and review submissions share a closed `Result` enum and `--result`
  option: `passed`, `failed`, `unavailable`. Failed or unavailable results
  require `--details`.
- Use the illustrated command flow as the direction, not a finalized argument
  schema.

## Considered approaches

1. **Durable tracker:** ready queues, claims, and report records, with gates
   interpreted by the agent. Smaller implementation, but does not reliably
   prevent skipped gates or forgotten corrective attempts.
2. **Guarded workflow engine (selected):** persist workflow state and enforce
   mechanical prerequisites while agents execute work and adjudicate findings.
   Requires explicit evidence contracts, but addresses recovery and reliability
   without harness integration.
3. **Execution runner:** launch agents and checks and manage their lifecycle.
   More automation, but adds runtime integrations, cancellation, and recovery
   machinery outside the requested scope.

Beads inspires dependency-aware ready queues, durable claims, audit history,
and structured command output. This design does not adopt Beads as a dependency
or copy its broader storage and distributed-tracker architecture.

## Selected direction

### Storage and ownership

Use one versioned `sdd.json` ledger per feature workspace, created by `create`
beside the spec, with versioned JSON containing current state and an append-only
transition history. No database server, daemon, or separate event store.

The ledger records claims, delivery ownership, current
gate, snapshot identities, evidence references, findings and controller rulings,
corrective counters, and full-spec progress. It references Markdown bodies
rather than duplicating them.

Markdown remains authoritative for requirements and report content. The ledger
is authoritative for execution. Execution state is not mirrored into issue front matter. Read it through
`status`; do not implement projection synchronization or repair for that field.

Issue front matter's `blocked_by` is authoritative for dependencies. Commands
validate references and reject cycles before using or changing the dependency
graph; the ledger does not maintain a second editable dependency list.

Only controller commands change execution state. Workers write assigned reports;
the controller submits and evaluates them. A claim identifies controller
ownership, not an authenticated user or a lease requiring a background service.

### Command surface

Illustrative syntax with the agreed named options:

```sh
spindle sdd create --title "Command-driven SDD" --author controller
spindle sdd ready --spec .scratch/0001-command-driven-sdd/spec.md
spindle sdd issue create --spec .scratch/0001-command-driven-sdd/spec.md --title "..." --reporter "@username" --category enhancement --author controller
spindle sdd issue update --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --title "..." --author controller
spindle sdd triage --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --status ready-for-agent --category enhancement --details "..." --author controller
spindle sdd checks require --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --command "just test::test tests/example.test.ts" --author controller
spindle sdd claim --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --author controller
spindle sdd implement --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --author controller
spindle sdd submit --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --role implementation --report ... --author controller
spindle sdd checks record --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --snapshot snapshot-008 --command "just test::test tests/example.test.ts" --result passed --author controller
spindle sdd review --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --author controller
spindle sdd submit --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --assignment ... --role review --report ... --result passed --no-findings --author controller
spindle sdd accept --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --author controller
spindle sdd integrate --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --author controller
spindle sdd integrate --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --commit ... --author controller
spindle sdd issue comment --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --details "..." --author controller
spindle sdd resume --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --author controller
spindle sdd next --spec .scratch/0001-command-driven-sdd/spec.md
spindle sdd status --spec .scratch/0001-command-driven-sdd/spec.md
```

Commit preparation changes before `claim`. These examples show a passing
ordinary issue flow; conditional finding, correction, and delivery commands
follow the same spec/author conventions:

```sh
spindle sdd finding create --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --source ... --snapshot snapshot-008 --severity high --blocking --summary "..." --details "..." --author controller
spindle sdd correct --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --findings F-0001 --author controller
spindle sdd finding update --spec .scratch/0001-command-driven-sdd/spec.md --issue I-0001 --finding F-0001 --status fixed --evidence ... --author controller
spindle sdd review --spec .scratch/0001-command-driven-sdd/spec.md --scope delivery --author controller
spindle sdd resume --spec .scratch/0001-command-driven-sdd/spec.md --scope delivery --author controller
spindle sdd finish --spec .scratch/0001-command-driven-sdd/spec.md --report ... --author controller
```

- `create` creates a feature workspace named
  `<repository-wide-id>-<slug>` (for example, `.scratch/0001-command-driven-sdd`)
  and its initial `spec.md`, `issues/`, `reports/`, and ledger. It pins the
  built-in policy version and actual required reviewer roles at creation.
  There is no profile-selection option or configurable profile system.
  `--require-retrospective` stores `retrospectiveRequired: true` in the ledger;
  omission stores `false`.
  No separate `init` command is needed. Delivery
  begins with `claim` after issues are created and triaged. It scans only
  directories matching the new ID-based workspace pattern to choose the next
  repository-wide ID; unrelated `.scratch` entries and legacy dated directories
  are ignored. Features are created in the originating checkout before delivery
  worktrees are created; those worktrees retain the existing feature ID. No
  shared cross-worktree allocator is needed. Concurrent creation in the
  originating checkout is serialized with a temporary local lock covering the
  scan and directory creation, preventing duplicate IDs. Commands
  support the new ID-based naming only; migration or parsing of existing dated
  feature directories is explicitly out of scope.
- `issue create` assigns the next issue ID in `I-0001` form and creates a
  Markdown issue under the feature workspace's existing `issues/` directory.
  Numbering restarts within each feature workspace. It must not overwrite
  existing issues. Generated issues use YAML front matter for structured
  metadata and Markdown body sections for requirements, acceptance criteria,
  and comments. It requires `--title`, `--reporter`, and `--category`; reporter
  is free-form, not a mandated account or handle. It defaults front-matter
  `status` to `needs-triage` and `blocked_by` to an empty list. The ledger
  initializes execution to `unstarted`; that value is not duplicated in Markdown.
- `finding create` assigns a finding ID, records its report/source, reviewed
  snapshot, severity, description, and status, and adds a history entry to the
  issue. Finding IDs
  use the `F-0001` form and restart for each issue. The ledger is the canonical
  structured record; issue comments provide a readable audit trail and link
  back to the source report. The controller explicitly registers each finding
  from a review report; commands do not infer findings by parsing report prose.
  Registration inputs identify the source report, reviewed snapshot, severity,
  concise summary, and full finding details so the ledger can track it
  independently of report wording. Severity is a closed enum:
  `high`, `medium`, `low`; `blocking` is a separate boolean.
  finding status is a closed enum: `open`, `confirmed`, `fixed`, `dismissed`,
  `deferred`.
  `confirmed` means the controller agrees the finding is valid but it remains
  unresolved. `fixed` clears a blocker only after verification. `dismissed`
  identifies an invalid finding and requires an explanation. `deferred`
  identifies valid postponed work and requires rationale and follow-up.
  An unresolved finding blocks acceptance when its `blocking` boolean is true,
  independently of severity. Deferral cannot bypass an acceptance criterion;
  a scope change requires an explicit requirements decision and fresh review.
- `finding update` changes finding status explicitly. It requires verification
  evidence for `fixed`, an explanation via `--details` for `dismissed`, and
  rationale plus a follow-up reference for `deferred`; each transition
  is recorded in the ledger and issue history.
- Aggregate findings spanning issues are registered and updated with
  `--scope delivery` instead of `--issue`. They have a separate delivery-level
  `F-0001` sequence and ledger history; do not assign them arbitrarily to one
  issue. Delivery-scoped `correct` follows the same progress-based continuation
  rule, with its own recorded attempt history.
- Category and status values in issue front matter are validated closed enums:
  category is `bug` or `enhancement`; status is `needs-triage`, `needs-info`,
  `ready-for-agent`, `ready-for-human`, or `wontfix`.
- Ledger execution is a validated closed enum: `unstarted`, `claimed`,
  `implementing`, `reviewing`, `changes-requested`, `accepted`, `integrated`,
  `blocked`; pending assignments identify outstanding reviewers.
- `ready` lists unclaimed, triage-eligible issues with integrated dependencies.
- `issue update` changes descriptive metadata and dependencies, validating
  referenced issues and rejecting cycles. It does not bypass `triage` or
  execution gates. Requirements and acceptance criteria are edited directly
  in the Markdown body rather than supplied as CLI document-editing arguments.
- `triage` explicitly updates an issue's category/status after human or
  controller review. New issues begin at `needs-triage`; creation never marks
  them ready automatically. `ready-for-agent` is an explicit triage decision
  made only after confirming the issue is fully specified. It can set any valid
  triage status and category; require `--details` and record the rationale in the issue
  history.
- `claim` takes `--issue I-0001`, persists ownership, and rejects competing
  claims. Require a clean Git working tree before claiming; reject existing
  staged, unstaged, or untracked changes, including feature preparation files,
  without modifying them. Commit creation and triage changes before claim.
  Record the starting commit SHA only after this precondition passes.
- Workflow state transitions and finding creation append timestamped entries
  under the issue's existing `## Comments` heading. `issue comment` appends a
  user-authored comment in the same format. Existing comments are preserved.
  Commands appending comments or recording decisions require `--author`
  explicitly; reporter identifies the issue's origin, not the acting author.
- YAML front matter is the sole supported issue metadata format for command
  operations. Do not parse legacy top-of-file fields, support both formats, or
  migrate historical issue files. Historical files remain untouched and are
  not made compatible by this feature.
- `implement` records the initial dispatch intent and returns assignment inputs
  and report destinations; it does not launch an agent.
- Issue-scoped commands take `--issue I-0001`; no issue ID is positional.
- `submit` registers implementation and review results against the expected
  action and snapshot. Controller rulings are explicit structured inputs, not
  inferred from free-form prose; their minimal submission syntax is left to
  implementation.
  Each review assignment has a unique ID returned by `review`; review
  submissions require `--assignment <id>` to identify the exact agent, scope,
  snapshot, and report destination. Multiple reviewer agents share role
  `review`, not additional specialist role values.
  Review submission requires either the complete `--findings` list or explicit
  `--no-findings`, never both. Validate that listed findings belong to the
  submitted report and snapshot. Without that declaration, the review remains
  incomplete and cannot satisfy acceptance. This records controller
  responsibility; commands cannot prove no finding was omitted from prose.
  Require an explicit `--result passed|failed|unavailable`, using the same
  `Result` enum as checks rather than inferring verdicts from prose. Passing
  results cannot bypass unresolved blocking findings or missing coverage.
  Finding registration returns canonical IDs for submission to reference,
  avoiding repeated entry of finding fields. Multiple reviewers identifying
  the same defect must be linked to one canonical finding while retaining each
  report's provenance; do not automatically deduplicate prose.
- `checks require` declares required commands before implementation, based on
  the issue and project tooling. The controller remains responsible for choosing
  sufficient checks. Allow adding required checks discovered during
  implementation. Removing requirements needs a recorded rationale and
  invalidates affected gate decisions; missing required checks block review.
- `checks record` records one externally executed check per invocation using
  named arguments for snapshot, command, result, and author. Store its
  structured record in the ledger; do not require an intermediate JSON evidence
  file. `Result` is a closed enum: `passed`, `failed`, `unavailable`, shared
  with review submissions.
  Failed or unavailable results require `--details`; only passing results
  covering the current snapshot satisfy a required check.
- `review` requires current passing checks, freezes the snapshot, and returns
  the required reviewer assignment metadata and report destinations for initial
  or aggregate review. The controller confirms the Git-derived change inventory
  as the assigned scope. Keep this confirmation part of the existing review
  action rather than adding a separate file-ownership system.
- `review require` records a justified specialist requirement before review,
  taking `--agent` and `--details` plus the usual scope and author options.
  Validate that the selected agent's catalog entry declares review eligibility;
  reject unknown or ineligible agents. Return a distinct assignment/report path
  for each required reviewer. Catalog eligibility is not proof of actual
  callable-agent access in the controller's harness.
- `correct` requires actionable findings or non-mechanical check failures and
  persists the next corrective round before returning a fix assignment and its
  report destination.
- `accept` requires sufficient current checks and review coverage and no
  unresolved blocking findings.
- `integrate` validates the accepted, controller-confirmed Git inventory and
  returns files and delivery records requiring a caller-owned commit, or
  explicit errors for changed accepted content or unsafe unrelated changes.
  Never stage, commit, or push. After the caller commits, repeat with
  `--commit <sha>` to verify that existing commit's contents and record completed
  integration. Any resulting delivery-record changes must be committed before
  the next issue is claimed. Caller-owned delivery hands back instead.
- `next` and `status` are read-only. They return explicit actions, pending work,
  blockers, and required adjudication, not success-shaped fallback responses.
- `resume` explicitly restores an interrupted issue's recorded next action
  and existing assignment, preserving findings, evidence, and counters. It
  does not silently reset progress or allocate another corrective dispatch.
  If the supplied `--author` differs from the recorded controller, record an
  explicit ownership handoff. Do not take over while the previous worker is
  still editing; confirming that it has stopped remains a controller
  responsibility, not an automatic process-management feature.
  The same command supports `--scope delivery` instead of `--issue` to resume
  aggregate review, final correction, verification, or retrospective, preserving
  the delivery's corrective attempt history and adjudication state.
- `finish --spec ... --author ... --report <retrospective-path>` records
  completed full-spec delivery only after every issue is integrated, aggregate
  review passes, and required checks are current. Require a retrospective report
  only when the feature's creation policy says it is required; otherwise
  `--report` optionally attaches one. It does not publish or close issues.

Require an explicit `--spec` on every feature-scoped command, including
read-only status/ready/next commands. Require named options for all arguments
other than the `sdd` subcommand names (such as `create`, `ready`, and `claim`);
do not use positional issue IDs or positional values. Resolve the ledger from
the ID-based feature workspace containing that spec; do not rely on a mutable
implicit "active feature" or silently choose among multiple ledgers. This keeps
simultaneous features unambiguous and avoids hidden session state. Provide
structured JSON results and normal CLI help, with explicit nonzero failures.

### Workflow fidelity and evidence

Preserve explicit controller rulings, scoped corrective verification, and reuse
of unaffected evidence. Require one comprehensive independent initial reviewer,
plus any explicitly required specialist reviews. Wait for the entire assigned
batch before acceptance; scoped review cannot replace missing initial coverage.

Use progress-based corrective continuation for issues and full-spec delivery,
not fixed five-round or one-final-fix limits. Record every attempt, its assigned
findings, changes, checks, review outcome, and controller assessment of progress.
Continue only with demonstrable progress. Repeated failed fixes, recurring
blockers, or requirements disagreements pause delivery for controller/user
adjudication. Commands require an explicit recorded continuation decision;
they do not infer code quality or semantic progress from attempt counts.
Resume preserves history and any pending adjudication. Acceptance always
requires current passing evidence and resolved blockers.

Full-spec delivery remains in scope: comprehensive aggregate review, any
required specialist reviews, corrective verification, final verification, and
a retrospective when required by the feature's creation policy. Reuse the same review, submit, checks, and correct vocabulary with
an explicit delivery scope rather than building a second workflow framework.
Required role sets come from the delivery's recorded policy, rather than being
embedded in command transition logic. Specialist requirements may be explicitly
added before review; CLI updates must not silently remove required reviewers.

The comprehensive reviewer also covers whole-spec and cross-issue behavior for
aggregate delivery. Required checks and scoped corrective verification remain
mandatory. Specialist requirements are explicit; retrospective requirements
are selected at feature creation. Neither permits bypassing unresolved blockers.

Evidence identifies base/head and relevant uncommitted and untracked code inputs.
Use content identity to determine evidence coverage and Git SHAs for provenance;
changing commit metadata alone must not invalidate unchanged reviewed content.
Record the starting commit SHA when claiming an issue. Use Git to identify
committed, staged, unstaged, and untracked changes against that base, rather
than inventorying and hashing the entire checkout. The snapshot identity must
still distinguish dirty content: the starting SHA or HEAD alone is insufficient.
Exclude generated delivery records from the code change set and identify
applicable requirements separately.
Workflow commands compute code/requirements identities, store them in the
ledger, and return them with the relevant handoffs and assignments. Checks and
reviews reference those supplied identities, not manually invented labels.
Revalidate content when registering evidence and reject stale identities; do
not add a separate snapshot-management command.
Evidence also identifies the applicable spec and issue requirements. Changed
requirements invalidate acceptance evidence even when code is unchanged;
acceptance requires checks and review coverage of the current requirements.
Exclude appended audit comments
from requirements identity unless they contain an applicable requirement
decision.
Do not use HEAD alone or include changing reports and ledger files in code
snapshot identity. A changed report invalidates its registered identity; changed
code requires fresh coverage or an explicit supported preservation of unaffected
evidence. Freeze prevents CLI-sanctioned implementation actions; external edits
must be detected rather than assumed impossible.

Commands validate evidence identity, required coverage, and recorded verdicts.
They do not prove test execution or the truth of a reviewer's judgment. Missing,
malformed, stale, or failing evidence produces an explicit blocker.

### Persistence and recovery

Validate before mutation. Protect competing ledger updates with a short-lived
local write lock and atomically replace the ledger. Do not add a long-lived lock
service. Repeated submissions must not duplicate history or consume rounds.

Persist dispatch intent before returning assignment metadata. An interrupted
dispatch resumes the same recorded assignment instead of consuming another
round. Report loss or unavailable workers remains visible as pending or blocked.

Ledger and Markdown comment/metadata writes are not one filesystem transaction.
Detect interrupted writes and recover without duplicating history or resetting
workflow progress. No execution-field projection needs synchronization.

## Related surfaces

- Extend the native SDD command family using the current App/Service patterns;
  keep mutable delivery data local to each operation.
- Replace the existing `sdd workspace` report-destination resolver. Its current
  command shape and output contract are not requirements. Report paths are
  returned by the workflow action that needs them (implementation, review,
  correction, or aggregate review). Support distinct code-slop and aggregate
  reviewer destinations without duplicating path resolution.
- Update the SDD skill, assignment contracts, corrective/full-spec/integration
  references, tracker guidance, and CLI documentation together.
- Add the comprehensive reviewer under `src/blueprints/agents/` and update
  `sdd-orchestrator`'s callable-agent list. Existing task-reviewer coverage is
  useful prior art, but its current assignment explicitly excludes aggregate
  review; do not assume it already implements the new role. Consolidate the
  four ordinary reviewer agents into `sdd-reviewer` and reconcile templates,
  role values, and report destinations with that consolidation.
- Extend agent entries in `BlueprintCatalogDefinition` in
  `src/blueprints/catalog.ts` with review-eligibility metadata. Update catalog
  runtime validation and normalized entries so SDD commands can consume it.
  Keep this metadata agent-specific, not an option on skills or instructions.
  Use `canReview?: boolean` and reject nonboolean values and this field on
  other catalog kinds. Do not add agent lifecycle-status, stack-applicability,
  or installation checks in this feature.
- Use the Blueprint lifecycle to deliver changed shipped guidance. Preserve
  historical feature documents rather than rewriting their evidence.

## Constraints and non-goals

- No automatic agent dispatch, test execution, Git staging, commits, publishing,
  or issue closure.
- No replacement issue tracker, generic workflow DSL, remote synchronization,
  multi-checkout scheduler, or automatic memory compaction.
- No automatic parsing of arbitrary prose into trusted verdicts or rulings.
- No automatic extraction of findings from review-report prose; each finding is
  explicitly registered by the controller.
- No unrelated changes to Blueprint installation or project setup.

## Assumptions and implementation decisions

Accepted simplifications remove execution mirroring, separate severity from
blocking, and prohibit CLI commits. Integration uses prepare-and-confirm with
an existing commit SHA.

Command-maintained Markdown write recovery and typed ledger/evidence
schemas are implementation decisions left open. Explicit per-command `--spec` selection,
named options for all arguments other than subcommand names, repository-wide
ID-based workspace names without dates, and no legacy dated-folder parsing or
migration, YAML front matter as the canonical generated-issue format with no
legacy-format parsing or migration, per-issue zero-padded finding IDs, free-form
required reporter values, and
structured findings stored canonically in the ledger with issue comments as
the readable history, explicit controller registration of each finding
without report-prose parsing, issue-creation inputs/defaults, and closed
severity/category/triage-status/finding-status/execution-state enums are
confirmed user decisions; finding status uses `confirmed`, not `accepted`, to
avoid implying that a valid finding is resolved. Workspace ID allocation scans
matching ID-based directories, ignores unrelated entries, chooses the next ID
above the highest match, and uses no separate sequence file. No workspace
deletion command or permanent ID registry is included; manual deletion of the
highest-ID workspace may allow that number to be reused.

Implementation must settle the smallest typed ledger/evidence schema,
controller ruling syntax consistent with `--details`, and interrupted-write
recovery. Ownership handoff is recorded through `resume`, not a separate
release/reassignment system. Do not import historical delivery ledgers or reset
existing progress.

## Verification

Test exact command outputs and permitted/rejected transitions; dependency cycles
and eligibility; competing claims/writes; interrupted dispatch and document-write
recovery; idempotent submissions; missing, altered, and stale evidence; complete
initial review batches; unaffected scoped coverage; caller-owned hand-back; and
integration prerequisites.

Verify that unproductive corrections pause for adjudication in both scopes,
that continuation requires a recorded progress decision, and that restarting
does not erase attempts or bypass adjudication. Exercise a complete
issue and standalone full-spec flow, verifying completion both with an optional
retrospective and with a required retrospective present or missing. Test
agent-only `canReview` validation, review assignment identity, and caller-owned
commit confirmation without CLI Git mutations.
Retain relevant checkout/path-safety coverage from existing resolver tests
while replacing the old command/output contract, and run applicable checks
through the repository's Just recipes.
