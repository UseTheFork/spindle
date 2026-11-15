# SDD workflow redesign

Status: accepted. Terms follow
[the SDD glossary](src/SubagentDrivenDevelopment/GLOSSARY.md).

## Goal

Make the subagent-driven development (SDD) workflow hard for an AI agent to get
wrong. The CLI owns procedure and every value it can compute; agents supply only
judgment and content that only they have. Blueprints describe roles and judgment,
not command syntax.

## Design principles

1. **The CLI is the source of truth for procedure.** `sdd next` prints the next
   command or commands with every required flag. `status` and `resume` use the
   same action logic and never print action labels that are not commands.
2. **A flag carries judgment, agent-only content, or an explicit selector.**
   The CLI computes values it can safely determine, but keeps explicit identity
   and scope selectors when they prevent ambiguity or keep command syntax
   consistent.
3. **`next` never makes a judgment.** Deterministic steps are printed in full.
   Judgment steps list the choices and stop.
4. **Commands are consistent.** A flag that a command requires is always
   required; the CLI does not make it optional in some states.
5. **Errors say what to do next.** Every error names the conflicting values and
   the command that resolves it.

## Decisions

### Procedure and output

- `sdd next` is the single source of the next action. `status` and `resume`
  share its logic.
- `next` prints `--feature` with its value and `--actor <acting-agent>` as a
  placeholder. It never guesses the agent's identity.
- Commands print what actually happened. `review` reports that reviews were
  dispatched, not completed. `finish` reports pending final validation instead
  of "Finished".
- The CLI owns the workflow steps. `next` reports a named step for the
  feature and for each active ticket, with that step's command. Step names are
  stable (`tickets-in-progress`, `ticket:implement`, `ticket:checks`,
  `ticket:review`, `ticket:adjudicate`, `ticket:correct`, `ticket:integrate`,
  `ticket:sync`, `ticket:post-merge`, `delivery:claim`, `delivery:checks`,
  `delivery:review`, `delivery:adjudicate`, `delivery:finish`,
  `delivery:cleanup`, `delivery:final-validation`, `delivery:complete`).
- Judgment points are steps of their own. `next` lists the choices and stops;
  the CLI never selects a branch.
- The skill drops its flowchart and lettered nodes. Agents announce the step
  name that `next` printed.
- `next` reports each open assignment, its role and ticket, elapsed time since
  dispatch, and whether its assigned report exists but has not been submitted.
  When a report is present, it prints the exact submit command. When reports
  are still missing and no work is ready, it says to wait.
- `next` reports recorded workflow state; it does not infer whether a worker is
  currently active. The skill retains runtime-based worker monitoring and
  intervention: check activity when supported, ask for status after a blocker,
  drift, or about five minutes without visible progress, and report a
  persistent stall while preserving work. Never automatically cancel or
  reassign a worker.

### Roles and entry point

- `sdd-implement-spec` is the user-facing skill that starts the workflow. It
  hands off to the `sdd-orchestrator` agent, which coordinates it. The handoff
  is stated explicitly in both files.
- The general `/implement` skill states that it is not the SDD workflow.
- Required reviewer roles: one ticket reviewer and one feature reviewer.
  Optional reviewers are catalog-approved specialists only.
- A re-review is another round of the same reviewer role. There is no separate
  re-review agent. Code-slop concerns belong to the relevant reviewer unless a
  specialist is registered.
- The orchestrator alone changes workflow state. Implementers and reviewers
  produce commits and reports and never run state-changing SDD commands.
  `--actor` therefore always identifies the orchestrator, including on
  `implement` and `review`; the assignment records which worker it dispatched.

### Ownership

- The ticket and delivery owner is the controller recorded when work starts.
  A different agent takes over only through `resume --confirm-handoff`.
- Delivery ownership is claimed explicitly, never as a side effect of the first
  delivery command. Use `sdd claim --scope delivery --feature <directory>
  --actor <acting-agent>` after all tickets are complete; `next` suggests it.
  Later handoffs use `resume --scope delivery --confirm-handoff`.
- One shared ownership error is used everywhere. It names the scope, the
  recorded owner, the received `--actor`, and both remedies.

### Commits and records

- Before `start`, records live in the original checkout. `start
  --confirm-records` makes the one initial commit on the original branch.
- `--confirm-records` means the orchestrator inspected the feature records for
  sensitive content and confirms they can be committed on the original branch.
  The CLI cannot make that judgment for the agent.
- After `start`, every command that changes records commits them immediately in
  the feature worktree. `--confirm-records` is removed from `implement`,
  `integrate`, and `finish`.
