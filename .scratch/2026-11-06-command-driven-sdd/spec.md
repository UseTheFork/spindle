# Command-driven SDD

Category: enhancement
Status: ready-for-agent

## Problem Statement

Subagent-driven development currently relies on the controller's conversation
and prompt discipline to maintain delivery state, report destinations, review
coverage, findings, corrective attempts, and acceptance decisions. A restarted
session must reconstruct what happened, and an agent can accidentally skip a
gate, reuse stale evidence, or reset corrective history.

The existing SDD workspace command resolves report paths but does not enforce
the workflow. Overlapping reviewer roles and fixed corrective budgets add
coordination without guaranteeing implementation quality. Users need durable,
inspectable progress and enforceable mechanical prerequisites without giving
the CLI control over agent execution or Git commits.

## Solution

Provide an explicit, command-driven SDD workflow backed by one local,
versioned feature ledger. Commands identify permitted actions, assign durable
report destinations, validate evidence and dependencies, preserve history, and
reject unsafe transitions. Markdown remains the home of requirements,
discussion, and detailed reports.

The controller continues to dispatch agents, execute checks externally,
adjudicate findings, and judge progress. One comprehensive independent reviewer
handles ordinary initial, corrective, and aggregate review; justified specialist
reviews are explicit requirements validated against agent catalog metadata.
Corrections continue with recorded progress rather than a fixed retry budget.

Git integration is caller-owned: the CLI returns accepted files and delivery
records, then verifies an existing caller-created commit. Retrospectives are
optional unless explicitly required when the feature is created.

## User Stories

