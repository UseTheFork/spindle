# 03: Claim, dispatch, and resume implementation

Reporter: User
Category: enhancement

**What to build:** A controller can claim a ready issue from a clean checkout,
obtain a durable implementation handoff, submit its report, and recover the
same work safely in a later session.

**Blocked by:** 02: Create, triage, and organize issues.

**Status:** ready-for-agent

- [ ] `claim` enforces readiness and dependency gates, rejects competing ownership, and rejects staged, unstaged, or untracked changes including preparation documents without altering them.
- [ ] Only a successful clean claim records the starting commit SHA and explicit controller author. Failed claims leave ownership and baseline unchanged.
- [ ] `implement` moves through permitted claimed/implementing gates, persists dispatch intent before returning inputs, and assigns a durable report destination with role `implementation`; it does not launch an agent.
- [ ] Implementation `submit` validates the expected assignment/action and report target, registers the report and available provenance, and makes missing/unavailable reports explicit rather than treating them as completed work.
- [ ] `next` and expanded `status` return permitted actions, pending assignments, and blockers without writing state or inventing unsupported successful transitions.
- [ ] `resume` returns the same recorded assignment and gate without resetting evidence/history or allocating another dispatch. A changed author records a handoff requiring controller confirmation that the previous worker stopped.
- [ ] Short-lived locks protect claims and dispatch/submission changes. Interrupted dispatch resumes its original intent; repeated submissions do not duplicate history.
- [ ] Assignment/report paths retain relevant checkout containment, symlink, ignored-path, and regular-file protections. Existing reports and user changes are preserved.
- [ ] Public CLI tests exercise separate-invocation claim/dispatch/submit/resume flows, dirty-start cases, concurrent claims, invalid transitions, missing reports, handoffs, read-only queries, interruption, and idempotency.
- [ ] Help and related assignment/recovery guidance reflect the delivered contract; Just-based validation confirms no automatic execution or Git mutations.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
