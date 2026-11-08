# 06: Register findings and enforce explicit rulings

Reporter: User
Category: enhancement

**What to build:** A controller registers review findings with canonical identities,
records explicit dispositions, and cannot accept work with unresolved blockers
or unsupported claims that findings were fixed.

**Blocked by:** 05: Review and accept a finding-free implementation.

**Status:** ready-for-agent
**Execution:** integrated

- [X] `finding create` requires explicit source report, reviewed snapshot, severity, blocking choice, summary, details, and author. Allocate `F-0001`-style IDs independently per issue and return canonical IDs.
- [X] Severity is `high | medium | low`; blocking is independent. Status is `open | confirmed | fixed | dismissed | deferred`; `wontfix` remains issue-triage-only.
- [X] Review submissions require either complete canonical `--findings` or exclusive `--no-findings`, validate report/snapshot membership, and remain incomplete without the declaration. Passing results cannot bypass registered blockers.
- [X] Explicitly link duplicate observations to a canonical finding while retaining each source's provenance. Do not parse or deduplicate report prose automatically.
- [X] Confirmation remains unresolved; `fixed` requires valid verification evidence, `dismissed` requires an invalidity explanation via details, and `deferred` requires rationale and follow-up.
- [X] Deferral cannot bypass an acceptance criterion. Any scope change requires an explicit approved requirements decision and fresh review; unresolved blocking findings prevent acceptance regardless of severity.
- [X] Findings/rulings persist canonical structured records and attributed issue audit history. Invalid updates do not partially mutate state; repeated registration/submission preserves idempotency.
- [X] Next/status expose actionable findings, unresolved blockers, and requirements decisions without weakening gates. Findings returning from review produce the appropriate changes-requested/adjudication state.
- [X] Public CLI tests cover all dispositions, severity/blocking independence, canonical provenance across source reports, incomplete/contradictory submissions, invalid fix evidence, prohibited deferral, requirement-change review, and restart persistence.
- [X] Related reviewer contracts and finding guidance are updated and validated through Just recipes.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
**2026-11-08T00:49:08Z - @Copilot**
Claimed issue 06 from clean baseline `ed1c9ee83f0fa6c057395cd03e6e1a7966b57230`; issue 05 is integrated. Controller author is `Copilot`.

**2026-11-08T00:50:00Z - @Copilot**
Implementation dispatched; durable handoff destination is `../reports/06-implementation.md`. Scope is limited to issue 06; the controller retains review, acceptance, and integration ownership.

**2026-11-08T01:52:45Z - @Copilot**
Controller checks found blocking handoff issues before initial review: `06-CHECK-01` duplicate `findingIds` in `SubmitOptions` makes type-check/build fail; `06-CHECK-02` a redundant length check before `every()` fails lint; `06-CHECK-03` catalog and status tests have stale assertions after the reviewer version/status response additions (2 failures in the 96-test focused run). First corrective attempt is authorized to remove the duplicate declaration and redundant predicate, and update the two assertions to describe the actual supported response/catalog state without weakening behavior checks. Prior attempts: none. Prior review/rulings: no initial review yet. Progress decision: continue; exact diagnostics and expectations are identified and directly testable. Corrective implementation dispatched for these controller check failures; append evidence to `../reports/06-implementation.md`. Because initial review coverage is not yet available, the corrected snapshot will return to comprehensive initial review rather than scoped re-review.

**2026-11-08T02:07:47Z - @Copilot**
Frozen for comprehensive initial Spec/Quality review at base/HEAD `ed1c9ee83f0fa6c057395cd03e6e1a7966b57230`. Changed file SHA-256: `docs/agents/issue-tracker.md` `3702eeb0b7cb87452a423e9a78b929f9e516fa98d6ec0347fd61a5275218defd`; `docs/agents/tooling.md` `7a21de41426aa19b4051fabdd0804360b0c43308929f29e56b0f7240bd5e6f76`; `src/blueprints/agents/sdd-reviewer.agent.md` `0c0e175f8a84dda5841a6d72efc18228d7a847a45118f5dacc6b82caed3fd0ff`; `src/commands/sdd/sdd-command.ts` `f85bcc2ac62c7235aa189e80c3a9e83719647e4158d70adb75541e413a54fe04`; `tests/catalog.test.ts` `bd938038d515d777f1bd53496c162955b1d2a06fcda08a2aba3119192668b474`; `tests/sdd-create-status.test.ts` `3ab08af45e8a9748b2ce585931242f15b6cbd01a86dcabf40c934ab40cee6744`; `tests/sdd-workflow.test.ts` `8fb654c34aaebe843415675ef0c535c1e5b190011e3cd13e8d27286acbd85e51`; `tests/packaged-cli.test.ts` `741ed1e5f10bc2f726f4b729976f961eb68828926c94f68b5d0a99dfbaae8d14`. Controller-owned issue state and implementation report are in `.scratch` and excluded from code identity. Formatting passed. Focused SDD/catalog/install tests: 96/96; packaged CLI tests: 5/5; targeted lint, type-check, build, and diff checks passed. Full project suite not run. Implementer flagged raw `process.argv` conflict detection for `--findings` and `--no-findings` for review scrutiny. Initial review destination `../reports/06-review.md`.