1. As a maintainer, I want to create a feature workspace and its ledger together, so that delivery has one durable identity from the start.
2. As a maintainer, I want repository-wide numbered feature names without dates, so that features are easy to identify across sessions.
3. As a maintainer, I want concurrent feature creation serialized locally, so that two commands do not allocate the same feature ID.
4. As a controller, I want every existing-feature command to name its spec, so that simultaneous features cannot be confused.
5. As a controller, I want named arguments and structured JSON output, so that command calls and handoffs are explicit and machine-readable.
6. As a reporter, I want numbered Markdown issues with an explicit reporter, so that requirements retain their origin and local identity.
7. As a maintainer, I want new issues to require triage, so that creation does not imply implementation readiness.
8. As a maintainer, I want triage category and status separate from execution, so that readiness does not obscure delivery progress.
9. As a maintainer, I want to edit requirements directly in Markdown, so that the CLI does not become a document editor.
10. As a controller, I want validated issue dependencies, so that missing references and cycles cannot produce misleading ready queues.
11. As a controller, I want ready issues to have integrated dependencies, so that implementation starts from available prerequisite work.
12. As a controller, I want an exclusive recorded claim, so that competing controllers cannot silently own the same issue.
13. As a user, I want claim to reject a dirty checkout without altering it, so that unrelated work cannot become the delivery baseline.
14. As a controller, I want the clean starting revision recorded, so that changed inputs can be identified reliably.
15. As a controller, I want implementation intent persisted before dispatch metadata is returned, so that an interruption does not lose the assignment.
16. As an implementer, I want complete assignment inputs and a durable report destination, so that I can work without maintaining workflow bookkeeping.
17. As a controller, I want to declare required checks before implementation, so that verification expectations are explicit.
18. As a controller, I want to add checks discovered during implementation, so that new risks receive appropriate coverage.
19. As a maintainer, I want removing check requirements to require rationale and invalidate affected decisions, so that checks cannot disappear silently.
20. As a controller, I want to record externally executed checks against supplied snapshots, so that passing results cover the actual inputs.
21. As a user, I want failed and unavailable checks to remain explicit blockers, so that missing verification is not treated as success.
22. As a controller, I want one comprehensive independent default reviewer, so that requirements, correctness, tests, and maintainability receive coherent review.
23. As a controller, I want to require a specialist for a justified risk, so that unusual concerns receive focused independent coverage.
24. As a maintainer, I want the CLI to validate catalog review eligibility, so that non-review agents cannot satisfy reviewer requirements accidentally.
25. As a controller, I want actual harness access checked separately, so that catalog eligibility is not mistaken for agent availability.
26. As a reviewer, I want a unique assignment identifying my scope, snapshot, and report destination, so that my evidence cannot satisfy another assignment.
27. As a controller, I want review to freeze a confirmed Git-derived inventory, so that acceptance evaluates an explicit change set.
28. As a controller, I want acceptance to wait for every required reviewer, so that partial review cannot stand in for complete initial coverage.
29. As a controller, I want explicit review results and complete finding references, so that prose interpretation does not determine the gate.
30. As a controller, I want canonical finding IDs with source provenance, so that repeated observations do not create disconnected defects.
31. As a maintainer, I want finding severity separate from acceptance blocking, so that impact and delivery policy are not conflated.
32. As a controller, I want confirming a finding to leave it unresolved, so that agreement is not mistaken for a fix.
33. As a reviewer, I want fixes to require verification evidence, so that an implementer's assertion alone does not clear a blocker.
34. As a maintainer, I want dismissal to require an explanation, so that invalid findings are resolved transparently.
35. As a maintainer, I want deferral to require rationale and follow-up, so that postponed work is visible rather than represented as fixed.
36. As a user, I want deferral unable to bypass acceptance criteria, so that scope reduction requires an explicit decision and fresh review.
37. As a controller, I want corrective assignments tied to actionable findings or substantive check failures, so that fixes have a defined objective.
38. As a controller, I want every corrective attempt and progress assessment preserved, so that resumption cannot reset the history.
39. As a user, I want unproductive correction or requirements disagreement to pause for adjudication, so that endless retries do not weaken acceptance.
40. As a controller, I want productive corrections allowed beyond arbitrary round limits, so that verified quality determines completion.
41. As a controller, I want unaffected evidence reused only when its coverage remains valid, so that scoped fixes avoid unnecessary work without skipping gates.
42. As a user, I want changed code, requirements, or registered reports detected, so that stale evidence cannot authorize delivery.
43. As a controller, I want commit metadata changes alone not to invalidate unchanged content, so that provenance and coverage remain distinct.
44. As a controller, I want status and next-action queries to be read-only, so that inspecting progress does not change it.
45. As a replacement controller, I want resume to restore existing assignments and adjudication, so that interrupted delivery continues safely.
46. As a user, I want ownership handoffs explicitly recorded after the previous worker stops, so that recovery does not authorize concurrent editing.
47. As a user, I want integration to return accepted files or explicit errors without staging or committing, so that I retain Git control.
48. As a controller, I want an existing caller-created commit verified before integration is recorded, so that accepted content and committed content agree.
49. As a controller, I want whole-spec review and corrections to use the same workflow vocabulary, so that delivery does not need a second framework.
50. As a user, I want finish to require integrated issues and current aggregate evidence, so that individually accepted work is not mistaken for completed delivery.
51. As a maintainer, I want to require a retrospective at feature creation when appropriate, so that the completion requirement is deliberate and durable.
52. As a user, I want an optional retrospective attachable at finish, so that useful reflection remains possible without a universal mandate.
53. As a controller, I want repeated submissions and interrupted writes recoverable without duplicate history, so that retries do not corrupt progress.
54. As a user, I want existing documents, comments, reports, and unrelated changes preserved, so that adopting the workflow does not rewrite historical evidence.
55. As a maintainer, I want review policy pinned per feature, so that CLI upgrades do not silently change active delivery requirements.
56. As a user, I want installed agents, skills, references, and CLI guidance updated coherently, so that the documented workflow matches enforcement.

## Implementation Decisions

### Architecture and authority

- Build a guarded local workflow controller, not an execution runner. Follow
  the existing application-owned command/service architecture, asynchronous
  initialization, immutable workspace roots, and operation-local mutable data.
