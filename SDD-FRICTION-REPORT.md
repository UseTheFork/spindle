# SDD CLI friction report: feature 0001-ticket-task-dispatch

This report covers friction observed while delivering feature `0001-ticket-task-dispatch` with `pnpm spindle sdd ...`, plus related controller and agent handoff friction. A run is "blocking" when the CLI stopped progress and the cause was not a real defect in the delivered work. Some safety gates were valid; the friction was that they were discovered late or gave too little diagnostic information.

Severity levels:

- **High** stopped delivery and needed a code change, a user decision, or a workaround.
- **Medium** cost a lot of investigation or rework.
- **Low** is a minor nuisance.

## 1. Finalization (`sdd finish`)

### 1.1 Ignored files block finish, and the error does not list them (High)

- **What happened:** `sdd finish` failed with: "Preserve unrelated, ignored, renamed or conflicted files; only canonical records may be dirty."
- **Cause:** `FeatureFinalizationService.recordsOnly` counts **ignored** files as dirty. In this run, those files were the generated `build/` and the installed `node_modules/` in the feature worktree.
- **Conflict:** The required checks (`pnpm run build`, `pnpm test`) need those directories. The user had instructed us not to symlink `node_modules` and to run `pnpm install`, so real dependency installations existed in the worktrees. Build and test checks also create `build/`.
- **Diagnosis:** The message did not name any path. The usual `git status --ignored --untracked-files=no` hid the nested ignored files. We found them only with `--untracked-files=all`.
- **Resolution:** Finish could continue only after the user agreed to delete the directories.
- **Suggestion:** Allow ignored files in the feature worktree, at least known generated or dependency directories. Otherwise, list the paths that block finish and print a cleanup command.

### 1.2 Running the CLI and deleting `node_modules` depend on each other (Medium)

- **Problem:** After we deleted `node_modules` to satisfy 1.1, `pnpm spindle` could no longer run from the feature worktree.
- **Workaround:** We exported `HEAD` with `git archive` into a separate session directory, ran `pnpm install` there, and invoked `tsx <runtime>/src/index.ts sdd ...` from the feature worktree.
- **Repeat:** A correction worker later reinstalled `node_modules` in the feature worktree, so we had to delete it again before the next `finish`.
- **Suggestion:** Fix 1.1. Also document a supported way to run the CLI against a worktree from a separate installation.

### 1.3 The cleanup inventory error does not name the item (Medium)

- **What happened:** finish failed with "Unrecorded feature/ticket worktree or branch; cleanup inventory is incomplete." The message named no branch or worktree.
- **Diagnosis:** We had to read `FeatureFinalizationService.inventory` and compare `git worktree list` and `git branch` output with the ledger by hand.
- **Cause:** The extra item was `tickets/0001-ticket-task-dispatch/T-0002-pre-dispatch` and its worktree, which were left over when an earlier T-0002 dispatch was recovered by renaming the branch. A recovery path left an item that the SDD ledger never recorded, and that item later blocked finish.
- **Removal friction:** `git worktree remove` succeeded, but `git branch -d` first refused from the original checkout because the branch was not merged into that checkout's current branch. Running the safe delete from the feature worktree, where it was an ancestor, succeeded. The failure was Git's safety check, but naming the owner and the relevant base in the SDD inventory diagnostic would have made the safe resolution clearer.
- **Suggestion:**
  - Name every unrecorded branch and worktree in the error.
  - Have the recovery that created `*-pre-dispatch` either record the item or clean it up.
  - Report unrecorded items in `sdd status` or `sdd next` long before finish.

### 1.4 Finish rejected SDD's own records (High)

The ledger relocation step in `FeatureFinalizationService.relocate` rejected data that SDD itself had written:

