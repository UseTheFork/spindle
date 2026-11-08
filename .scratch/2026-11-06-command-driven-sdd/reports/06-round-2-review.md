# Issue 06 — Expanded Corrective Review, Round 2

## Scope and snapshot

- **Phase/scope:** Expanded corrective review, round 2, attempt 2. Re-reviewed all issue 06 criteria and regressions, with specific attention to `06-Q03`; preserved the supplied finding IDs and dispositions. This report does not make an acceptance or integration ruling.
- **Snapshot:** Comparison base and HEAD are both `ed1c9ee83f0fa6c057395cd03e6e1a7966b57230`. I verified HEAD and the frozen implementation hashes:
  - `docs/agents/issue-tracker.md` — `3702eeb0b7cb87452a423e9a78b929f9e516fa98d6ec0347fd61a5275218defd`
  - `docs/agents/tooling.md` — `7a21de41426aa19b4051fabdd0804360b0c43308929f29e56b0f7240bd5e6f76`
  - `src/blueprints/agents/sdd-reviewer.agent.md` — `0c0e175f8a84dda5841a6d72efc18228d7a847a45118f5dacc6b82caed3fd0ff`
  - `src/commands/sdd/sdd-command.ts` — `12f9995a68c828987fad0941fb68b454230a2126b20136782c4a92922a6852cd`
  - `tests/catalog.test.ts` — `bd938038d515d777f1bd53496c162955b1d2a06fcda08a2aba3119192668b474`
  - `tests/sdd-create-status.test.ts` — `3ab08af45e8a9748b2ce585931242f15b6cbd01a86dcabf40c934ab40cee6744`
  - `tests/sdd-workflow.test.ts` — `e774b06244c083db82f0cffb91096dbc552658b1d66e75191aae425652e53a62`
  - `tests/packaged-cli.test.ts` — `741ed1e5f10bc2f726f4b729976f961eb68828926c94f68b5d0a99dfbaae8d14`
- **Change/history examined:** Complete issue 06 implementation inventory and matching code/tests/docs, including round-2 changes in the command and workflow test. The prior initial and expanded reviews and both corrective-attempt records were read as history; `.scratch` issue/report records are not implementation identity.
- **Requirements/context:** Issue 06 and comments; feature `spec.md` and `design.md`; applicable repository instructions; `docs/agents/tooling.md`, `issue-tracker.md`, `domain.md`, `GLOSSARY.md`, ADRs 0003/0004; review-input, TDD/test, verification-before-completion, and writing-for-agents standards.

## Evidence and limitations

- **Controller-supplied for this exact frozen snapshot; not run by me:** formatting passed; `just lint::check` passed for issue 06 source/docs/tests; `just test::types` passed; `just build` passed; focused tests (`tests/sdd-workflow.test.ts`, `tests/sdd-issues.test.ts`, `tests/sdd-create-status.test.ts`, `tests/catalog.test.ts`, `tests/install.test.ts`) passed 99/99; post-build `tests/packaged-cli.test.ts` passed 5/5; `just tool::git diff --check` passed.
- **Corrective TDD evidence supplied by the implementer, not run by me:** intended RED for the two `06-Q03` cases failed at the same-snapshot acceptance as expected; GREEN passed 2/2; final workflow tests passed 51/51. The controller's final 99-test workflow-inclusive run is the fresh verification I rely on for this snapshot.
- **Personally inspected:** all frozen hashes, assignment/status history, corrected finding-update guard, Q01/Q02 paths, corresponding public CLI tests, accept/blocker logic, and relevant finding guidance. I ran no project checks.
- **Limitations:** The full project test suite was not run. The updated reviewer Blueprint's behavior was not tested with an agent scenario; shipped content and packaging checks do not establish how an agent applies the guidance. The prior expanded review also records that one cross-report test manually seeds review assignments; that remains a test-seam limitation, not evidence that the linking contract is broken.

## Spec

**PASS** — no blocking issue 06 defect remains in the reviewed snapshot. Criterion assessment:

- **Finding creation, canonical IDs, source attribution:** Required finding fields and issue-local `F-` IDs are enforced; registration validates assignment report/snapshot membership and returns the canonical finding. Met in inspected CLI paths and public tests.
- **Enums and severity/blocking independence:** Finding statuses and severities use the specified closed values, blocking remains independent, and `wontfix` remains a triage status. Met.
- **Review declarations and blockers:** Submissions require a complete findings declaration or exclusive `--no-findings`, validate provenance, and do not let a passing review bypass a registered blocker. The parsed Commander option events and public regression tests address the prior `06-Q01` defect.
- **Explicit duplicate linking and provenance:** A distinct linked observation retains source provenance. A new observation reopens fixed/dismissed findings, clears stale ruling evidence, and routes blocking recurrences back through adjudication. This addresses `06-Q02`.
- **Rulings and verified fixes:** Confirmation remains unresolved; invalid findings can be dismissed with an explanation; deferral requires rationale/follow-up and an approved requirements decision plus fresh review when blocking. `fixed` now rejects the current snapshot if it matches any finding-observation snapshot, and still requires current passing required checks. Public CLI coverage rejects same-snapshot fixing without ledger mutation and permits fixing after content changes and a passing check on the corrected snapshot. This addresses `06-Q03`.
- **Requirements changes and acceptance:** Approved scope changes invalidate stale coverage and require fresh checks/review; unresolved blocking findings remain an acceptance blocker. Met in inspected paths and existing public CLI coverage.
- **Persistence, audit, idempotency, invalid updates:** Findings/rulings and provenance are structured and persisted with attributed history; invalid ruling paths validate before writing; repeated registration/submission is idempotent. Met in inspected paths and tests.
- **Status/next and workflow routing:** Findings, decisions, actionable blockers, and changes-requested routing are exposed through status/next and exercised in workflow tests. Met.
- **CLI tests and shipped guidance:** Public CLI coverage spans finding dispositions, provenance, declarations, invalid evidence, deferral, requirements decisions, persistence, and blocker behavior. Tracker/tooling docs and the reviewer Blueprint are updated and covered by the supplied lint/build/packaged checks. Reviewer behavior application remains unverified as noted above. The fixed-evidence documentation omission is recorded separately as nonblocking `06-Q04`.