- Use exactly one versioned JSON ledger per feature, named `sdd.json`, created
  with the initial spec, issue directory, and report directory. Keep current
  execution state and append-only transition history in that ledger; do not
  introduce a database, separate event store, daemon, or storage configuration.
- The ledger owns claims, controller ownership, current gates, assignments,
  snapshot identities, evidence references, findings, rulings, policy,
  corrective attempts, adjudication, and full-spec progress.
- Markdown owns issue identity/descriptive metadata, triage, dependencies,
  requirements, acceptance criteria, discussion, and detailed reports.
  Execution is ledger-only; do not mirror it into issue front matter.
- Workers write assigned reports. Controller commands register evidence and
  change execution. Evidence is an attestation, not proof that a test ran or
  that a reviewer reported every concern.

### Identity, metadata, and policy

- New feature directory names consist of a zero-padded repository-wide numeric
  ID and descriptive slug, without a date. Allocate above the highest matching
  directory while ignoring unrelated and historical dated directories.
- Serialize scanning and directory creation with a temporary local creation
  lock. Do not keep a permanent allocator or deletion registry; deleting the
  highest-numbered feature manually may permit ID reuse.
- Create features in the originating checkout before delivery worktrees.
  Worktrees retain the feature ID; cross-worktree allocation is unsupported.
- Issue IDs use `I-0001` form and restart per feature. Finding IDs use `F-0001`
  form and restart per issue, with an independent delivery-scoped sequence.
  Commands must not overwrite existing issue or report history.
- Generated issue metadata uses YAML front matter only. Category is
  `bug | enhancement`; triage status is
  `needs-triage | needs-info | ready-for-agent | ready-for-human | wontfix`.
- Issue creation requires title, free-form reporter, category, and acting
  author. Default triage to `needs-triage`, blockers to empty, and ledger
  execution to `unstarted`; never invent attribution.
- Execution is
  `unstarted | claimed | implementing | reviewing | changes-requested | accepted | integrated | blocked`.
  Pending assignments distinguish review responsibilities and phases.
- Assignment roles are `implementation | review`. Agent identity and gate/scope,
  rather than extra role values, distinguish specialist, corrective, and
  aggregate work.
- Pin a built-in policy version and actual issue/delivery review requirements
  when creating a feature. Default to one comprehensive independent reviewer;
  do not introduce standard/lightweight profiles or selectable policy systems.
- `create --require-retrospective` stores `retrospectiveRequired: true`;
  omission stores `false`. Upgrades must not silently alter either review or
  retrospective requirements for active features.

### Command contracts

- Replace the standalone SDD workspace resolver with workflow actions returning
  their own assignment/report destinations. Do not preserve the old public
  command or output contract as a compatibility entry point.
- Provide `create`, `issue create`, `issue update`, `issue comment`, `triage`,
  `ready`, `claim`, `implement`, `submit`, `checks require`, `checks record`,
  `review`, `review require`, `finding create`, `finding update`, `correct`,
  `accept`, `integrate`, `next`, `status`, `resume`, and `finish`.
- Require explicit `--spec` on every existing-feature operation, including
  read-only queries. Creation has no pre-existing spec argument. Resolve the
  ledger from the supplied spec's feature; never maintain an implicit active
  feature. There is no separate initialization command.
- All input values use named options; only command/subcommand names are
  positional. Issue operations use `--issue`; delivery operations use
  `--scope delivery`, mutually exclusive with an issue selection.
- Provide normal CLI help, structured JSON results, explicit diagnostics, and
  nonzero failures. Invalid transitions must not return success-shaped defaults.
- All decision/history-writing commands require `--author`. Use `--summary`
  for concise descriptions and `--details` for explanations, failure details,
  rationales, and comments; do not add body/rationale aliases.
