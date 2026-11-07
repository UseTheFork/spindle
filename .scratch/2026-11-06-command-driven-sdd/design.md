# Command-driven SDD

Status: Proposed; awaiting design approval

## Intent and success criteria

Move durable bookkeeping and mechanical gate enforcement out of the
subagent-driven development prompt and into explicit `spindle sdd` commands.
Keep the agent responsible for dispatch, execution, and judgment.

Success means:

- A new session can discover the next permitted action without reconstructing
  workflow state from conversation history.
- Commands reject invalid transitions, missing or stale evidence, unresolved
  blockers, and exhausted corrective budgets.
- The skill describes how to use the commands and exercise judgment rather
  than independently maintaining another execution ledger.
- Existing Markdown briefs, tickets, reports, and user changes are preserved.
- The implementation remains a small local controller, not an issue-tracker
  platform or an agent execution runner.

## Confirmed user decisions

- Use a guarded workflow engine rather than only a tracker or a complete runner.
- Use a structured ledger as the authority for execution state; retain Markdown
  requirements and reports.
- Prefer explicit commands such as `claim`, `review`, `correct`, and `accept`
  over generic `begin` and `record` commands.
- Keep the solution simple.
- Use the illustrated command flow as the direction, not a finalized argument
  schema.

## Considered approaches

1. **Durable tracker:** ready queues, claims, and report records, with gates
   interpreted by the agent. Smaller implementation, but does not reliably
   prevent skipped gates or reset budgets.
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

Use one ledger per existing dated feature directory. Proposed implementation:
`sdd.json` beside the spec, with versioned JSON containing current state and an
append-only transition history. No database server, daemon, or separate event
store.

The ledger records ticket dependencies and claims, delivery ownership, current
gate, snapshot identities, evidence references, findings and controller rulings,
corrective counters, and full-spec progress. It references Markdown bodies
rather than duplicating them.

Markdown remains authoritative for requirements and report content. The ledger
is authoritative for execution. A manually edited `Execution:` line cannot
bypass a gate; retain that line as a command-maintained projection with the
existing tracker comment convention. Commands detect disagreement and explain
how to reconcile it rather than silently importing a state change.

Only controller commands change execution state. Workers write assigned reports;
the controller submits and evaluates them. A claim identifies controller
ownership, not an authenticated user or a lease requiring a background service.

### Command surface

Illustrative syntax; exact flags remain implementation choices:

```sh
spindle sdd init --spec .scratch/YYYY-MM-DD-feature/spec.md
spindle sdd ready
spindle sdd claim 03
spindle sdd implement 03
spindle sdd submit 03 --role implementation --report ...
spindle sdd checks 03 --evidence ...
spindle sdd review 03
spindle sdd submit 03 --role code-review --report ...
spindle sdd submit 03 --role code-slop-review --report ...
spindle sdd submit 03 --role task-review --report ...
spindle sdd correct 03 --findings F1,F2
spindle sdd accept 03
spindle sdd integrate 03 --evidence ...
spindle sdd next
spindle sdd status
```

- `init` validates scope, ticket identities, and an acyclic dependency graph.
  Repeated initialization must not reset existing progress.
- `ready` lists unclaimed, triage-eligible tickets with integrated dependencies.
- `claim` persists ownership and rejects competing claims.
- `implement` records the initial dispatch intent and returns assignment inputs
  and report destinations; it does not launch an agent.
- `submit` registers implementation and review results against the expected
  action and snapshot. Controller rulings are explicit structured inputs, not
  inferred from free-form prose; their minimal submission syntax is left to
  implementation.
- `checks` records externally executed checks, results, and snapshot coverage.
- `review` requires current passing checks, freezes the snapshot, and returns
  the required initial or scoped reviewer assignment metadata.
- `correct` requires actionable findings or non-mechanical check failures and
  persists the next corrective round before returning a fix assignment.
- `accept` requires sufficient current checks and review coverage and no
  unresolved blocking findings.
- `integrate` records verified integration for controller-owned delivery; it
  does not stage or commit files. Caller-owned delivery hands back instead.
- `next` and `status` are read-only. They return explicit actions, pending work,
  blockers, and exhausted budgets, not success-shaped fallback responses.

Every command resolves an explicit feature when ambiguous. Do not silently
choose among multiple feature ledgers. Provide structured JSON results and
normal CLI help, with explicit nonzero failures.

### Workflow fidelity and evidence

Preserve the current ticket controller flow, including all three parallel initial
reviews, waiting for the full dispatched batch, controller rulings, scoped
re-review, and reuse of unaffected evidence. Missing initial reviews cannot be
replaced by scoped review.

Preserve five corrective implementation dispatches per ticket across review,
check, and integration fixes. Preserve the independent single final corrective
dispatch for standalone full-spec delivery. Resume never resets either budget.

Full-spec delivery remains in scope: aggregate code and code-slop reviews, any
permitted final fix and scoped review, final verification, and delivery
retrospective. Reuse the same review, submit, checks, and correct vocabulary with
an explicit delivery scope rather than building a second workflow framework.

Evidence identifies base/head and relevant uncommitted and untracked code inputs.
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

Ledger and Markdown projection updates are not assumed to be one filesystem
transaction. Detect interrupted projection writes and allow deterministic repair
from the ledger without resetting workflow history.

## Related surfaces

- Extend the native SDD command family using the current App/Service patterns;
  keep mutable delivery data local to each operation.
- Preserve the existing read-only `sdd workspace` command and its output shape.
  Workflow assignments must also provide distinct code-slop and aggregate
  reviewer destinations, which the current resolver does not fully express.
- Update the SDD skill, assignment contracts, corrective/full-spec/integration
  references, tracker guidance, and CLI documentation together.
- Use the Blueprint lifecycle to deliver changed shipped guidance. Preserve
  historical feature documents rather than rewriting their evidence.

## Constraints and non-goals

- No automatic agent dispatch, test execution, Git staging, commits, publishing,
  or ticket closure.
- No replacement issue tracker, generic workflow DSL, remote synchronization,
  multi-checkout scheduler, or automatic memory compaction.
- No automatic parsing of arbitrary prose into trusted verdicts or rulings.
- No unrelated changes to Blueprint installation or project setup.

## Assumptions and implementation decisions

The single JSON file, command-maintained Markdown projection, and delivery-scoped
command reuse are recommendations in this draft, not separately confirmed user
choices.

Implementation must settle the smallest typed ledger/evidence schema, explicit
feature-selection flags, controller ruling syntax, interrupted-action recovery,
and claim release/reassignment. Importing active historical delivery ledgers is
not assumed; initialization must refuse ambiguous existing execution history
rather than restarting it.

## Verification

Test exact command outputs and permitted/rejected transitions; dependency cycles
and eligibility; competing claims/writes; interrupted dispatch and projection
recovery; idempotent submissions; missing, altered, and stale evidence; complete
initial review batches; unaffected scoped coverage; caller-owned hand-back; and
integration prerequisites.

Specifically verify refusal of ticket corrective dispatch six and final
corrective dispatch two, including after process restart. Exercise a complete
ticket and standalone full-spec flow, including retrospective evidence.
Preserve existing workspace resolver tests and run applicable checks through
the repository's Just recipes.
