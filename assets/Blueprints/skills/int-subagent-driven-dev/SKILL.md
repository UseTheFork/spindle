---
name: int-subagent-driven-dev
description: "This is an internal skill do not load it unless explicitly required by the user or another skill."
user-invocable: false
metadata:
  spindle:
    version: 1.9.0
---

# Subagent-Driven Development

The controller coordinates a feature's tickets, workers, checks, reviews, and
completion. The feature workspace and `sdd.json` are the source of truth for
structured ticket and delivery state. Each ticket Markdown file holds its
requirements, acceptance criteria, and discussion.

The SDD CLI owns workflow sequencing and exact transition commands. Blueprints
define roles, judgment, and safety invariants; do not copy action command
sequences into workflow guidance. Use the commands and choices printed by
`sdd next`.

Add JSON output when consuming structured results. Read the success envelope's
`data` field; stdout contains one result, while stderr contains JSON notices or
errors. A nonzero exit indicates failure. Human output is the default, and JSON
mode never prompts.

## Workflow

1. Run `sdd next` at the start, after a handoff, and after each completed
   command or decision.
2. Announce the named step that `next` reports. Follow its exact command or
   choices. Do not infer the next step from this skill or from status labels.
3. If `next` lists choices, make the judgment and report the decision. The CLI
   does not choose a branch.
4. If `next` reports open assignments, follow [active subagent
   monitoring](./references/active-subagent-monitoring.md).

## Ticket workflow

1. Read the feature spec, tickets, applicable instructions, glossary, and ADRs.
   Inspect canonical records for sensitive content before starting the feature
   worktree. Handle unrelated changes before the start.
2. Create tickets for independently actionable work. Fill each ticket's
   requirements and acceptance criteria before implementation. Use the CLI to
   change canonical workflow state; do not edit the ledger or set ticket status
   by hand.
3. Choose a safe concurrency limit. Dispatch ready tickets to separate
   worktrees, up to that limit. Give each worker its assignment, canonical
   sources, and assigned absolute report path. The controller alone changes
   workflow state; workers commit code and return reports.
4. Keep requirements committed and current. If canonical requirements change
   after dispatch, update the ticket worktree from the feature baseline before
   checks, review, or integration. Keep a ticket worktree frozen during review.
   Rework needs fresh checks and focused review.
5. Integrate tickets serially. Run and record their post-merge checks before
   treating them as complete or unblocking dependents. Do not merge around a
   failed check.

   If a post-merge check fails, keep other merges blocked. Use the sync step
   and exact command printed by `sdd next` before dispatching correction. Sync
   fast-forwards only a clean, non-divergent ticket worktree to the recorded
   failed merge. Then follow `sdd next` for the exact correction command.

   If integration reports a conflict, rebase the ticket worktree onto the
   current feature branch, resolve and commit the conflict, then use the sync
   step printed by `sdd next` to adopt the updated comparison baseline. Run
   fresh checks and obtain focused rework review before retrying integration.

6. Preserve work when a command, handoff, or Git operation is interrupted. Use
   the recovery steps printed by the CLI. Never reset state, delete a worktree,
   or reassign a worker automatically.

## Feature review and completion

After all tickets are complete, follow the feature-level steps from `sdd next`.
Delivery ownership is explicit. The required ticket and feature reviewers are
independent roles; optional specialists must be catalog-approved and available
in the runtime.

Reviewers assess the assigned committed target and write only to their assigned
report. The controller reads the report, supplies the authoritative review
result, and explicitly registers accepted findings before submission. A report
may be malformed, so do not rely on the CLI to infer a verdict or findings from
report text.

Findings are blocking or non-blocking. The controller chooses corrections and
adjudication outcomes; the CLI lists eligible choices but never selects or
combines them. For post-merge recovery, synchronize the ticket worktree to the
recorded merge before correction. For final-check recovery, revalidate the
target, rerun checks, and record fresh results.

Declare the complete final-check list before finishing. Run and record those
checks after the feature merge in the original checkout. Completion and cleanup
must preserve the merge and all evidence. Never stash, discard, force-delete,
push, or publish without authorization.

## Reports and verification

Keep worker reports at their assigned absolute paths inside the feature's
`reports/` directory. Preserve earlier reports as history. Distinguish inspected
evidence from checks actually run. Record failures, unavailable checks, and
limitations explicitly. A passing test run is not a substitute for review or
for the acceptance criteria.

See [verification evidence](./references/verification-evidence.md) for the
worker handoff contract.