- `issue update` changes descriptive metadata/dependencies without bypassing
  dedicated triage or execution gates. Requirements remain directly editable.
  `triage` accepts any valid category/status and requires explanatory details.
- `blocked_by` in issue front matter is the authoritative dependency list.
  Validate references and reject cycles before mutation or queue evaluation.
  `ready` lists unclaimed triage-eligible issues with integrated dependencies.
- `claim` rejects competing ownership and any staged, unstaged, or untracked
  changes, including preparation documents. Record the starting SHA only after
  validating a clean checkout; never commit, stash, or discard to satisfy it.
- `implement` persists dispatch intent and returns assignment inputs and report
  destinations without launching an agent.
- `checks require` declares required commands before implementation and allows
  later additions. Removing a requirement needs recorded rationale and
  invalidates affected decisions; use the smallest explicit contract consistent
  with the existing command vocabulary.
- `checks record` records one externally executed command against a supplied
  snapshot per invocation, directly in the ledger.
- Checks and review submissions share `passed | failed | unavailable` through
  `--result`. Failed/unavailable results require details; only current passing
  results satisfy required coverage.
- `review` requires current passing checks, controller confirmation of the
  Git-derived inventory, and a frozen snapshot. It returns assignments for all
  required reviewers and persists each assignment before returning.
- Every review assignment has a unique ID identifying agent, scope, snapshot,
  and report destination. Review submission requires `--assignment`, an explicit
  result, and either the complete canonical `--findings` list or exclusive
  `--no-findings`. Validate source and snapshot membership.
- `review require --agent ... --details ...` records a justified specialist
  requirement before review. Requirements cannot silently disappear; updates
  must not weaken them to bypass findings.
- `next` and `status` report permitted actions, pending assignments, blockers,
  and adjudication without mutation.
- `resume` restores the recorded gate and existing assignment without resetting
  evidence, findings, attempts, or adjudication. A changed author records an
  ownership handoff; the controller must first confirm the previous worker has
  stopped. Support both issue and delivery scope.

### Findings, review, and corrective progress

- Introduce `sdd-reviewer` as the comprehensive ordinary reviewer for initial,
  corrective, and aggregate assignments. Cover requirements, correctness,
  regressions, tests, maintainability, and unnecessary complexity.
- Replace the ordinary code, task, code-slop, and re-review agent workflow with
  that consolidated role. Update controller dispatch, orchestrator access,
  assignment templates, references, and report contracts together.
- `finding create` explicitly registers source report, reviewed snapshot,
  severity, blocking flag, summary, and details. Do not extract findings from
  prose. Return canonical IDs for subsequent submission.
- Link multiple reviewer observations of the same defect to one canonical
  finding while retaining every source's provenance. Do not automatically
  deduplicate natural language.
- Severity is `high | medium | low`; `blocking` is a separate boolean.
  Finding status is `open | confirmed | fixed | dismissed | deferred`.
  Keep `wontfix` only in issue triage.
- Confirmation means valid but unresolved. Fixing requires verification
  evidence; dismissal requires an invalidity explanation; deferral requires
  rationale and a follow-up reference.
- A blocking finding cannot be deferred around an acceptance criterion.
  Acceptance requires verified fixes, justified invalidity rulings, or an
  explicitly approved requirements change with fresh review coverage.
- Wait for the full initial reviewer batch before acceptance. Corrective
  coverage cannot replace missing initial review; reuse unaffected coverage only
  when the recorded identities and scope justify it.
- `correct` requires actionable findings or non-mechanical check failures.
  Persist the next attempt and selected objectives before returning a fix
  assignment; maintain independent issue and delivery histories.
- Record attempts, changes, checks, outcomes, and controller progress
  assessments. Continuation requires an explicit recorded progress decision.
  Repeated failed fixes, recurring blockers, and requirements disagreements
  pause for controller/user adjudication. Commands validate these records,
  not semantic code quality.
