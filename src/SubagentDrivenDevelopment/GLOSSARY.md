# Subagent-Driven Development

The language for organizing feature work into tickets and tasks, coordinating
agents, reviewing results, and delivering completed work.

## Work Model

**Feature**:
A complete unit of work defined by a feature specification and delivered as
one whole. It contains one or more tickets.

**Ticket**:
A coherent deliverable within a feature, defined by its requirements and
acceptance criteria. It groups the tasks that produce that deliverable.
_Avoid_: Issue

**Ticket comment**:
A note attached to a ticket that adds context without changing its requirements
or acceptance criteria.

**Task**:
A unit of implementation within a ticket, defined by its instructions, planned
write scope, and dependencies.
_Avoid_: Subtask

**Work graph**:
A feature's hierarchy of tickets and their tasks, connected by dependencies.

**Submission comment**:
An optional note attached to a task when its worker submits it as Done.
_Avoid_: Task comment

**Write scope**:
The planned repository paths a task is expected to change. A write scope helps
identify planned overlap between tasks but does not limit all files a worker
may change.

**Integration**:
The incorporation of an accepted ticket into its feature.

**Merge operation**:
A branch integration assigned to a merge agent, separate from ticket
implementation work.

## Roles and Handoffs

**Controller**:
The operator responsible for coordinating a feature and its SDD workflow.

**Worker**:
An agent assigned to implement a task or carry out a merge operation.

**Reviewer**:
An agent that assesses a ticket or feature against its acceptance criteria or
specification.

**Assignment**:
A scoped handoff of task, review, or merge work to an agent, including the
target and the instructions or criteria relevant to that work.

**Merge agent**:
A worker assigned to merge branches as part of ticket integration or feature
delivery.

## Reviews and Delivery

**Review round**:
One or more reviews of the same target at the same code revision.

**Acceptance review**:
A review of a ticket's completed work against its acceptance criteria.

**Feature review**:
A review of a completed feature against its specification.

**Finding**:
An issue recorded from a review, with supporting evidence for the decision
about it.

**Evidence**:
Verifiable information that supports a review recommendation or finding.

**Delivery**:
The final incorporation of a completed feature into the branch from which it
started.
_Avoid_: Release

**Delivery ticket**:
A ticket that brings the original branch's latest commits into a feature before
delivery.

**Delivery merge agent**:
A merge agent assigned to bring the original branch's latest changes into a
delivery ticket before feature completion.
