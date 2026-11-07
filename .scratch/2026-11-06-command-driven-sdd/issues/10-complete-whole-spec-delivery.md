# 10: Complete whole-spec delivery

Reporter: User
Category: enhancement

**What to build:** A controller reviews and verifies integrated work as a complete
feature, resolves cross-issue findings through the same progress-based workflow,
and finishes only when aggregate evidence and the stored retrospective policy
are satisfied.

**Blocked by:** 07: Require eligible specialist reviews; 08: Correct with progress-based continuation; 09: Integrate through caller-owned commits.

**Status:** ready-for-agent

- [ ] Delivery operations use explicit `--scope delivery` mutually exclusive with `--issue`, reusing review/submit/checks/findings/correct/resume contracts rather than a separate workflow framework.
- [ ] Aggregate review covers whole-spec and cross-issue behavior through the comprehensive reviewer plus explicitly required eligible specialists; every required assignment must supply current evidence.
- [ ] Delivery findings use their own `F-0001` sequence, canonical provenance, rulings, and history rather than being arbitrarily attached to one issue.
- [ ] Delivery corrections preserve independent attempts/progress assessments and support verified scoped evidence. Unproductive work pauses for adjudication; there is no one-fix cap or weakened acceptance.
- [ ] Delivery resume restores aggregate assignments, corrective work, verification, retrospective gates, and adjudication without resetting issue or delivery history.
- [ ] Define the Git baseline/content identity for whole-spec coverage and final corrective changes so all integrated feature work is reviewed. Caller-owned commit requirements continue to apply; final changes cannot escape review/check coverage.
- [ ] `finish` requires all issues integrated, current passing aggregate required reviews and final checks, and no unresolved delivery blockers.
- [ ] A feature created with required retrospective cannot finish without a valid report. Optional features finish without one or attach one explicitly; stored policy survives resumption/upgrades.
- [ ] Public CLI tests demonstrate complete multi-issue delivery and an independently resumed delivery-scoped correction/adjudication flow, separate ID histories, specialist batches, stale aggregate evidence, and required/optional retrospective outcomes.
- [ ] Persistence, interruption recovery, idempotent submissions/completion, safe report paths, and exact finish/next/status outputs are verified at the public boundary.
- [ ] Full-spec guidance and CLI help match the completed contract; applicable Just-based tests, types, and build checks pass.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
