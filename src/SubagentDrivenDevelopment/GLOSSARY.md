# Subagent-Driven Development

Subagent-driven development coordinates feature-scoped work, records issue progress, and verifies feature-level completion evidence.

## Work tracking

**Feature**:
A scoped body of work that groups related issues and their shared requirements.

**Issue**:
An independently actionable unit of work with its own acceptance criteria.

**Issue status**:
The tracker lifecycle of an issue: open, in progress, or closed.

**Dependency**:
A relationship in which one issue must be closed before another can become ready.

**Blocker**:
A dependency or explicit reason that prevents an issue or feature from progressing.

**Ready issue**:
An open issue with no unresolved dependencies or explicit blockers.

## Review and completion

**Feature review**:
A review of the completed feature changes before the feature is declared complete.

**Review requirement**:
A required review role for a feature, including the default comprehensive reviewer and any optional specialist reviewers.

**Evidence snapshot**:
The identity of the feature changes and requirements assessed by a check or review.

**Finding**:
A review observation that may require work on an issue before the feature can complete.

**Verification evidence**:
Recorded check commands and results that establish whether the relevant tests pass for a feature snapshot.

**Feature completion**:
The state reached when all feature issues are closed and required checks and reviews pass on the current feature snapshot.

**Assignment**:
A recorded implementation or review dispatch with its owner, report destination, and submission state.