- The SDD implementer always commits its code on the ticket branch. Implementation
  `submit` rejects a report when the ticket branch has no new commits since the
  assignment started, or when the ticket worktree has uncommitted changes.
- Reports stay in the feature worktree. Assignments give the absolute
  `REPORT_PATH`.
- Assignment IDs remain UUIDs. The CLI prints the exact ID; documentation uses
  placeholders rather than invented short IDs.

### Tickets

- Ticket status is open or closed and is set only by the workflow. Execution
  phase tracks progress. `ticket update --status` is removed.

### Review and findings

- All reviewer roles share one report contract: a verdict of `passed`, `failed`,
  or `unavailable`, a summary, and zero or more structured findings. Reviewers
  do not assign canonical finding IDs. Each role keeps its own criteria.
- A finding is either blocking or non-blocking. Severity is removed; reviewers
  explain impact in the finding's details.
- The orchestrator reads the report and supplies `--result` when submitting a
  review. This CLI value is the authoritative workflow result; the CLI does not
  trust or parse the report's verdict formatting.
- The orchestrator explicitly registers each accepted finding with
  `finding create` before submitting the review. The report remains supporting
  evidence; the CLI does not parse it to create findings.
- `finding create` takes the review assignment ID; the CLI resolves the
  associated report path and records its provenance.
- `submit` derives the complete finding-ID list from records already linked to
  its assignment. `--findings` and `--no-findings` are removed; the CLI can
  validate whether findings were registered without asking the orchestrator to
  repeat their IDs.
- `review` computes the reviewed inventory itself. `--inventory` is removed.
- "Feature review" is the review gate. "Delivery" is the feature-wide phase and
  the CLI scope.

### Corrections and recovery

- `next` always lists every eligible finding and failed check and asks the
  orchestrator to choose, even when only one exists. The CLI never selects or
  combines corrections.
- Post-merge recovery adds an explicit `sync` step before `correct`. It moves the
  ticket worktree to the merge commit and refuses dirty or divergent worktrees.
- Final-check recovery: fix on the original branch, move the validation target
  with `checks revalidate --scope final`, rerun the final checks, then complete
  cleanup. Revalidation requires a clean checkout on the recorded original
  branch at a commit descended from the feature merge, and invalidates prior
  results.
- Declare the complete final-check list before `finish`. `finish` freezes the
  list and merges the feature; run and record those checks afterward on the
  original branch against the merge commit.

### Testing guidance

- Test-first development is encouraged. A red-to-green cycle is not required
  for every minor change. Verification appropriate to the change is required.
- Agents run required checks in the assigned worktree and report their actual
  command, result, and relevant output. The orchestrator records the evidence;
  the CLI does not execute checks.
- Keep ticket, post-merge, delivery, and final check scopes distinct because
  each validates a different Git state. `next` identifies the applicable scope.

### Journal recovery

- Do not add a generic `sdd recover` command. Feature start, ticket worktree
  creation, record commits, integration, and finalization have different
  persisted states and safety checks.
- Retry the operation that created the journal when it can safely continue
  forward from verified state. Errors name the journal, current state, exact
  retry command, and any required manual inspection.
- Never automatically delete or reset a dirty, divergent, or identity-mismatched
  worktree, branch, index, or journal. Stop with explicit manual recovery
  guidance instead.
- Add a focused recovery command only if an operation cannot be safely resumed
  by retrying its owning command.

## Flag changes

| Flag                          | Command                                | Change                              | Source of the value                                    |
| ----------------------------- | -------------------------------------- | ----------------------------------- | ------------------------------------------------------ |
| `--feature`                   | feature-scoped commands (not `create`) | replace `--spec`, keep required     | agent; `next` prints it                                |
| `--actor`                     | all                                    | replace `--author`, keep required   | agent; `next` prints a placeholder                     |
| `--workspace`                 | `start`, `implement`                   | keep, required                      | agent; must be an authorized location                  |
| `--assignment`                | `submit`, `finding create`             | keep, required                      | agent; `next` and dispatch output print it             |
| `--result`                    | review `submit`, `checks record`       | keep, required                      | orchestrator/agent; validated by the CLI               |
| `--command`                   | `checks record`                        | keep, required                      | agent-reported command; `next` echoes the declaration  |
| `--confirm-records`           | `start`                                | keep                                | agent confirmation                                     |
| `--confirm-records`           | `implement`, `integrate`, `finish`     | remove                              | records commit immediately                             |
| `--inventory`                 | `review`                               | remove                              | computed from the ticket diff                          |
| `--role`, `--report`          | `submit`                               | remove                              | the assignment                                         |
| `--findings`, `--no-findings` | `submit`                               | remove                              | derived from findings already linked to the assignment |
| `--unavailable`               | implementation `submit`                | replace with `--result unavailable` | orchestrator                                           |
| `--source`                    | `finding create`                       | replace with `--assignment`         | CLI resolves the assigned report                       |
| `--merge`                     | final `checks record`                  | remove                              | finalization journal                                   |
| `--rebase-baseline`           | `checks require`                       | remove                              | moves into `sync`                                      |
| `--paths`                     | `checks record`                        | remove                              | never read                                             |
| `--agent`                     | `review require`                       | remove                              | duplicate of `--type`                                  |
| `--status`                    | `ticket update`                        | remove                              | workflow sets status                                   |
| `--severity`                  | `finding create`                       | remove                              | only blocking status gates the workflow                |

