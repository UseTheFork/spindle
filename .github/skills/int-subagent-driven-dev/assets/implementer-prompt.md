# Template

```md
## Assignment

Scope: [ticket/delivery]
Assigned work item: [TICKET_ID for ticket scope; delivery correction for delivery scope]
Ticket ID: [TICKET_ID for ticket scope; NONE for delivery scope]
Assigned ticket or feature worktree: [CHECKOUT]
Mode: [INITIAL_OR_CORRECTIVE]

## Requirements and starting state

Canonical ticket sources, or delivery spec and assigned correction/evidence sources:
[ABSOLUTE_SOURCE_POINTERS]

Ticket acceptance criteria and test seams, or delivery correction objective and test seams:
[CRITERIA_AND_SEAMS]

Completed ticket dependencies and committed requirements, or NONE when not applicable:
[DEPENDENCIES_AND_REQUIREMENTS]

## Scope and permissions

Allowed code and test files in the assigned checkout, and the canonical report path:
[FILE_SCOPE]

Permissions, including commit authorization:
[PERMISSIONS]

Before each commit, format changed implementation files with the target project's
configured formatter. Commit implementation changes in the assigned worktree.
Do not pass commit IDs or content hashes to the controller; the workflow records
the committed target.

## Verification and hand-back

Approved project checks and test working directory:
[CHECKS_AND_DIRECTORY]

Assigned `.spindle/features` report path:
[REPORT_PATH]

## Correction context (CORRECTIVE only; omit for INITIAL)

[ROUND, FINDING_IDS OR NONE, CHECK_FAILURE IF ASSIGNED, PRIOR_ATTEMPTS, AND RULINGS, INLINE OR READ_REQUIRED_REFERENCE]
```