- Remove five-round issue and one-fix delivery budgets as acceptance policy.
  Attempt numbering remains for history and report destinations. Never weaken
  acceptance merely to terminate a retry loop.
- `accept` requires current required checks, sufficient required review
  coverage, and no unresolved blocking findings.

### Evidence and Git integration

- Workflow actions compute and return code/requirements snapshot identities.
  Evidence references those identities; no separate snapshot-management
  command or manually invented snapshot labels are needed.
- Use Git revision, diff, status, and inventory mechanisms to identify committed,
  staged, unstaged, and untracked changes against the recorded baseline.
  Do not hash the entire checkout or use HEAD alone as dirty-content identity.
- Content determines coverage; SHAs provide provenance. Commit metadata-only
  changes must not invalidate identical reviewed content.
- Exclude generated ledger, reports, and audit records from code identity.
  Identify applicable spec/issue requirements separately; requirement changes
  invalidate relevant acceptance evidence even without code changes.
- Ordinary appended comments are not requirements unless they record an
  applicable requirements decision. Changed registered report content
  invalidates its evidence identity.
- Revalidate identities when registering evidence and enforcing gates. Missing,
  malformed, altered, stale, failed, or unavailable required evidence blocks.
  Detect external edits during review instead of assuming the freeze prevents
  them.
- Retain the accepted controller-confirmed inventory through integration; do
  not introduce a file ownership registry or infer intent from filenames.
- `integrate` prepares a hand-back containing accepted files and delivery
  records requiring a caller-owned commit, or reports explicit errors for
  changed accepted content or unsafe unrelated changes.
- After the caller commits, `integrate --commit <sha>` verifies the existing
  commit's delivered content and records integration. It never creates a
  commit. The caller commits resulting delivery-record changes before the next
  claim; those audit changes do not invalidate code evidence or require an
  endless integration-confirmation loop.
- Delivery-scope review, checks, correction, and resume use the same contracts.
  `finish` requires all issues integrated, passing aggregate required reviews,
  and current final checks. It requires a retrospective report only when the
  stored creation policy requires one; otherwise a report is optional.
- The CLI never stages, commits, stashes, discards, pushes, publishes, closes
  issues, launches agents, or executes the declared verification commands.

### Catalog, persistence, and shipped guidance

- Extend agent catalog definitions with optional `canReview?: boolean`.
  Preserve it through normalized catalog entries. Only a known agent with
  explicit `true` is review-eligible; absent/false is ineligible.
- Reject nonboolean eligibility values and the field on skills/instructions.
  Do not introduce a generic capability system or add lifecycle-status,
  stack-applicability, or installation eligibility checks for this feature.
  The controller separately verifies harness callability.
- Validate before mutation, protect competing writes with short-lived local
  locks, and atomically replace the ledger.
- Make repeated submissions idempotent without duplicate history or additional
  corrective attempts. Interrupted dispatch resumes the same assignment;
  missing reports or unavailable workers remain pending or explicitly blocked.
- Preserve existing comments and append attributed UTC audit entries under the
  issue's Comments section. Detect and recover interrupted ledger/Markdown
  writes without duplicated entries or lost progress; do not promise a
  multi-file filesystem transaction or add execution projection repair.
- Preserve checkout containment, symlink, ignored-path, and regular-file safety
  from the current resolver where relevant to the new read/write operations.
- Update shipped skill guidance, agents, references, tracker terminology,
  tooling/help, and CLI documentation through the Blueprint lifecycle, including
  versions and catalog reconciliation/removal records where required.

## Testing Decisions

- The user confirmed the public CLI in temporary Git checkouts as the primary
  seam. Prefer the highest existing boundary and assert observable JSON,
  diagnostics, exit codes, Git state, persisted documents, and subsequent
  command behavior rather than service internals.
- Existing SDD CLI fixtures provide prior art for initialized repositories,
  invocation helpers, exact output assertions, and path-safety cases. Replace
  obsolete resolver-contract assertions while retaining applicable protections.