## Quality

**PASS.** The current guard checks the current content/requirements identity against every stored observation, then requires current passing required-check evidence. Its public CLI tests assert both rejection without ledger mutation and successful verification on a changed snapshot. The parsed declaration handling and reopening behavior for `06-Q01` and `06-Q02` remain present and are covered by the fresh supplied focused test run. The inspected blocker and acceptance paths preserve the safety gates. I found no material unnecessary complexity. Evidence gaps are listed above and do not establish a remaining blocking defect.

## Findings

### 06-Q01 — `--findings` and `--no-findings` conflict check is bypassable

- **Severity:** Important; **blocking:** Yes.
- **Location:** `src/commands/sdd/sdd-command.ts:934-937`; public tests in `tests/sdd-workflow.test.ts`.
- **Defect/impact:** Previously, raw `process.argv` matching could miss `--findings=...` and confuse flag-like values with declarations, allowing contradictory review submissions.
- **Required correction:** Use parsed option state and cover equals-form conflicts and flag-like values.
- **Disposition:** **ADDRESSED.** The command tracks parsed `option:findings` and `option:no-findings` events. Public tests cover the conflict and flag-like detail value; fresh controller-supplied focused tests cover the current code.

### 06-Q02 — Linking a new observation does not reopen a fixed blocker

- **Severity:** Important; **blocking:** Yes.
- **Location:** `src/commands/sdd/sdd-command.ts` finding-link path around lines 2137-2160; public regression `tests/sdd-workflow.test.ts:1132` onward.
- **Defect/impact:** Previously, a newly linked recurrence could retain a resolved disposition, leaving a current blocking observation outside the acceptance gate.
- **Required correction:** Reopen a resolved canonical finding on a new observation, clear stale ruling evidence, preserve provenance, and block acceptance until renewed adjudication.
- **Disposition:** **ADDRESSED.** The current path reopens fixed/dismissed findings, retains prior provenance and blocking policy, and removes stale verification/ruling data. The public flow checks re-submission, blocked acceptance, same-snapshot rejection, and preservation of nonblocking status; fresh focused tests cover it.

### 06-Q03 — A blocker can be marked fixed on the exact snapshot that reported it

- **Severity:** Important; **blocking:** Yes.
- **Location:** `src/commands/sdd/sdd-command.ts:2348-2375`, especially `:2355`; public regression `tests/sdd-workflow.test.ts:959-978` and `:1319-1324`.
- **Defect/impact:** Previously, current passing checks for unchanged observed content could clear a blocker without correcting it.
- **Required correction:** Reject fixing on any unchanged observation code/requirements snapshot; require current passing evidence after a relevant content/requirements change, or dismiss an invalid observation with explanation.
- **Disposition:** **ADDRESSED.** The guard rejects when any provenance snapshot equals the current identity; the existing checks require evidence to match that identity and all required checks to pass. Public tests assert same-snapshot rejection without mutation, then changed-content plus passing-check success. Fresh controller-supplied workflow-inclusive tests cover this snapshot.

### 06-Q04 — Finding guidance omits the changed-snapshot condition for `fixed`

- **Severity:** Minor; **blocking:** No.
- **Location:** `docs/agents/issue-tracker.md:134-135`; summary also appears in `docs/agents/tooling.md:51`.
- **Defect/impact:** The guidance says `fixed` requires a current snapshot with passing required checks, but omits the additional condition enforced by the CLI: the current snapshot must differ from every observation snapshot. A controller following the documented command guidance can supply otherwise-current passing evidence and encounter an undocumented rejection.
- **Required correction:** State that fixed evidence must cover a post-observation content/requirements snapshot (and preserve the existing passing-check requirement); direct invalid observations to dismissal with an explanation.

## Observations and remaining context

- `06-Q04` is a documentation-clarity recommendation and is nonblocking; no runtime safety gap remains for `06-Q03`.
- The full project suite and an agent-behavior scenario for the reviewer Blueprint remain unverified. No controller decision about acceptance, integration, or execution state is made here.