Other retained inputs include agent identity and authorization (`--actor`,
`--workspace`, `--confirm-records`, `--confirm-handoff`), explicit selection
(`--feature`, `--ticket`, `--scope`, `--assignment`), judgments (`--result`,
`--decision`, `--assessment`, `--reason`, `--blocking`/`--non-blocking`,
`--type`), and agent-provided content (`--title`, `--details`, `--summary`,
`--command`, `--blocked-by`, `--blocker`).

## Example scenarios

Commands use `pnpm spindle sdd`. Output is illustrative; exact wording is
settled during implementation, but each output names the next command. For
failed or unavailable check and review results, supply `--details` with the
reason; omit it for passed review results. `next` prints these choices separately.

### 1. Starting a feature

```sh
pnpm spindle sdd start --feature .scratch/0042-export \
  --workspace /home/dev/worktrees --confirm-records
```

```text
Started feature 0042-export.
Feature worktree: /home/dev/worktrees/0042-export (branch features/0042-export)
Spec: /home/dev/worktrees/0042-export/.scratch/0042-export/spec.md
Run all further commands from the feature worktree.
Next: pnpm spindle sdd next --feature .scratch/0042-export
```

### 2. Asking for the next action

```sh
pnpm spindle sdd next --feature .scratch/0042-export
```

```text
Feature 0042-export: step tickets-in-progress
Ready tickets: T-0001, T-0002

T-0001: step ticket:implement (ready)
T-0002: step ticket:implement (ready)

Next (choose a ticket and an authorized worktree location):
  pnpm spindle sdd implement --feature .scratch/0042-export \
    --ticket <T-0001|T-0002> --workspace <absolute-authorized-directory> \
    --actor <acting-agent>
```

With work in flight, each active ticket reports its own step:

```text
Feature 0042-export: step tickets-in-progress
T-0001: step ticket:review (awaiting report for assignment <review-assignment-id>)
  Next: pnpm spindle sdd submit --feature .scratch/0042-export \
    --ticket T-0001 --assignment <review-assignment-id> \
    --result <passed|failed|unavailable> [--details <reason>] --actor <acting-agent>
T-0002: step ticket:implement (ready)
  Next: pnpm spindle sdd implement --feature .scratch/0042-export \
    --ticket T-0002 --workspace <absolute-authorized-directory> \
    --actor <acting-agent>
```

When no tickets are ready and assignments remain open:

```text
Feature 0042-export: step tickets-in-progress
Open assignments:
  T-0001 implementation <assignment-id>  dispatched 7m ago  report: missing
  T-0002 review         <assignment-id>  dispatched 3m ago  report: present, not submitted
    Next: pnpm spindle sdd submit --feature .scratch/0042-export \
      --ticket T-0002 --assignment <assignment-id> \
      --result <passed|failed|unavailable> [--details <reason>] --actor <acting-agent>
No ready tickets. Wait for the open assignments.
```

### 3. Implementation dispatch and submission

```sh
pnpm spindle sdd implement --feature .scratch/0042-export \
  --ticket T-0001 --workspace /home/dev/worktrees --actor sdd-orchestrator
```

```text
Implementation assignment <implementation-assignment-id> for T-0001.
Ticket worktree: /home/dev/worktrees/0042-export-T-0001 (branch tickets/0042-export/T-0001)
REPORT_PATH: /home/dev/worktrees/0042-export/.scratch/0042-export/reports/T-0001-implementation.md
Dispatch sdd-implementer with this assignment, then run:
  pnpm spindle sdd submit --feature .scratch/0042-export \
    --ticket T-0001 --assignment <implementation-assignment-id> --actor <acting-agent>
```

