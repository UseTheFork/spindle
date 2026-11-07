# 06: Register findings and enforce explicit rulings

Reporter: User
Category: enhancement

**What to build:** A controller registers review findings with canonical identities,
records explicit dispositions, and cannot accept work with unresolved blockers
or unsupported claims that findings were fixed.

**Blocked by:** 05: Review and accept a finding-free implementation.

**Status:** ready-for-agent

- [ ] `finding create` requires explicit source report, reviewed snapshot, severity, blocking choice, summary, details, and author. Allocate `F-0001`-style IDs independently per issue and return canonical IDs.
- [ ] Severity is `high | medium | low`; blocking is independent. Status is `open | confirmed | fixed | dismissed | deferred`; `wontfix` remains issue-triage-only.
- [ ] Review submissions require either complete canonical `--findings` or exclusive `--no-findings`, validate report/snapshot membership, and remain incomplete without the declaration. Passing results cannot bypass registered blockers.
- [ ] Explicitly link duplicate observations to a canonical finding while retaining each source's provenance. Do not parse or deduplicate report prose automatically.
- [ ] Confirmation remains unresolved; `fixed` requires valid verification evidence, `dismissed` requires an invalidity explanation via details, and `deferred` requires rationale and follow-up.
- [ ] Deferral cannot bypass an acceptance criterion. Any scope change requires an explicit approved requirements decision and fresh review; unresolved blocking findings prevent acceptance regardless of severity.
- [ ] Findings/rulings persist canonical structured records and attributed issue audit history. Invalid updates do not partially mutate state; repeated registration/submission preserves idempotency.
- [ ] Next/status expose actionable findings, unresolved blockers, and requirements decisions without weakening gates. Findings returning from review produce the appropriate changes-requested/adjudication state.
- [ ] Public CLI tests cover all dispositions, severity/blocking independence, canonical provenance across source reports, incomplete/contradictory submissions, invalid fix evidence, prohibited deferral, requirement-change review, and restart persistence.
- [ ] Related reviewer contracts and finding guidance are updated and validated through Just recipes.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
