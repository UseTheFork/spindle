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
