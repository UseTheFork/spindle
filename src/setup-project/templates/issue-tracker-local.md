# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/YYYY-MM-DD-<feature-slug>/`, using the date the directory is created and a descriptive kebab-case slug, for example `.scratch/2026-10-19-dataset-foundation/`.
- Reuse that dated directory for the feature's entire lifecycle, including work resumed on later days. Derive its root from the supplied spec, ticket or map path; keep its specs, tickets, reports, maps and retrospective together.
- The spec is `.scratch/YYYY-MM-DD-<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/YYYY-MM-DD-<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- The reporter is identified by a `Reporter:` line near the top of each issue file; use `unknown` when unavailable
- Triage category is recorded as `Category: bug` or `Category: enhancement`; triage state is recorded in a `Status:` line near the top of each issue file (see `triage-labels.md`)
- Delivery progress is recorded as a separate `Execution:` line directly below `Status:` (see "Execution state" below)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading. Give each entry an author and UTC timestamp in this format: `**YYYY-MM-DDTHH:MM:SSZ - @username**`, followed by the comment body. Use `unknown` when the author is unavailable. For triage-generated comments, the first line of the comment body must be the AI disclaimer required by the triage skill.

Historical comments without author or timestamp metadata remain unchanged. Do not infer their authorship or ordering; reporter activity cannot be determined from them.

## Canonical tracker checkout during delivery

At pre-flight, record the absolute path of the existing checkout and the feature's dated `.scratch/` directory in the session ledger. Keep both canonical on resume. Agents may update assigned `.scratch` files and save reports directly; coordinate file ownership to avoid concurrent writes and preserve history. The controller still owns execution states and acceptance decisions. Verify every agent can read canonical inputs, including uncommitted files; inaccessible sources are a blocker. Preserve user changes and never replace or delete `.scratch`.

## Execution state

`Status:` answers **who acts next and whether the work is ready** (triage). `Execution:` answers **how far delivery has progressed**. They are independent: an issue stays `Status: ready-for-agent` while its `Execution:` advances. Only the implementation controller writes `Execution:`; implementers and reviewers never do.

Add the line when work is picked up; an issue without it has not started.

| Execution           | Set when                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `claimed`           | The controller picks the issue up and records the existing checkout and base revision                                          |
| `implementing`      | An implementer is dispatched                                                                                                   |
| `in-code-review`    | A fresh reviewer examines the tested implementation before task review                                                         |
| `in-review`         | A task review or scoped re-review is in progress                                                                               |
| `changes-requested` | Review returned blocking findings to the implementer                                                                           |
| `accepted`          | Code review, Spec and Quality pass on the current snapshot with no blocking findings or unresolved declined-behavior decisions |
| `integrated`        | Accepted work in the existing checkout has been freshly verified                                                               |
| `blocked`           | A technical blocker stops delivery (environment, access, failing dependency)                                                   |

Typical path: `claimed → implementing → in-code-review → in-review → accepted → integrated`.

Either review may return blocking findings: `changes-requested → implementing → in-code-review` (code-only scoped fix review), or `changes-requested → implementing → in-review` (task scoped fix review). Code-fix clearance still requires initial task review. Keep snapshot, finding IDs, rulings and fix-round counter in comments/ledger. `int-subagent-driven-dev` permits five corrective dispatches per task shared across review phases and integration fixes, then adjudication without round 6; standalone final review permits one fix dispatch and one scoped re-review. Resume from the logged phase and budget, never reset it. Matching scoped evidence may update a verdict while preserving unaffected evidence; stale or missing required evidence blocks acceptance. Log executor rulings on every declined behavior and park only nonblocking findings with reasons and follow-up. Unresolved load-bearing findings prevent acceptance; requirement decisions follow the triage rule below.

On every change, append a one-line entry under `## Comments` naming the new value, the snapshot (commit or diff), and the reason.

**Requirement gaps go back to triage, not to `Execution: blocked`.** If delivery finds the brief unclear, contradictory, or incomplete, set `Status:` to `needs-info` (question for the reporter) or `needs-triage` (decision for the maintainer), keep the current `Execution:` value, and post the specific question. Use `Execution: blocked` only when the requirements are sound but the work cannot proceed.

**Hand-back on `integrated`:** for an external PR, `integrated` means the accepted changes are on the PR's head branch and freshly verified; then set `Status: ready-for-human` (ready to merge). For an issue, leave `Status:` unchanged and close it only when the user authorizes closure.

## When a skill says "publish to the issue tracker"

Create a new file under the feature's dated directory, `.scratch/YYYY-MM-DD-<feature-slug>/` (creating the directory if needed using the conventions above).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Delivery reports

Keep durable delivery evidence in `.scratch/YYYY-MM-DD-<feature-slug>/reports/`:

- `<NN>-implementation.md`: full implementer report; append fixes with round, finding IDs and fresh covering-check evidence.
- `<NN>-code-review.md` and `<NN>-task-review.md`: initial review reports.
- `<NN>-round-<R>-review.md`: each scoped fix review, retaining finding IDs and verdict history.
- `final-review.md` and, when needed, `final-fix-review.md`: aggregate review and its scoped follow-up.

Before dispatch, the controller assigns absolute report destinations inside the feature's `.scratch` directory and records their tracker-relative paths. Resolve them in the existing checkout with `spindle sdd workspace --workspace <checkout> --reports-dir <feature-reports-directory> --ticket <NN>`. `REPORT_FILE` is the assigned implementation report. Implementers and reviewers may save reports directly; append fix reports before review, preserving earlier rounds. The controller checks that reports exist before using them.

Each report identifies its exact reviewed/tested code snapshot (base/head plus any uncommitted diff and untracked inputs), commands/results and limitations. List implementation and test changes separately from mutable `.scratch` tracker and report files, so a full-tree fingerprint difference from controller-owned artifacts is not mistaken for a code change; still list and review every supplied change. Ticket comments link to these reports using relative paths and record acceptance/integration evidence. Preserve earlier rounds; do not overwrite history when resuming.

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
