# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- A feature lives in `.scratch/<numeric-id>-<feature-slug>/`, for example
  `.scratch/0001-command-driven-sdd/`. `sdd create` allocates the next
  repository-local ID; don't create another feature directory for the same
  work or change its ID when resuming.
- The feature spec is `spec.md`; issues and reports live in the sibling
  `issues/` and `reports/` directories. Select an existing feature explicitly
  with its spec path.
- Command-managed issues use one YAML-front-matter Markdown file per issue:
  `issues/I-0001.md`. IDs start at `I-0001` independently in each feature.
  Historical issue files are not migrated or interpreted as command-managed
  YAML issues.
- Front matter owns issue `id`, `title`, free-form `reporter`, `category`
  (`bug` or `enhancement`), triage `status` (`needs-triage`, `needs-info`,
  `ready-for-agent`, `ready-for-human`, or `wontfix`), and `blocked_by`.
  Dependencies are authoritative here; every referenced ID must exist and
  dependency cycles are rejected.
- Requirements and acceptance criteria remain directly editable in the
  `## Requirements` and `## Acceptance Criteria` Markdown sections. Keep
  discussion and attributed history under `## Comments`.
- Create and select issues with explicit options, for example:

  ```sh
  just spindle::run sdd issue create --spec <absolute-spec-path> --title "..." --reporter "..." --category enhancement --author maintainer
  just spindle::run sdd issue update --spec <absolute-spec-path> --issue I-0001 --title "..." --author maintainer
  just spindle::run sdd triage --spec <absolute-spec-path> --issue I-0001 --status ready-for-agent --category enhancement --details "Requirements are complete." --author maintainer
  just spindle::run sdd issue comment --spec <absolute-spec-path> --issue I-0001 --details "..." --author maintainer
  just spindle::run sdd ready --spec <absolute-spec-path>
  ```

- `issue update` changes descriptive metadata and dependencies only; use
  `--blocked-by <id...>` to set dependencies or `--clear-blocked-by` to remove
  them. Use `triage` to change category or status. Ready issues are unclaimed
  `ready-for-agent` issues whose dependencies are integrated. The ready output
  also identifies issues waiting on dependencies.
- Every command that creates a decision or history entry requires an explicit
  `--author`; reporter is never used as attribution. Entries include a UTC
  timestamp and preserve existing requirements, criteria, and comments.
- `sdd.json` is the execution authority. Do not add or edit an `Execution:`
  field in issue Markdown; execution changes belong to controller workflow
  commands and remain in the ledger.

## Canonical tracker checkout during delivery

At pre-flight, record the absolute path of the existing checkout and the
feature's ID-based `.scratch/` directory in the session ledger. Keep both
canonical on resume. Agents may update assigned `.scratch` files and save
reports directly; coordinate file ownership to avoid concurrent writes and
preserve history. The controller still owns execution states and acceptance
decisions. Verify every agent can read canonical inputs, including uncommitted
files; inaccessible sources are a blocker. Preserve user changes and never
replace or delete `.scratch`.

## Execution state

The issue's triage status and its execution progress are separate. Triage and
dependencies live in issue front matter; execution (`unstarted`, `claimed`,
`implementing`, `reviewing`, `changes-requested`, `accepted`, `integrated`, or
`blocked`) lives only in `sdd.json`. The controller owns execution transitions
and acceptance. `ready` reports only unclaimed, triage-eligible issues with
integrated dependencies and keeps unmet dependencies visible.

Use the workflow commands for claim, dispatch, submission, and recovery:

```sh
just spindle::run sdd next --spec <absolute-spec-path>
just spindle::run sdd claim --spec <absolute-spec-path> --issue I-0001 --author controller
just spindle::run sdd implement --spec <absolute-spec-path> --issue I-0001 --author controller
just spindle::run sdd submit --spec <absolute-spec-path> --issue I-0001 --role implementation --report <assigned-report-path> --author controller
just spindle::run sdd review --spec <absolute-spec-path> --issue I-0001 --inventory '["src/example.ts"]' --author controller
just spindle::run sdd submit --spec <absolute-spec-path> --issue I-0001 --role review --assignment <assignment-id> --report <assigned-review-report-path> --result passed --no-findings --author controller
just spindle::run sdd accept --spec <absolute-spec-path> --issue I-0001 --author controller
just spindle::run sdd resume --spec <absolute-spec-path> --issue I-0001 --author controller
```

Before `claim`, commit preparation documents, issue/triage updates, and every
other checkout change. Claim rejects staged, unstaged, and untracked content
without changing it. A successful claim records the clean starting commit and
explicit controller; dependency, readiness, cleanliness, and ownership checks
must pass before ownership or baseline is recorded.

