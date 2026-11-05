# Test workflow

Load and follow the `int-test-driven-development` skill for the RED → GREEN loop and separate refactoring. Apply it without a controller checkpoint or evidence matrix:

1. **Start behavior changes and fixes with RED.** Add or use a relevant test and run it before changing implementation. Confirm it fails for the behavior being changed, not a setup error. Work one behavior slice at a time.
2. **Make it GREEN.** Implement or fix the behavior until that test passes, then continue with the next slice. A pure refactor starts from passing tests and reruns those same tests; it needs no new test or RED phase.
3. **Verify the implementation handoff.** After modifying, refactoring, or fixing code, run the relevant tests on the final version. Correct regressions rather than weakening behavioral assertions. Leave formatting, lint, type checks, and ticket-wide regression checks to the controller's ticket-completion gate defined by that skill before review.
4. **Save a concise report.** Write commands/results, the tested code snapshot, and any failures or checks not run to the assigned `.scratch` report. Briefly state whether changes began with failing tests or reused tests for a pure refactor. Archived RED output, per-slice provenance, and controller release records are not required.

On resume, read the current report and rerun relevant tests if results are stale or missing. Missing old logs alone do not block continuation. Never invent a past test run or remove working code to manufacture RED history; disclose a skipped test-first step honestly. Current passing tests establish GREEN, not historical test order.

**Implementation handoff complete when:** relevant tests pass after the final code edit, the report identifies what was checked, and limitations and pending controller checks are explicit. This is readiness for review, not ticket integration. Failed or unavailable required checks remain unresolved, not success.