**2026-11-08T02:17:04Z - @Copilot**
Initial review `../reports/06-review.md` returned Spec/Quality FAIL with blocking Important findings `06-Q01` (raw `process.argv` token matching allows contradictory `--findings=... --no-findings` submission) and `06-Q02` (linking a new observation to a previously fixed finding leaves the stale resolved ruling, allowing acceptance despite a recurring defect). First corrective attempt is authorized to validate mutually exclusive declarations from parsed option state and to ensure newly linked observations of resolved findings require renewed adjudication and block acceptance until resolved. Add public CLI tests for the equals-form conflict plus flag-like values, and for link-after-fix → submit → blocked accept. Prior attempts: none. Prior rulings: none. Progress decision: continue; both are demonstrated correctness defects with direct tests. Corrective implementation dispatched for `06-Q01` and `06-Q02`; append attempt evidence to `../reports/06-implementation.md`. Scoped review destination: `../reports/06-round-1-review.md`.

**2026-11-08T02:43:58Z - @Copilot**
Round 1 corrected snapshot returned to comprehensive initial review because initial coverage was not yet present. Base/HEAD remains `ed1c9ee83f0fa6c057395cd03e6e1a7966b57230`. Updated hashes: `src/commands/sdd/sdd-command.ts` `44a8621a884fd412ac9c4d2370082634e8031bcf1d68c8471fc0135f35365112`; `tests/sdd-workflow.test.ts` `dc16f6ecc44fa1c7e30b2949ea34e0c329dbdcd97108e8ec128b2b43bb18fd5f`. All other file hashes remain as in the initial freeze. Controller reran formatting, 99 focused SDD/catalog/install tests, packaged CLI (5), targeted lint, type-check, build, and diff check; all passed. Full suite not run. The review must evaluate the complete issue 06 implementation with fixes for `06-Q01` and `06-Q02`, not just a scoped delta. Initial review destination remains `../reports/06-review.md`; preserve the prior review as history and create a distinct report for expanded review at `../reports/06-expanded-review.md`.

**2026-11-08T02:48:44Z - @Copilot**
Expanded initial review `../reports/06-expanded-review.md` marks prior findings `06-Q01` and `06-Q02` addressed but returns Spec/Quality FAIL for blocking Important `06-Q03`: `finding update --status fixed` accepts passing evidence on the same content/requirements snapshot where the finding was observed, so unchanged content can be marked fixed without a correction. Second corrective attempt authorized to reject fixed rulings on any unchanged observation snapshot and require current passing check evidence after a content/requirements change; invalid observations may instead be dismissed with explanation. Add public tests for same-snapshot rejection and corrected-snapshot verification acceptance. Prior attempts: attempt 1 resolved `06-Q01`, `06-Q02` with passing tests/checks; prior findings addressed. Progress decision: continue; explicit blocker verified and its correction has a direct public CLI test.

**2026-11-08T03:09:55Z - @Copilot**
Round 2 fix frozen for expanded re-review at base/HEAD `ed1c9ee83f0fa6c057395cd03e6e1a7966b57230`. Updated files: `src/commands/sdd/sdd-command.ts` SHA-256 `12f9995a68c828987fad0941fb68b454230a2126b20136782c4a92922a6852cd`; `tests/sdd-workflow.test.ts` `e774b06244c083db82f0cffb91096dbc552658b1d66e75191aae425652e53a62`. Other issue-06 hashes remain as in initial freeze. Controller reran formatting, 99 focused SDD/catalog/install regressions, packaged CLI (5), targeted lint, type-check, build, and diff check; all passed. Full suite not run. Review all issue-06 criteria and confirm dispositions for `06-Q01`, `06-Q02`, and `06-Q03`. New report path `../reports/06-round-2-review.md`.

**2026-11-08T03:14:50Z - @Copilot**
Round 2 review passed Spec/Quality and addressed blocking `06-Q01`–`06-Q03`; it recorded nonblocking `06-Q04`, which identified that fixed-ruling guidance omitted the requirement for a post-observation snapshot. Controller corrected the wording in `docs/agents/issue-tracker.md` and `docs/agents/tooling.md`. Formatting and `git diff --check` passed. Targeted oxlint reported no supported files for the Markdown paths; no Markdown-specific lint recipe or documentation test is configured. The dated feature workspace is not accepted by the current numbered-workspace status CLI, so this controller-owned tracker remains the execution record. Scoped corrective review destination: `../reports/06-round-3-review.md`.

**2026-11-08T03:19:51Z - @Copilot**
Scoped review round 3 passed Spec/Quality but found `06-Q04` still unaddressed in the tooling summary: “newer than” implied temporal ordering rather than explicit snapshot identity inequality. Progress is verified because the detailed issue-tracker guidance now states the exact condition; controller corrected the remaining summary to require passing checks on the current snapshot and explicitly differ from every observation snapshot. This narrow correction is authorized; no runtime or test sources changed. Scoped re-review destination: `../reports/06-round-4-review.md`.

**2026-11-08T03:21:23Z - @Copilot**
Scoped round-4 review passed Spec/Quality and marked `06-Q04` addressed; no correction-induced findings. Combined with round-2 comprehensive Spec/Quality PASS and Q01-Q03 dispositions addressed, no unresolved blockers remain. Required checks are current for the implementation and documentation correction. Full project suite and reviewer-agent behavior remain unverified. Controller accepts issue 06; its triage status remains `ready-for-agent` because execution is tracked independently.
