# Subagent-Driven Development

Subagent-driven development coordinates feature-scoped work, records ticket progress, and verifies feature-level completion evidence.

## Work tracking

**Feature**:
A scoped body of work that groups related tickets and their shared requirements.

**Feature design**:
An optional document that records a feature's intent, success criteria, scope, and chosen direction. When present, it is completed and approved before the feature spec.

**Feature spec**:
The approved requirements document for a feature, grounded in its approved design when one exists. Tickets are derived from the feature spec.

**Ticket**:
An independently actionable unit of work with its own acceptance criteria.
_Avoid_: Issue

**Task**:
A bounded unit of work within a ticket, assigned to one subagent in the shared ticket worktree and considered complete when the controller accepts its submitted work.

**Approved task-plan exception**:
A one-use, auditable authorization for the approved T-0004 correction in feature `0001-ticket-task-dispatch`. It does not create tasks or remove the correction's fresh completion gates.

**Task report**:
A worker's report of the result for one assigned Task. The controller uses it to accept the Task or request changes.

**Ticket implementation report**:
The controller's report for the combined ticket changes after every Task is accepted and the controller commits those changes.

**Feature worktree**:
The working tree in which a feature's ticket changes are integrated and its workflow records are maintained.

**Ticket worktree**:
The working tree in which a single ticket's changes are developed and reviewed.

**Ticket status**:
A ticket's tracker lifecycle: open or closed.

**Dependency**:
A relationship in which a ticket waits for another ticket to close, or a task waits for another task to be accepted.

**Blocker**:
A dependency or explicit reason that prevents a ticket or feature from progressing, or a task from being ready.

**Ready ticket**:
An open ticket with no unresolved dependencies or explicit blockers.

## Review and completion

**Delivery**:
The feature-wide phase after all tickets are integrated, covering the feature's checks, its Feature review, and its merge into the originating branch.

**Feature review**:
A review of the completed feature changes before the feature is declared complete. It is the review gate within Delivery.
_Avoid_: aggregate review, delivery review

**Review requirement**:
A required review role for a feature, including the default comprehensive reviewer and any optional specialist reviewers.

**Committed inputs**:
The Git commit containing the code and authoritative requirements assessed by a check or review.

**Finding**:
A review observation that may require work on a ticket before the feature can complete.

**Blocking finding**:
A Finding that prevents acceptance until verified fixed, dismissed as invalid,
or addressed by an approved and reviewed requirements change.

**Verification evidence**:
Recorded check commands and results that establish whether the relevant tests pass for committed code and requirements.

**Feature completion**:
The state reached when all feature tickets are integrated, required checks and reviews pass, and the feature is merged and validated on its originating branch.

**Assignment**:
A recorded implementation or review dispatch with its owner, report destination, and submission state.