- Exercise a complete issue lifecycle and whole-spec delivery across separate
  invocations, including caller-created commits and optional/required
  retrospectives. Assert actual integrated and finished outcomes.
- Cover required named arguments, attribution, enum validation, explicit spec
  selection, mutually exclusive scopes, creation defaults, ID allocation,
  historical-directory exclusion, and preservation of existing documents.
- Cover dependencies, missing references, cycles, ready eligibility, clean
  claim prerequisites, ownership contention, concurrent creation/writes,
  assignment identity, and policy stability across resumed operations.
- Cover current and stale checks/reviews, dirty and untracked content,
  requirements changes, report alteration, metadata-only commits, audit
  exclusions, complete review batches, canonical finding provenance, and
  unaffected scoped coverage.
- Cover finding rulings, unjustified deferral, missing fix verification,
  productive continuation beyond former budgets, explicit progress decisions,
  and adjudication preserved on resume in both scopes.
- Cover interrupted dispatch and document writes, recovery, idempotent
  submissions, and unavailable workers. Prefer deterministic process/filesystem
  fixtures; add a narrow fault seam only if necessary to exercise interruptions
  reliably, without exposing a new production test-only API.
- Assert unsafe integration fails without altering unrelated changes; verify
  existing-commit confirmation and that workflow commands do not perform
  prohibited Git mutations.
- Use the existing catalog validation seam for optional boolean normalization,
  agent-only field validation, known/eligible specialist checks, and preservation
  of existing catalog behavior.
- Use existing Blueprint installation/update and packaged CLI tests as
  supporting seams for the new reviewer, consolidated guidance, lifecycle
  cleanup, and public command availability. Do not treat prose tests as proof
  of reviewer judgment.
- Run applicable tests, type checking, build, and lint/format checks through the
  project's Just recipes. Start with targeted coverage and expand when shared
  catalog, lifecycle, or CLI integration changes require it.

## Out of Scope

- Implementing or installing Beads, remote synchronization, a replacement issue
  tracker, a generic workflow DSL, a database, or a configurable backend.
- Automatic agent dispatch, execution management, test execution, memory
  compaction, publishing, issue closure, or Git mutations described above.
- Cross-worktree feature allocation, a multi-checkout scheduler, background
  ownership leases, or a permanent feature-number registry/deletion command.
- Legacy dated-workspace or top-of-file metadata parsing, migration, dual-format
  support, and compatibility entry points for the old workspace resolver.
- No-review delivery, selectable review profiles, acceptance weakened to stop
  corrections, and automatic extraction or deduplication of report prose.
- Broader catalog capability modeling and reviewer lifecycle, Stack,
  installation, or harness availability enforcement by the CLI.
- Unrelated changes to project setup or Blueprint installation behavior.
- Generating implementation issues, implementing this spec, or creating commits
  as part of publishing this specification.

## Further Notes

- Requirements source: [the selected design](./design.md), supplemented by this
  conversation where it does not conflict. The later consolidated-review
  decisions supersede earlier separate-reviewer destination wording.
- This spec intentionally remains in the existing dated feature directory.
  New command-created workspaces use the new ID-only naming scheme; preserving
  this design/spec does not require legacy command support.
- Current tracker guidance describes the pre-change workflow. Its execution
  fields, reviewer phases, fixed budgets, and workspace resolver are behavior
  being replaced, not additional requirements to retain.
- No unresolved product decision blocks readiness. The smallest typed ledger
  schema, assignment ID format, canonical observation-link representation,
  continuation/ruling input syntax, requirement-decision representation,
  evidence-preservation rules, and interrupted-write recovery mechanism remain
  bounded implementation decisions. They must satisfy the observable contracts
  above rather than introduce broader infrastructure.
- The exact command argument schema in the design is illustrative. Finalize
  missing mechanical inputs consistently with named options, explicit authors,
  supplied identities, and shared summary/details/result vocabulary.
