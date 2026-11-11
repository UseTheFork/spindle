---
name: int-subagent-driven-dev
description: "This is an internal skill do not load it unless explicitly required by the user or another skill."
user-invocable: false
metadata:
  spindle:
    version: 1.5.0
---

# Subagent-Driven Development

The controller coordinates a feature's tickets, workers, checks, reviews, and completion. The feature workspace and `sdd.json` are the source of truth for structured ticket and delivery state; each ticket Markdown file holds its requirements, acceptance criteria, and discussion.

The worktree workflow is incomplete: post-merge validation, dependent-ticket unblocking, final feature integration, and cleanup are unavailable. Do not use the legacy shared-checkout instructions below to bypass those gates or claim feature completion. Stop and report the blocker while preserving worktrees, branches, and workflow records.

## Workflow map

Before acting on each chart node, announce `Step <node ID> - <node label>`, including initial entries, resumed steps, and loop re-entries. After each decision, state its result and selected branch before entering the target node.

```mermaid
flowchart TD
    A[Restore feature state and readiness] --> B{Ready ticket available?}
    B -- Yes --> C[Claim, implement, verify, submit, close ticket]
    C --> A
    B -- No --> D{All tickets closed?}
    D -- No --> E[Resolve prerequisites or record blocker]
    E --> A
    D -- Yes --> F[Run feature checks]
    F --> G{Checks current and passing?}
    G -- No --> K[Correct feature-level work]
    G -- Yes --> H[Request comprehensive feature review]
    H --> I{Blocking finding?}
    I -- Linked ticket --> J[Resume ticket work after review batch]
    J --> A
    I -- Feature-level --> K
    K --> L
    I -- No --> L{Finish gates pass?}
    L -- No --> A
    L -- Yes --> M[Finish feature]
```

## Ticket workflow

1. Read the feature spec, tickets, applicable instructions, glossary, and ADRs. Inspect `{{ computed.spindle_package_manager }} spindle sdd status --spec <path>` and `{{ computed.spindle_package_manager }} spindle sdd ready --spec <path>` to understand blockers, dependencies, and available work.
2. Create a ticket for independently actionable work with `{{ computed.spindle_package_manager }} spindle sdd ticket create`. Fill its `[REQUIREMENTS]` and `[ACCEPTANCE CRITERIA]` placeholders. Use `{{ computed.spindle_package_manager }} spindle sdd ticket update` for tracker status, explicit blockers, and dependencies; the supported lifecycle is `open`, `in-progress`, and `closed`. Readiness is derived from status, blockers, and dependencies rather than stored as a separate triage state.
3. Claim a ready ticket with `{{ computed.spindle_package_manager }} spindle sdd claim`. Dispatch implementation with `{{ computed.spindle_package_manager }} spindle sdd implement`; pass the worker the exact assignment and report destination. Submit its report with `{{ computed.spindle_package_manager }} spindle sdd submit --role implementation`.
4. Run relevant tests and checks and record their actual outcomes against the current snapshot. TDD is not required, but verification is.
5. Address implementation and verification gaps, then close the ticket with `{{ computed.spindle_package_manager }} spindle sdd ticket update --status closed` once its acceptance criteria are met. Do not use per-ticket accept or integrate steps.

If work is interrupted, inspect `{{ computed.spindle_package_manager }} spindle sdd status` and use `{{ computed.spindle_package_manager }} spindle sdd resume` to restore the recorded assignment. Preserve existing reports, findings, and evidence. Do not invent missing results or reset progress.

## Feature review and completion

After every ticket is closed, establish current feature-level checks and request the comprehensive review with `{{ computed.spindle_package_manager }} spindle sdd review --scope delivery --inventory <json-array>`. The `sdd-reviewer` is the default reviewer. Add specialists only for justified objectives with `{{ computed.spindle_package_manager }} spindle sdd review require --scope delivery --type <agent-name>`; eligible names must be marked `canReview: true` in the Blueprint Catalog, and actual agent access must be confirmed before dispatch.

Submit every assigned review report against its exact assignment. Register findings from their report and snapshot. A blocking finding can name `--related-ticket`; once the complete review batch is submitted, that ticket is reopened so work can resume. Resolve blocking findings through ticket work and repeat any invalidated checks and reviews.

For detailed review, findings, correction, and finish steps, read [feature delivery](./references/full-spec.md). For feature-level corrective work, follow [corrective rounds](./references/corrective-rounds.md). Feature completion requires all tickets closed, current passing required checks and reviews, and no unresolved delivery blockers. Use the normal Git workflow; SDD does not stage, commit, or publish work and has no per-ticket integration command.

## Reports and verification

Keep worker reports at their assigned absolute paths inside the feature's `reports/` directory. Preserve earlier reports as history and distinguish inspected evidence from checks actually run. Record failures, unavailable checks, and limitations explicitly. A passing test run is not a substitute for review or for the acceptance criteria.

See [verification evidence](./references/verification-evidence.md) for the worker handoff contract.