Submitting without a new commit on the ticket branch:

```text
Error: Ticket T-0001 has no commits since its baseline. The implementer must
commit its changes on tickets/0042-export/T-0001 before submitting.
```

### 4. Ticket checks before review

After implementation is submitted, declare the checks for this ticket:

```sh
pnpm spindle sdd checks require --feature .scratch/0042-export \
  --ticket T-0001 --command "pnpm exec vitest run tests/Export.test.ts" \
  --actor sdd-orchestrator
```

```text
Required ticket check recorded for T-0001.
Next, run this command in the ticket worktree:
  pnpm exec vitest run tests/Export.test.ts
After the agent reports the result, record it:
  pnpm spindle sdd checks record --feature .scratch/0042-export \
    --ticket T-0001 --command "pnpm exec vitest run tests/Export.test.ts" \
    --result <passed|failed|unavailable> [--details <reason>] --actor <acting-agent>
```

The agent runs the command in the ticket worktree. The orchestrator records
the reported outcome:

```sh
pnpm spindle sdd checks record --feature .scratch/0042-export \
  --ticket T-0001 --command "pnpm exec vitest run tests/Export.test.ts" \
  --result passed --actor sdd-orchestrator
```

```text
Recorded passed ticket check for T-0001.
Next: pnpm spindle sdd review --feature .scratch/0042-export \
  --ticket T-0001 --actor <acting-agent>
```

### 5. Ticket review with a finding

```sh
pnpm spindle sdd review --feature .scratch/0042-export \
  --ticket T-0001 --actor sdd-orchestrator
```

```text
Dispatched 1 review for T-0001 (inventory: 3 files, computed from the ticket diff).
Review assignment <review-assignment-id> (sdd-task-reviewer)
REPORT_PATH: /home/dev/worktrees/0042-export/.scratch/0042-export/reports/T-0001-review-<review-assignment-id>.md
After the reviewer returns, read and adjudicate the report. Register each
accepted finding with `finding create`, then run:
  pnpm spindle sdd submit --feature .scratch/0042-export \
    --ticket T-0001 --assignment <review-assignment-id> --result <passed|failed|unavailable> \
    [--details <reason>] --actor <acting-agent>
```

The reviewer's report includes:

```yaml
verdict: failed
summary: The export path accepts malformed rows.
findings:
  - summary: Reject malformed rows
    blocking: true
    details: The parser accepts a row with a missing column and continues.
    evidence: src/export/parser.ts:42
    requested_correction: Reject the row and add a regression test.
```

```sh
pnpm spindle sdd finding create --feature .scratch/0042-export \
  --ticket T-0001 --assignment <review-assignment-id> --blocking \
  --summary "Reject malformed rows" \
  --details "The parser accepts a row with a missing column and continues." \
  --actor sdd-orchestrator

pnpm spindle sdd submit --feature .scratch/0042-export \
  --ticket T-0001 --assignment <review-assignment-id> --result failed \
  --details "Blocking correctness issue in row parsing." --actor sdd-orchestrator
```

```text
Submitted review <review-assignment-id> for T-0001: failed.
Registered finding: F-0001 (blocking) Reject malformed rows
T-0001 is now changes-requested.
Next (confirm): pnpm spindle sdd finding update \
  --feature .scratch/0042-export --ticket T-0001 --finding F-0001 \
  --status confirmed --actor <acting-agent>
Next (dismiss): pnpm spindle sdd finding update \
  --feature .scratch/0042-export --ticket T-0001 --finding F-0001 \
  --status dismissed --details <rationale> --actor <acting-agent>
```

For deferral of this blocking finding, commit the approved requirements change,
record its approval with `requirements decide`, and obtain fresh passing review
coverage. Then use `finding update --status deferred` with `--details`,
`--follow-up`, and `--requirements-decision`. Delivery finding deferrals require
the same evidence.

### 6. Correction selection

```text
Eligible for correction on T-0001:
  F-0001 (blocking) Reject malformed rows
Choose which to correct in this attempt:
  pnpm spindle sdd correct --feature .scratch/0042-export \
    --ticket T-0001 --findings <one or more of: F-0001> \
    --details <correction-objective> --actor <acting-agent>
```

With several, the same format lists every candidate:

```text
Eligible for correction on T-0001:
  F-0001 (blocking) Reject malformed rows
  F-0003 (blocking) Missing error message
  check: pnpm exec vitest run tests/Export.test.ts (failed)
Choose which to correct in this attempt:
  pnpm spindle sdd correct --feature .scratch/0042-export \
    --ticket T-0001 --findings <one or more of: F-0001 F-0003> \
    --details <correction-objective> --actor <acting-agent>
  pnpm spindle sdd correct --feature .scratch/0042-export \
    --ticket T-0001 --check-failure "pnpm exec vitest run tests/Export.test.ts" \
    --details <correction-objective> --actor <acting-agent>
```

### 7. Successful ticket integration

After the review passes and there are no unresolved blocking findings:

```sh
pnpm spindle sdd integrate --feature .scratch/0042-export \
  --ticket T-0001 --actor sdd-orchestrator
```

```text
Integrated T-0001 into features/0042-export.
Post-merge checks are pending. Next, declare the required check:
  pnpm spindle sdd checks require --feature .scratch/0042-export \
    --ticket T-0001 --scope post-merge --command <check> \
    --actor <acting-agent>
```

The agent runs the check in the feature worktree; the orchestrator records it:

```sh
pnpm spindle sdd checks record --feature .scratch/0042-export \
  --ticket T-0001 --scope post-merge \
  --command "pnpm exec vitest run tests/Export.test.ts" --result passed \
  --actor sdd-orchestrator
```

```text
Recorded passed post-merge check for T-0001.
T-0001 is closed and can unblock dependent tickets.
Next: pnpm spindle sdd next --feature .scratch/0042-export
```

### 8. Ownership conflict

```sh
pnpm spindle sdd integrate --feature .scratch/0042-export \
  --ticket T-0001 --actor orchestrator
```

```text
Error: Ticket T-0001 is owned by sdd-orchestrator, but this command used
--actor orchestrator. If you are sdd-orchestrator, rerun with that value.
To take over, run:
  pnpm spindle sdd resume --feature .scratch/0042-export \
    --ticket T-0001 --actor <acting-agent> --confirm-handoff
```

### 9. Post-merge check failure

```text
Recorded failed post-merge check for T-0001: pnpm exec vitest run tests/Export.test.ts
Other ticket integrations are blocked until T-0001 passes post-merge checks.
Next: pnpm spindle sdd sync --feature .scratch/0042-export \
  --ticket T-0001 --actor <acting-agent>
```

```sh
pnpm spindle sdd sync --feature .scratch/0042-export \
  --ticket T-0001 --actor sdd-orchestrator
```

```text
Fast-forwarded /home/dev/worktrees/0042-export-T-0001 to the T-0001 merge commit.
Next: pnpm spindle sdd correct --feature .scratch/0042-export \
  --ticket T-0001 --check-failure "pnpm exec vitest run tests/Export.test.ts" \
  --details <correction-objective> --actor <acting-agent>
```

With uncommitted changes in the ticket worktree:

```text
Error: The T-0001 worktree has uncommitted changes and was not moved.
Commit or remove them in /home/dev/worktrees/0042-export-T-0001, then rerun sync.
```

### 10. Finish and final validation

Declare the final check list on the feature branch before finalization:

```sh
pnpm spindle sdd checks require --feature .scratch/0042-export \
  --scope final --command "pnpm run build" --actor sdd-orchestrator
```

```text
Declared 1 final check for 0042-export.
The list is frozen when finish begins. Checks run after the feature merge.
Next: pnpm spindle sdd finish --feature .scratch/0042-export \
  --actor <acting-agent>
```

```sh
pnpm spindle sdd finish --feature .scratch/0042-export --actor sdd-orchestrator
```

```text
Merged features/0042-export into main. Final validation is pending.
Next, in the original checkout, run each declared final check and record it:
  pnpm spindle sdd checks record --feature .scratch/0042-export \
    --scope final --command "pnpm run build" --result <passed|failed|unavailable> \
    [--details <reason>] \
    --actor <acting-agent>
```

If a final check fails, fix the failure on the original branch, move the
validation target to the new commit, rerun the declared checks, and record
results against that target. `checks revalidate` is the explicit safe
transition; the CLI must not accept a result for a commit that was not checked.

```text
Final check failed on the recorded merge commit: pnpm run build
Fix the failure on main and commit it.
Next: pnpm spindle sdd checks revalidate --feature .scratch/0042-export \
  --scope final --actor <acting-agent>
```

### 11. Claiming delivery ownership

```sh
pnpm spindle sdd claim --scope delivery --feature .scratch/0042-export \
  --actor sdd-orchestrator
```

```text
Delivery ownership recorded for sdd-orchestrator.
Next: pnpm spindle sdd next --feature .scratch/0042-export
```

## Open questions

- None.