- **Finding history text:** `FindingService` and `DeliveryFindingService` write the history entries `"Registered from <absolute report path> at commit <sha>."` and `"Linked observation from <path> ..."`. Relocation then failed with "Embedded workflow path cannot be silently rewritten; resolve it before finishing." A feature with a normal finding report inside its feature worktree would hit this error. The error did not say which ledger field or which path caused it. We had to write a script to walk the ledger and find it.
- **Task assignment worktrees:** The new task records store `tickets[].tasks[].assignment.worktree` as an absolute path to the ticket worktree. Relocation rejected these with "Cannot safely relocate recorded path".
- **Fix:** Both defects were fixed in correction round 8.
- **Suggestions:**
  - Make relocation errors name the JSON pointer and the path.
  - Avoid storing absolute workspace paths in free text.
  - Add a contract test: every record that SDD writes must survive `relocate`.

### 1.5 `sdd next` said finish was ready when it would fail (Medium)

- **What happened:** `sdd next` reported `step delivery:finish` and `Blocker: none` every time. Each `finish` attempt then failed on a later check.
- **Failure order:** ignored files, then the inventory, then embedded paths, then task worktrees.
- **Suggestion:** Run the read-only parts of finish (`recordsOnly`, `inventory`, a dry run of `relocate`, and schema validation of the relocated ledger) as a preflight in `next` and `status`. Report all failures together, not one per attempt.

### 1.6 The relocated ledger is validated only after the merge (Medium)

- **What happened:** The first version of the round 8 fix passed the first phase of the end-to-end **fixture test** (merge), but the fixture's later finalization phase failed with `TaskSchema`'s "Invalid task assignment." This was caught before the feature's real merge. The fix made `worktree` optional only for submitted task assignments and added tests.
- **Remaining risk:** In production, `FeatureFinalizationService` still validates the relocated ledger in `metadata()`, after the feature merge. A different schema-invalid relocation could therefore be discovered post-merge. The round 8 reviewer recommended validating the relocated ledger before merging.
- **Suggestion:** Validate the complete relocated ledger before the merge, and add a regression that proves invalid relocated data leaves the original branch unchanged.

### 1.7 The final-validation step gives no next command (Low)

- **What happened:** After all final checks were recorded as passed, `sdd next` printed only `Feature ...: step delivery:final-validation`. It gave no `Next:` command.
- **Workaround:** We had to guess that a second `sdd finish` run from the **original checkout** would complete validation and cleanup.
- **Suggestion:** Print the exact finish command and the directory to run it from. Finish runs in two phases (first from the feature worktree, then from the original checkout), and the CLI output should state that.

### 1.8 Unrelated changes in the original checkout block finish (Low)

- **What happened:** An uncommitted change in `ReviewCli.test.ts` that only reordered imports blocked finish. Removing it needed a user decision.
- **Assessment:** The check is reasonable, but the message could name the file and suggest a resolution.

## 2. The correction and adjudication workflow

### 2.1 Finish failures have no supported correction path (High)

A delivery correction (`sdd correct --scope delivery`) requires either `--findings` or a recorded failed `--check-failure`. A failure that finish discovers is neither. It produced no review report, so there was no finding, and it was not a declared check. These are the steps we took:

1. We recorded `sdd correct --decision pause --reason worker-blocked`, which moved delivery to the `adjudicate` step.
2. `sdd next` then printed "Judgment required: inspect failed feature-review reports and choose an available correction or adjudication action". No review had failed, and JSON `actions` was `[]`.
3. `sdd correct --decision continue` without findings failed with "correct requires actionable --findings or a non-mechanical --check-failure."
4. `sdd review --scope delivery` failed because review dispatch is blocked while adjudication is pending.
5. `sdd finding create` needs a review assignment, and no review assignment existed.
6. **Workaround:** We wrote a session script (`finish-relocation-check.mts`) that reproduces the relocate failure. We declared it as a required delivery check, recorded it as `failed`, and used it as `--check-failure` to open correction attempt 8.

This was close to a deadlock. As a side effect, the ledger now contains a delivery check whose command includes an absolute path to session storage. The check is therefore tied to that session file remaining available; it is not portable to another checkout or environment.

**Suggestion:** Add a correction source for finalization or controller-observed failures (for example `--observed-failure <details>`). Or let finish register a finding when it fails. The adjudicate step must also list its real choices.