`implement` persists one controller-authored implementation assignment before
returning it. The assignment has role `implementation`, an action ID, and a
stable absolute report path under the feature's `reports/` directory. It only
returns handoff data: the CLI does not launch agents or run commands. Save the
report at the returned destination, then submit that exact target. A missing
report remains pending and is reported as unavailable; use
`--unavailable --details <reason>` to record an unavailable worker explicitly.
When the report later becomes available, it can still be submitted. Repeating
the same dispatch or report submission returns the existing assignment/result
without allocating another dispatch or duplicating history.

`review` requires a submitted implementation report, at least one currently
required check with a passing result for the current snapshot, and the
controller-confirmed Git-derived inventory as a JSON string array. The CLI
compares that inventory with the current changed paths, then freezes the
snapshot and persists one unique initial `review` assignment per required
reviewer before returning the agent, scope, ID, snapshot, and absolute report
destination. A controller may first pin a justified specialist with
`just spindle::run sdd review require --spec <absolute-spec-path> --issue I-0001 --agent <catalog-agent> --details "<specialist objective>" --author controller`.
Only a known agent with `canReview: true` is eligible; this is separate from
the controller's required check that the agent is actually callable in the
current harness. The CLI neither checks callability nor adds a default
specialist batch. Each reviewer keeps a distinct `review` assignment and
report destination, and the specialist objective is carried on that
assignment. Requirement registration is allowed only before assignments are
frozen, is idempotent for identical input, and has no removal operation.
Supply the inventory exactly; `.scratch` ledgers and reports are not part of
the code inventory. Repeating dispatch returns the same assignments. After
dispatch, required checks cannot be changed through the CLI; later gates
revalidate the content, inventory, and submitted report digests to detect
external edits.

Register each finding explicitly before submitting its source review report.
Use the assignment's absolute report path and frozen snapshot; the CLI validates
both against that issue's review assignment and does not parse report prose.
IDs restart at `F-0001` for each issue. Severity (`high`, `medium`, `low`) and
blocking (`--blocking` or `--non-blocking`) are independent:

```sh
just spindle::run sdd finding create --spec <absolute-spec-path> --issue I-0001 --source <assigned-review-report> --snapshot <snapshot> --severity high --blocking --summary "..." --details "..." --author controller
just spindle::run sdd finding create --spec <absolute-spec-path> --issue I-0001 --source <another-assigned-review-report> --snapshot <snapshot> --severity medium --non-blocking --summary "..." --details "..." --link F-0001 --author controller
```

Only explicitly use `--link F-0001` when observations describe the same
canonical finding; each report and snapshot remain attributed provenance.
Similar prose is not deduplicated. Review `submit` requires the exact
`--assignment`, assigned `--report`, explicit `--result`, and either the
complete canonical `--findings F-0001 F-0002` list or exclusive
`--no-findings`. Findings listed at submission must have been registered from
that report and frozen snapshot. The CLI never infers findings, results, or a
finding-free declaration from report prose. Failed/unavailable results also
require an explicit findings declaration plus `--details`, and do not satisfy
acceptance. Repeating an identical registration or submission is idempotent;
changed report content or snapshot is rejected.

Record explicit finding rulings with `finding update`. `confirmed` remains
unresolved; `fixed` requires a current CLI snapshot with passing required
checks that differs from every snapshot where the finding was observed;
`dismissed` requires an invalidity explanation in `--details`;
`deferred` requires rationale and `--follow-up`. A blocking finding cannot be
deferred around an acceptance criterion. Scope changes require an approved
`requirements decide` record and fresh passing review coverage before a
blocking finding may be deferred. `wontfix` remains an issue-triage status,
not a finding disposition:

```sh
just spindle::run sdd finding update --spec <absolute-spec-path> --issue I-0001 --finding F-0001 --status fixed --evidence <current-snapshot> --author controller
just spindle::run sdd finding update --spec <absolute-spec-path> --issue I-0001 --finding F-0002 --status dismissed --details "The report's claim is invalid because ..." --author controller
just spindle::run sdd requirements decide --spec <absolute-spec-path> --issue I-0001 --finding F-0001 --decision approved --details "The acceptance criterion was explicitly revised." --author controller
```

`accept` requires current passing required checks, complete passing initial
review coverage for the default reviewer and every pinned specialist, and no
unresolved blocking finding. Reviews may attest to `--no-findings` or list
their canonical findings. Missing declarations, pending/failed/unavailable
results, stale or altered evidence, mismatched assignment provenance, and
unresolved blockers prevent acceptance. A review with blocking findings routes the issue to
`changes-requested`; `next` and `status` expose findings, blockers, and
requirements decisions. `resume` returns saved review assignments and the next
action after an interrupted dispatch or submission. The `sdd-reviewer` Agent
Blueprint describes initial, corrective, and aggregate review contracts; later
corrective and aggregate command gates remain separately scoped.

