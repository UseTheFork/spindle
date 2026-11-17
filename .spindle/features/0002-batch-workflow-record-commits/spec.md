# Batch Workflow Record Commits

## Problem Statement

SDD commits canonical workflow records after individual state changes. A feature with many ticket and task operations therefore produces many record-only commits, obscuring the code history. The requirement for a completely clean feature worktree before dispatch and integration also forces record commits even when only bookkeeping has changed.

Ticket worktrees have their own copies of the feature files, while the feature worktree owns the canonical records. Commands need to find and update those canonical records without relying on a committed, machine-specific absolute path.

## Solution

Keep canonical workflow records version-controlled in the feature worktree, but separate recoverable record writes from Git commits. Allow pending bookkeeping to accumulate across ticket dispatch, integration, and post-merge validation. Automatically checkpoint those records before establishing feature-level delivery evidence, rather than after each update.

Resolve the feature worktree from a ticket worktree using the ticket's feature identity and Git worktree metadata. Preserve the existing review, committed-input, ownership, locking, and recovery safeguards while replacing the blanket clean-worktree requirement with checks specific to code, requirements, and workflow records.

## User Stories

### Recording workflow progress

As a feature controller, I want workflow updates recorded without a commit for every change so that progress remains available without burying code commits.

- While ticket execution is in progress, when an authorized command records a workflow change, the system shall persist the change in the canonical records without creating a record-only commit.
- When a successful workflow update is followed by another command, the system shall make the recorded update available to that command even if it has not been committed.
- When multiple authorized commands update workflow state concurrently, the system shall serialize their updates and retain each successful update.
- When the workflow lock cannot be acquired within bounded retries, the system shall report the failure without silently losing or overwriting records.

### Finding canonical records

As a feature controller, I want commands in a ticket worktree to find the feature worktree's records so that they do not update a stale ticket-worktree copy.

- When an authorized workflow command runs from a ticket worktree, the system shall resolve the matching feature worktree from the ticket's feature identity and Git worktree metadata, and use its canonical records.
- When the feature worktree is missing, unregistered, unusable, or inconsistent with the expected repository, branch, or feature identity, the system shall report an error without updating another copy of the records.
- When Git has a valid updated registration for a moved feature worktree, the system shall resolve its current location without requiring a committed absolute control-file locator.
- When a supported workflow command runs from the feature worktree, the system shall continue to operate on its canonical records.

### Dispatching and integrating with pending records

As a feature controller, I want pending bookkeeping to survive ticket work so that dispatch and integration do not require record-only commits.

- While only permitted workflow bookkeeping is pending, when a ticket is dispatched, the system shall use committed code and requirements for the ticket baseline without committing the pending bookkeeping.
- While only permitted workflow bookkeeping is pending, when a reviewed ticket is integrated, the system shall merge the accepted reviewed changes, preserve the pending bookkeeping, and record the actual merge commit identity.
- When code, requirements, the index, or incoming changes violate the dispatch or integration safety checks, the system shall stop with an actionable error and preserve existing work.
- When a ticket is integrated, the system shall require passing post-merge validation before unblocking its dependent tickets or integrating the next ticket.

### Checkpointing for delivery

As a feature controller, I want accumulated records committed at a meaningful lifecycle boundary so that feature review has stable inputs without repeated record-only commits.

- When all tickets are complete and the feature is ready to establish feature-level delivery evidence, the system shall commit the accumulated canonical workflow records before the checks and feature review that assess that evidence.
- When there are no pending records at that checkpoint, the system shall not create an empty commit.
- When finalization adds further workflow records, the system may commit those records at finalization without committing each individual update.
- The system shall preserve the relationship between recorded checks and reviews and their committed code and requirements.

### Recovering interrupted work

As a feature controller, I want interrupted record writes, merges, and checkpoints to recover safely so that batching does not weaken the workflow's reliability.

- When an interrupted workflow operation can be safely resumed, the system shall recover its pending record and Git operations without losing successful updates or duplicating completed updates or commits.
- When the system cannot establish a safe recovery state, it shall report the conflict and preserve the existing records, Git state, and recovery information.

## Implementation Decisions

- The feature worktree remains the owner of the canonical ledger, ticket records, and reports. Retain individual workflow events and their existing attribution; batching commits must not collapse or discard records.
- Preserve controller ownership of workflow state and the existing worker responsibilities for task work and reports. Resolve the canonical feature worktree for authorized commands without introducing a new committed absolute path to the control file.
- Match the feature worktree using Git's registered worktrees and exact feature branch identity. Validate the repository, worktree, branch, and feature identity before using the records; do not fall back to a ticket worktree's copy.
- Coordinate CLI workflow-state updates with a feature-scoped lock and bounded retries. Complete and recover record writes independently of the later Git checkpoint. Preserve report integrity when reports are written or inspected concurrently.
- During ticket execution, permit only classified workflow bookkeeping to remain pending. Code and authoritative requirements must remain committed and stable for the relevant ticket baseline, checks, and review. A file containing both requirements and bookkeeping must not be treated as entirely disposable bookkeeping.
- Keep the index and reviewed changes separate from pending bookkeeping. Reject incoming changes that would overwrite canonical records, and preserve the reviewed-merge, commit identity, report evidence, prerequisite, and post-merge validation safeguards.
- Checkpoint accumulated records automatically before feature-level checks and feature review, after ticket completion. Checkpoint additional delivery or finalization records when needed; do not add a manual flush command.
- Remove or replace obsolete code, checks, and documentation that require a record commit for each update or a blanket clean worktree. Retain safeguards that still protect committed inputs, reviewed code, ownership, and recovery.

## Testing Decisions

- Use CLI integration tests with real Git worktrees to verify canonical feature-worktree discovery from ticket worktrees, valid updated registrations, and explicit failures for missing or inconsistent worktrees.
- Exercise multiple ticket dispatches and integrations with pending records. Verify that workflow updates produce no record-only commits during ticket execution, reviewed code merges correctly, records and merge identities remain intact, and one non-empty record checkpoint is created before feature-level delivery evidence.
- Exercise changed requirements, unexpected code or index changes, incoming record collisions, and post-merge gates to verify that unsafe operations stop without discarding work or weakening evidence.
- Exercise lock contention and interrupted writes, merges, and checkpoints through the existing transaction and recovery seams. Verify successful updates are retained, recovery is idempotent, and unrecoverable conflicts are reported without destructive cleanup.
- Update or remove tests that assert obsolete per-update commits or blanket cleanliness. Keep or replace coverage for the safety and recovery guarantees those tests previously exercised.

## Out of Scope

- Removing canonical workflow records or individual workflow history.
- Rewriting existing Git history or adding a separate history branch for workflow records.
- Adding a manual record-flush command.
- Changing ticket or task ownership, review requirements, or post-merge completion gates.
- General migration support for unsupported historical ledger schemas.

## Further Notes

The shared-record approach assumes SDD and its workers own the worktrees during a run. It does not rely on an external user making intermediate commits. Existing records and recovery information must not be silently discarded if an operation cannot be resumed safely.
