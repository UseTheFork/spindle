# Active subagent monitoring

The controller monitors workers across implementation, review, and delivery
assignments. Use runtime-supported activity and status access. Do not invent
telemetry or claim access to private reasoning.

1. Check active workers when the runtime allows. Do not busy-wait or interrupt
   productive work to meet a timer.
2. If a worker reports a blocker, drifts from its assignment, or shows no
   visible progress for about five minutes, ask for status or missing context.
3. If the stall persists, report the blocker and preserve the work. Never
   automatically cancel or reassign a worker.

Treat ongoing command progress as activity. Between checks, dispatch ready
tickets within capacity, process completed reports, resolve dependencies, and
prepare reviews. Do not duplicate active work or review unfinished edits as
completed submissions.