`resume` returns the recorded gate and assignment without resetting evidence
or history. A changed controller must use `--confirm-handoff` only after
confirming the previous worker stopped editing; the handoff is recorded while
the original assignment and report path remain unchanged. `next` and expanded
`status` are read-only and report permitted actions, pending assignments, and
blockers. Workflow commands do not stage, commit, or otherwise mutate Git.

## Required checks and content identities

Declare externally executed checks with
`sdd checks require --spec <path> --issue <id> --command <command> --author <author>`.
This records the command; it does not run it. Add requirements as implementation
uncovers risks. Remove one explicitly with `--remove --details <rationale>`;
the removal and rationale remain in the ledger. Changing the required-check set
changes the requirements identity, makes earlier results stale, and reopens an
accepted or integrated issue for review.

Obtain the current `snapshot`, `codeSnapshot`, and `requirementsSnapshot` from
workflow output (`claim`, `implement`, `resume`, `status`, or `next`). Record one
external result at a time:

```sh
just spindle::run sdd checks record --spec <absolute-spec-path> --issue I-0001 --snapshot <snapshot> --command "just test::test tests/example.test.ts" --result passed --author controller
```

Allowed results are `passed`, `failed`, and `unavailable`; failures and
unavailability require `--details`. The CLI verifies that the supplied
snapshot is still current before it persists the structured result in the
ledger. Missing, stale, failed, or unavailable required coverage is reported
by `next` and `status`. Repeating an identical result does not duplicate its
history.

Code identity is derived from paths Git identifies as changed from the issue's
claim baseline, including committed, staged, unstaged, and untracked content.
The identity hashes the Git index entries and working-tree modes and bytes for
those changed paths, not the whole checkout or `HEAD` alone. `.scratch`
content—including ledgers, reports, and generated audit entries—is excluded
from code identity.
Changed Gitlink revisions and dirty or untracked submodule worktrees are
unsupported: identity computation fails closed, and `checks record` does not
persist a result for that state.
Missing or uninitialized known Gitlinks and changed nested repository/worktree
directories are also unsupported and fail closed; their contents are not
reduced to a generic non-file identity marker.
Git SHAs are retained as
provenance; a metadata-only commit with identical content does not invalidate
coverage.

Requirements identity is separate: it covers the feature spec, the issue's
`Requirements` and `Acceptance Criteria`, explicit `Requirements decision`
comments, and the required-check declaration history. Ordinary issue comments
do not affect it. A requirements edit invalidates evidence even when code is
unchanged.

These identities establish which local content an author supplied with a
result; they are not proof that the declared command ran, that it ran in a
particular environment, or that its reported verdict is truthful. The controller
executes checks externally and attests to their result. The CLI never launches
declared commands.

## When a skill says "publish to the issue tracker"

Create a new file under the feature's ID-based directory,
`.scratch/<numeric-id>-<feature-slug>/` (creating a feature through `sdd create`
when needed).

## When a skill says "fetch the relevant issue"

Read the file at the referenced path. The user will normally pass its path or
the issue ID directly.

## Delivery reports

Keep durable delivery evidence in `.scratch/<numeric-id>-<feature-slug>/reports/`:

- `<NN>-implementation.md`: full implementer report; append fixes with round, finding IDs and fresh covering-check evidence.
- `<NN>-review.md`: comprehensive initial Spec/Quality review.
- `<NN>-round-<R>-review.md`: each scoped fix review, retaining finding IDs and verdict history.
- `final-review.md` and, when needed, `final-round-<R>-review.md`: aggregate review and each delivery-scoped corrective review.

Before dispatch, the controller assigns absolute report destinations inside the feature's `.scratch` directory and records their tracker-relative paths. Assign these paths directly; the comprehensive-review flow does not require a report-resolution command. `REPORT_FILE` is the assigned implementation report. Implementers and reviewers may save reports directly; append fix reports before review, preserving earlier attempts. Preserve historical separate-reviewer reports on resume, using their coverage where still valid rather than renaming or overwriting them. The controller checks that reports exist before using them.

Each report identifies its exact reviewed/tested code snapshot (base/head plus any uncommitted diff and untracked inputs), commands/results and limitations. Ticket comments link to these reports using relative paths and record acceptance/integration evidence. Preserve earlier rounds; do not overwrite history when resuming.

Before hand-back, verify reports match the recorded code snapshots and remain in `.scratch`. Preserve the existing checkout and all user changes. Report the reports' absolute paths and uncommitted status; commit tracker evidence only when authorized.

Session storage may hold working copies and raw diagnostics, but is not the sole home of acceptance evidence. Durable reports contain concise relevant output with secrets and sensitive environment values removed, not raw log dumps.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/YYYY-MM-DD-<effort-slug>/map.md` (the Notes / Decisions-so-far / Fog body). Use the same creation-date and stable-directory conventions as features; when exploring an existing feature, use its directory.
- **Child ticket**: `.scratch/YYYY-MM-DD-<effort-slug>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/YYYY-MM-DD-<effort-slug>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
