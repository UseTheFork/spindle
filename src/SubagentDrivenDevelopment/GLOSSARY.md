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

**Feature worktree**:
The working tree in which a feature's ticket changes are integrated and its workflow records are maintained.

**Ticket worktree**:
The working tree in which a single ticket's changes are developed and reviewed.

**Ticket status**:
A ticket's tracker lifecycle: open, in progress, or closed.

**Dependency**:
A relationship in which one ticket must be closed before another can become ready.

**Blocker**:
A dependency or explicit reason that prevents a ticket or feature from progressing.

**Ready ticket**:
An open ticket with no unresolved dependencies or explicit blockers.

## Review and completion

**Feature review**:
A review of the completed feature changes before the feature is declared complete.

**Review requirement**:
A required review role for a feature, including the default comprehensive reviewer and any optional specialist reviewers.

**Evidence snapshot**:
The identity of the feature changes and requirements assessed by a check or review.

**Finding**:
A review observation that may require work on a ticket before the feature can complete.

**Verification evidence**:
Recorded check commands and results that establish whether the relevant tests pass for a feature snapshot.

**Feature completion**:
The state reached when all feature tickets are integrated, required checks and reviews pass, and the feature is merged and validated on its originating branch.

**Assignment**:
A recorded implementation or review dispatch with its owner, report destination, and submission state.