### 2.2 An earlier correction needed a pause first (Medium)

- **What happened:** To fix the `GitEvidence.deliveryInputsPreserved` guard bug, the correction command suggested by SDD was rejected because delivery execution was `reviewing`.
- **Workaround:** We first had to record a `worker-blocked` pause, which moved delivery to `changes-requested`.
- **Suggestion:** Make the transition that `next` suggests valid from the current state, or have `next` print the pause step first.

### 2.3 A one-off waiver needed a new CLI feature (Medium)

- **What happened:** T-0004 had no task plan because its implementation started before task plans were required.
- **Why existing commands failed:** The requirements decision command needs a linked review finding, and none was relevant.
- **Workaround:** We added a new ticket (T-0005) that adds a one-use `sdd correct --approved-exception` path.
- **Suggestion:** Provide a general, auditable `requirements` decision or waiver that a user approves and that does not need a finding.

### 2.4 The guard that checks for changed source files was wrong (High)

- **What happened:** `GitEvidence.deliveryInputsPreserved` ran its path comparison from the nested `.spindle/features/...` directory. The Git pathspec `.` therefore missed all source files.
- **Effect:** F-0001 could not be marked as fixed even though committed fixes existed.
- **Fix:** The guard now compares from the repository root, with a regression test.

## 3. Checks

### 3.1 The declared formatting check included unrelated baseline files (Medium)

- **What happened:** The repo-wide `pnpm run fmt:check` failed on 108–109 unrelated baseline files.
- **Workaround:** We removed the repo-wide requirement through SDD with a written reason and replaced it with a custom changed-file command:

  ```sh
  pnpm exec oxfmt --check $(git diff --name-only --diff-filter=ACMRT 6d270a6b...HEAD | grep -v '^\.spindle/features/')
  ```

- **Shell quoting:** Commands are matched as exact strings. The CLI output then quotes this command as `'\''^\.spindle/features/'\''`, which is easy to break when copying, and each record step needs the identical string.
- **Assessment:** Oxfmt itself supports checking selected files; the friction was that the declared check was repo-wide and SDD requires the exact command string to be repeated when recording it.
- **Suggestion:** Provide a built-in changed-file check and let check records refer to a stable check ID or structured arguments instead of a shell string.

### 3.2 The full test suite ran repeatedly (Low)

- **What happened:** The full suite takes about 7 minutes. In round 8 it ran three times: by the worker, for the delivery check, and for the final check.
- **Why:** Workflow-record commits move `HEAD`, but the code does not change.
- **Suggestion:** Let a check passed on the code commit satisfy a later commit when only workflow records changed. SDD already treats record-only commits as equivalent for review targets.

## 4. CLI usability

### 4.1 Finding the `--actor` value needs a ledger search (Low)

- **What happened:** Every command prints `--actor <acting-agent>`, but nothing shows the actor value already recorded.
- **Workaround:** We searched `sdd.json` for `"controller": "Copilot"`.
- **Suggestion:** Fill in the recorded owner or controller in the commands that `next` prints.

### 4.2 JSON output is too large and does not match the human output (Low)

- **What happened:** `sdd next --json` printed about 61 KB, mostly the full delivery history. It was too large to read in place.
- **Mismatch:** Its `actions` and `blockers` were empty, while the human output said a judgment was required.
- **Suggestion:** Keep `next --json` small: the step, the blockers, and the choices. Put history in `status --json`.

### 4.3 Workflow-record commits are noisy (Low)

- **What happened:** Almost every state-changing command creates a `spindle: record ... workflow` commit.
- **Effect:**
  - The history is cluttered.
  - `HEAD` moves after every command.
  - Agents have to tell the code commit apart from the record commits, for example when a review assignment pins `8d8cd3b` but `HEAD` is `8bb28d7`.

### 4.4 Output and placement are inconsistent (Low)

- **`pnpm -s` output:** `pnpm -s spindle ...` still prints the `$ tsx src/index.ts ...` line.
- **Worktree placement:** Ticket worktrees were created under two different parents (`files/` and `files/sdd-worktrees/`), which made the inventory harder to check by hand.

