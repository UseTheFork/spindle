# Example feature workflow

This example shows a small feature with two dependent tickets. The ticket
Markdown holds requirements and acceptance criteria; `sdd.json` holds tracker
status and dependencies.

1. Create a feature workspace and split independent work into tickets:
   `spindle sdd create`, then `spindle sdd ticket create` for each ticket.
2. Record the dependency with
   `spindle sdd ticket update --ticket T-0002 --blocked-by T-0001`. Check `spindle sdd ready`:
   the prerequisite is ready and the dependent ticket is not.
3. Claim and implement `T-0001`, submit its report, run and record relevant
   checks, then close it with `spindle sdd ticket update --status closed`.
4. `T-0002` becomes ready because its dependency is closed. Implement and
   verify it in the same way, then close it.
5. Record current feature-level required checks and request the comprehensive
   review with `spindle sdd review --scope delivery`. Add only justified specialists.
6. Submit every assigned report. Register findings from their report and
   snapshot. A blocking finding can reopen its related ticket; complete the
   correction, close the ticket again, and refresh stale checks and review.
7. Finish when every ticket is closed, all required checks and reviews pass on
   the current feature snapshot, and no delivery blockers remain.

Use the normal Git workflow for code. There is no per-ticket accept or
integration step; the SDD CLI does not stage or commit changes.
