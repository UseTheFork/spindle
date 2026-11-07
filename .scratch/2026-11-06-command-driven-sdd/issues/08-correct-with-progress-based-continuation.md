# 08: Correct with progress-based continuation

Reporter: User
Category: enhancement

**What to build:** A controller dispatches scoped corrective work, obtains current
verification, and continues only with recorded progress, pausing unproductive
work for adjudication rather than using a fixed retry budget.

**Blocked by:** 06: Register findings and enforce explicit rulings.

**Status:** ready-for-agent

- [ ] `correct` requires actionable findings or non-mechanical check failures, records selected objectives and the next attempt before returning a fix assignment/report destination, and rejects unsupported dispatches.
- [ ] Attempts preserve changes, checks, review outcomes, and controller progress assessments; numbering serves history and report destinations rather than an acceptance limit.
- [ ] Corrective implementation submission, checks, and comprehensive scoped review use existing assignment/evidence contracts. Fix verification cannot replace missing initial coverage.
- [ ] Reuse unaffected evidence only when explicit scope/content/requirements coverage supports it; changed or stale affected inputs require fresh coverage. Acceptance remains fully enforced.
- [ ] Further correction requires an explicit recorded continuation/progress decision using consistent named inputs. Repeated failed fixes, recurring blockers, and requirements disagreements pause for controller/user adjudication.
- [ ] Productive work can continue beyond five attempts; neither a budget nor a passing declaration can waive unresolved blockers. The CLI validates explicit assessments rather than inferring semantic progress.
- [ ] Resume preserves pending adjudication, findings, attempts, assignments, and evidence; interruptions/repeated invocations do not allocate duplicate fixes or reset progress.
- [ ] Public CLI tests demonstrate successful correction, supported unaffected coverage, check-driven fixes, rejection of missing initial coverage, continuation beyond former limits, unproductive pauses, and adjudication preserved across restarts.
- [ ] Corrective reviewer/assignment guidance and related CLI help document the delivered policy; applicable Just-based checks pass.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
