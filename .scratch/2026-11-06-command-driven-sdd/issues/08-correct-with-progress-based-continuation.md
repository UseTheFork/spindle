# 08: Correct with progress-based continuation

Reporter: User
Category: enhancement

**What to build:** A controller dispatches scoped corrective work, obtains current
verification, and continues only with recorded progress, pausing unproductive
work for adjudication rather than using a fixed retry budget.

**Blocked by:** 06: Register findings and enforce explicit rulings.

**Status:** ready-for-agent
**Execution:** accepted

- [X] `correct` requires actionable findings or non-mechanical check failures, records selected objectives and the next attempt before returning a fix assignment/report destination, and rejects unsupported dispatches.
- [X] Attempts preserve changes, checks, review outcomes, and controller progress assessments; numbering serves history and report destinations rather than an acceptance limit.
- [X] Corrective implementation submission, checks, and comprehensive scoped review use existing assignment/evidence contracts. Fix verification cannot replace missing initial coverage.
- [X] Reuse unaffected evidence only when explicit scope/content/requirements coverage supports it; changed or stale affected inputs require fresh coverage. Acceptance remains fully enforced.
- [X] Further correction requires an explicit recorded continuation/progress decision using consistent named inputs. Repeated failed fixes, recurring blockers, and requirements disagreements pause for controller/user adjudication.
- [X] Productive work can continue beyond five attempts; neither a budget nor a passing declaration can waive unresolved blockers. The CLI validates explicit assessments rather than inferring semantic progress.
- [X] Resume preserves pending adjudication, findings, attempts, assignments, and evidence; interruptions/repeated invocations do not allocate duplicate fixes or reset progress.
- [X] Public CLI tests demonstrate successful correction, supported unaffected coverage, check-driven fixes, rejection of missing initial coverage, continuation beyond former limits, unproductive pauses, and adjudication preserved across restarts.
- [X] Corrective reviewer/assignment guidance and related CLI help document the delivered policy; applicable Just-based checks pass.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-11-08T04:23:22Z - @Copilot**
Claimed issue 08 from clean baseline `264cecaeca20097d7a1964ef957df424eb33592b`; issue 06 is integrated, satisfying the declared dependency. Controller author is `Copilot`. Implementation is scoped to issue 08; no worker commit is authorized, and the controller retains review, acceptance, and integration ownership. Durable implementation handoff: `../reports/08-implementation.md`.

**2026-11-08T08:24:39Z - @Copilot**
Controller scope ruling: Issue 08 establishes the correction lifecycle contracts and public behavior for issue scope. Issue 10 explicitly adds delivery-scope operations and must reuse the correction contracts from issue 08, maintaining independent delivery attempts and rulings. The feature-level delivery requirement is assigned to issue 10's implementation, not a reason to block issue 08 before the underlying delivery command family exists. The implementer's issue-scoped correction work and 109-test regression evidence demonstrate progress. Continue issue 08 by removing guidance that misstates delivery support as a current blocker, documenting the boundary/issue-10 follow-up accurately, and returning a complete issue-scoped implementation handoff. Do not implement `--scope delivery` here.

**2026-11-08T08:44:43Z - @Copilot**
Frozen for comprehensive issue-08 Spec/Quality review at base/HEAD `264cecaeca20097d7a1964ef957df424eb33592b`. Exact implementation file SHA-256 values: `docs/agents/issue-tracker.md` `a5ce8c2e3cdb323e18f8aa49686889ad910bf56c037fe0de4d99bba7190621b0`; `docs/agents/tooling.md` `5fc348c8cd2bea9f7873a667f951b553134b68bc6ea5f3e1852826ca751665b3`; `src/blueprints/agents/sdd-reviewer.agent.md` `07a75056430b5870bb5836cc1d29a66064af98c87a07e0df24c45907566935de`; `src/blueprints/skills/int-subagent-driven-dev/references/corrective-rounds.md` `6943dcd91aadd9dd22b185fef2e24886d58671e0a37b554afe877b1bb325bb6a`; `src/blueprints/skills/int-subagent-driven-dev/references/implementer-corrections.md` `faf7c13329f87028fe868f77d13bcbddd7d9e5588f47672676cc7b510f381173`; `src/commands/sdd/sdd-command.ts` `3c8defb06252bde227f3cc08c0dbabea03f937bc8cfb65a2ba98c02cfc569c07`; `tests/sdd-workflow.test.ts` `faaa21a18c3f9a98ea53f0089e2e37c5f4e892bc449788d3ab9d56fc0fe7092f`. The controller-owned issue tracker and implementation report are excluded from product identity. Controller checks on this snapshot: format check, targeted lint, type-check, build, diff check passed; focused SDD/catalog/install regressions passed 109/109; packaged CLI tests passed 5/5. Full project suite not run. Review destination: `../reports/08-review.md`.

**2026-11-08T08:50:40Z - @Copilot**
Initial review `../reports/08-review.md` returned Spec/Quality FAIL with blocking Important `I08-R1`: `resume()` selects retained initial review assignments instead of the active corrective attempt's pending review assignments, producing stale blockers and the wrong next action. One corrective attempt is authorized to make resume derive its blocker, returned review assignments, and next action from the active attempt's corrective review set when the current assignment is corrective. Add a public CLI regression with submitted initial reviews, changed corrective content, and a pending corrective review; assert resume returns the active corrective assignment and the `await-review-report` action. Prior attempts: none. Prior progress: issue-scoped correction lifecycle and 109-test regression/controller checks pass; issue 10 delivery scope is explicitly follow-up per the recorded scope ruling. Proceed; the defect is demonstrated and has a direct public CLI test.

**2026-11-08T09:22:24Z - @Copilot**
Attempt 1 `I08-R1` correction completed and frozen for scoped review. Fix-only hashes: `src/commands/sdd/sdd-command.ts` `fcbaff8e0c27673c6ad9441f049ccf0236242ef9e01482209ff865ec1b8a746c`; `tests/sdd-workflow.test.ts` `e62c6b7b6531b82099bbc3eaf1521a9e6b49f66c4738d8d37e941eb5b3f928a4`. All other implementation file hashes remain as in the initial freeze. Controller reran format, targeted lint, types, build, diff check, focused regressions 110/110, and packaged CLI tests 5/5; all passed. The new public regression had intended RED (`resolve-review-blocker` vs expected `await-review-report`) and GREEN (1/1). Full project suite not run. Review destination: `../reports/08-round-1-review.md`.

**2026-11-08T09:25:39Z - @Copilot**
Scoped corrective review `../reports/08-round-1-review.md` returned Spec PASS and Quality PASS, marked `I08-R1` addressed, and found no correction-induced findings. Combined with the initial comprehensive Spec/Quality review, the issue-08/issue-10 scope ruling, and controller verification, no unresolved issue-08 blocker remains. The full project test suite remains unrun. Controller accepts issue 08; triage remains `ready-for-agent`.
