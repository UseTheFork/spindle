# Test workflow

`int-test-driven-development` defines the RED → GREEN loop and separate refactoring. Apply it without a controller checkpoint or evidence matrix:

1. **Start behavior changes and fixes with RED.** Follow `int-test-driven-development`'s slice definition and batched test workflow. Run the slice tests together before changing implementation and verify the intended behavioral failures, not setup errors.
2. **Make it GREEN.** Implement the coherent slice and rerun its tests together, then continue with the next slice. A pure refactor starts from passing tests and reruns those same tests; it needs no new test or RED phase.
3. **Verify the implementation handoff.** After modifying, refactoring, or fixing code, run the relevant tests on the final version. Correct regressions rather than weakening behavioral assertions. Leave formatting, lint, type checks, and ticket-wide regression checks to the controller's [ticket-completion gate](../int-test-driven-development/SKILL.md#ticket-completion-checks) before review.
4. **Save a concise report.** Write commands/results, the tested code snapshot, and any failures or checks not run to the assigned `.scratch` report. Briefly state whether changes began with failing tests or reused tests for a pure refactor. Archived RED output, per-slice provenance, and controller release records are not required.

On resume, read the current report and rerun relevant tests if results are stale or missing. Missing old logs alone do not block continuation. Never invent a past test run or remove working code to manufacture RED history; disclose a skipped test-first step honestly. Current passing tests establish GREEN, not historical test order.

**Implementation handoff complete when:** relevant tests pass after the final code edit, the report identifies what was checked, and limitations and pending controller checks are explicit. This is readiness for review, not ticket integration. Failed or unavailable required checks remain unresolved, not success.