## 5. Subagent handoff

### 5.1 Correction handoff required repeated context repairs (Medium; mixed CLI/controller friction)

- **What happened:** Three implementer handoffs returned `NEEDS_CONTEXT`. The first two had not started work and asked for scope/mode/source pointers/file scope/permissions, then rulings and finding IDs. A third worker implemented the relocation change but stopped when it discovered the required schema changes were outside its file scope and needed an explicit ruling.
- **Effect:** Finished one-shot agents could not receive follow-up messages ("No agent found with agent_id"), so the work was dispatched again with a revised prompt each time.
- **Cause:** The controller's initial prompts omitted fields the worker contract required and set a file scope before tracing the post-merge validation path. `sdd correct` prints an assignment ID and report path, but no complete handoff template for correction work.
- **Suggestion:** Generate a correction/review handoff from the CLI with the complete required fields. The controller should inspect schema and finalization call paths before fixing the worker's file scope.

### 5.2 Scope was set before the full validation path was traced (Medium; controller friction)

- **What happened:** The third worker found that ruling-compliant code needed `TaskSchema.ts`, which was outside the given `FILE_SCOPE`. It stopped with uncommitted work and required a new dispatch.
- **Assessment:** The worker correctly respected its scope. The controller could have avoided the extra dispatch by checking how the relocated ledger is validated before assigning the correction.

### 5.3 Agent/runtime instructions conflicted with the handoff contract (Low; not an SDD CLI issue)

- **Commit hashes:** The implementer would not report its commit hash ("role rules say not to copy commit IDs"). The controller had to look up the hash to verify the work.
- **Commit trailer:** The commit-format skill and session trailer requirement were in tension, so the worker needed an explicit resolution.
- **Assessment:** These were agent instruction issues, not `spindle sdd` command defects. Keep them separate from CLI friction.

## 6. Findings left open after the final review

The round 8 aggregate review passed with no blocking findings. It registered or reaffirmed these non-blocking observations, which are useful follow-up work but did not prevent delivery:

- **F-0002 — Task assignment can persist when handoff construction fails.** Assignment state and path reservations can be persisted before handoff validation fails.
- **F-0003 — Embedded report-path rewrite accepts a trailing `.` followed by more path text.** The reviewer noted examples such as `a.md.bak` and `a.md./../x`; the report-path rewrite can consume the valid prefix without validating the suffix. The reviewer assessed practical exposure as low because SDD generates the prose.
- **F-0004 — Finalization fixtures still hide realistic task worktree assignments.** Some fixtures seed task worktrees outside cleanup targets or move them before finish, so they do not exercise the production-shaped case.
- **F-0005 — Task handoff missing-worktree guard is untested.** The new guard has no direct regression test.

These are not CLI blockers. They are follow-up quality work, not unresolved delivery gates.

## 7. What was not a CLI defect

- The clean-checkout requirement was reasonable. An unrelated import-order diff in `ReviewCli.test.ts` needed to be resolved before finish; the friction was the lack of a filename-specific diagnostic and the need to coordinate its removal.
- Re-running required checks against the post-merge validation target was an intentional delivery gate, not a workflow bug. The avoidable cost was running the full suite multiple times on identical source after record-only commits.
- The unrecorded `T-0002-pre-dispatch` branch/worktree was genuinely unsafe to clean up silently. The CLI should identify it, but refusing cleanup until ownership was understood was appropriate.

## Highest-impact fixes

1. Run a full finish preflight in `next` and `status` (records-only, inventory, relocate dry run, and relocated-schema validation) and report all problems at once (1.1, 1.3, 1.4, 1.5, 1.6).
2. Name the exact offending paths, branches, and JSON pointers in every finish error (1.1, 1.3, 1.4).
3. Allow ignored generated and dependency directories in the feature worktree (1.1, 1.2).
4. Add a correction source for failures that are not findings or checks, and list real choices at the adjudicate step (2.1, 2.2).
5. Print a complete correction/review handoff from the CLI and align it with worker requirements (5.1).
