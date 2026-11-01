# Delivery retrospective — Agent and Instruction Blueprints

## 1. Summary

**Required skills loaded:** `int-domain-modeling` and `int-writing-instruction`; also consulted `int-retrospective` and the retrospective environment categories. Domain assessment used implementation-free glossary definitions, context-boundary challenges, and all three ADR eligibility tests.

**Scope:** Read the spec, design, all three tickets including Comments, aggregate reviews, controller reconciliation, applicable instructions, glossary, ADRs, and relevant current implementation/test files. No files changed, agents dispatched, or tests run.

**Evidence limitation:** This reader had no command-execution tool, so could not independently obtain the requested Git diff for `79d44ff..7c4af9c`. Revision comparisons and check results below are attributed to delivery reports, not independently reproduced. The requested direct range-diff inspection remains incomplete.

| Ticket | Delivery and review history |
|---|---|
| 01 — Agent lifecycle | Integrated as `9e3ba0a`. Initial code/slop/task reviews; six corrective dispatches, including one stopped at the context gate. Scoped review reports exist for rounds 2 and 3. Round 4 failed retained tests before re-review; round 5 exhausted the original budget. Maintainer changed the requirement, authorized round 6, then accepted it and cancelled its pending scoped review. |
| 02 — Instruction lifecycle | Integrated as `559c0b4`. Controller directly reviewed the diff; no separate review cycle, by maintainer direction. |
| 03 — Agent migration | Integrated as `7c4af9c`. One code/slop/task review cycle; no corrective dispatch. Maintainer confirmation closed the VS Code loading gap. |

**Recorded interruptions and waits:**

- Ticket 01’s context-gate stop was recorded and redispatched at `13:45:21Z`; duration is not measurable from the log.
- Explicit requirement/budget blocker: `16:29:39Z–21:27:16Z`, **4h 57m 37s**. This measures recorded blocked time, not continuous engineering effort.
- Ticket 03’s explicitly recorded IDE acceptance gap lasted `23:03:33Z–23:13:59Z`, **10m 26s**.
- Final review withheld approval over an expected parallel report artifact. `final-verification.md` resolves that discrepancy; no reliable start/end interval is supplied.

**Delivery verdict:** Controller evidence supports accepted delivery: all three tickets integrated; 246 regression tests passed with the known baseline inventory assertion excluded; types, lint, and changed-file formatting passed. No implementation blocker remains. Round-6 scoped-review cancellation and ticket-02 review substitution were explicit maintainer decisions, not ordinary review passes. Four minor code-slop suggestions remain nonblocking.

Sources: ticket Comments; `reports/final-review.md`; `reports/final-code-slop-review.md`; `reports/final-verification.md`.

## 2. Environment findings

### ENV-01 — Restore an unfiltered regression signal

- **Category:** Automated checks.
- **Severity:** Medium.
- **Evidence:** Ticket 01 Comments repeatedly exclude the baseline assertion, beginning `2026-11-01T12:42:49Z`; ticket 02/03 verification and final reconciliation retain that exclusion. Initial code review independently records 31 tracked local Skill directories against an expectation of only `author-blueprint`.
- **Proposed change:** Have the maintainer establish the intended local-Skill inventory, then correct or retire the stale assertion so routine regression verification needs no name-based exclusion. Do not weaken the separate shipped-content checks.
- **Target:** `tests/stubs.test.ts`, test `only author-blueprint remains a local skill`.
- **Success criterion:** Unfiltered `just test::test` passes while still detecting unintended local/shipped inventory changes.

Existing `package.json` test/lint commands and the `hk.pkl` pre-commit configuration were inspected. This is a stale existing check, not evidence that the project has no guardrail.

### ENV-02 — Allow test fixtures outside the frozen checkout

- **Category:** Tool economy.
- **Severity:** Low.
- **Evidence:** Initial code review recommends an external temporary root. Final code review copied the project to `/tmp` to avoid checkout writes; final code-slop review declined CLI execution because `tests/helpers.ts` creates fixtures beneath checkout `.scratch`.
- **Proposed change:** Let the fixture helper use an explicitly configured external temporary root, retaining unique directories and cleanup. Avoid requiring reviewers to copy the project and reproduce its configuration.
- **Target:** `tests/helpers.ts`, `makeTempDir`.
- **Success criterion:** The existing regression suite can run with an external fixture root without creating checkout-local fixtures or changing implementation paths.

### ENV-03 — Correct the domain-discovery pointer

- **Category:** Workspace instructions.
- **Severity:** Low.
- **Evidence:** At the reconciled integration snapshot `7c4af9c`, `.github/copilot-instructions.md` asserts a multi-context repository and directs readers to `GLOSSARY-MAP.md`; the supplied workspace has a root glossary and no map. `docs/agents/domain.md` already documents the conditional discovery rule. Ticket 01’s accepted T01-I05 finding demonstrates that domain-document guidance affects delivery.
- **Proposed change / target:** See instruction brief **INS-01** below.

## 3. Domain findings

### DOM-01 — Finish removing implementation detail from glossary definitions

**Severity:** Low.

**Evidence:** Ticket 01 Comment `2026-11-01T13:43:46Z` accepts T01-I05. The task review identifies implementation-heavy definitions and the mistaken exclusion of unversioned Agents. Final review marks the Agent/Instruction correction addressed; the current root glossary still defines **Skill** through its directory, entry filename, and version, and **Config** through its storage filename.

The accepted Agent correction need not be reopened. The remaining asymmetry merits a separate glossary proposal.

**Draft replacements for `GLOSSARY.md`, under the existing Spindle context:**

**Skill**:  
A reusable package of guidance for a particular task or workflow.  
_Avoid_: Installed Blueprint

**Config**:  
A project's recorded selection of Stacks and values for Variables.  
_Avoid_: Settings file, manifest

These drafts intentionally omit filenames, paths, metadata requirements, and serialization details. Move any necessary operational facts to the authoring reference rather than duplicating them in definitions.

**Boundary challenges:**

- An unversioned Agent remains an Agent even when Spindle cannot safely update it; the final definition correctly permits this.
- Blueprint **kind**, authored Blueprint, and installed content are related but not interchangeable. An Agent and Skill sharing a name must remain distinguishable, as the delivered kind-aware outcomes require.
- No delivery evidence establishes multiple bounded contexts. A missing map should not be “fixed” by inventing context boundaries.

**ADR candidates: None.**

- The single-file mapping has meaningful migration cost, is surprising because source and installed shapes differ, and trades shared discovery/overlays against separate discovery or handler-owned lifecycle code. **ADR 0002 already records all three**, so another ADR would duplicate it.
- Strategy A has clear context and a real trade-off—ordinary rendering versus partial dependency analysis—but evidence does not establish a meaningful reversal cost beyond the localized policy and tests. Ticket 01’s `21:27:16Z` ruling and the updated spec record it; the three-test threshold for a new ADR is not met.

## 4. Instruction suggestions

### INS-01 — Make domain discovery conditional

- **Stable ID:** INS-01.
- **Severity:** Low.
- **Citations:** ENV-03; integrated snapshot `7c4af9c`, `.github/copilot-instructions.md` “Domain docs”; ticket 01 accepted T01-I05; `final-verification.md` snapshot reconciliation.
- **Operation:** Amend the existing navigation pointer; create no instruction file.
- **Narrow target:** `.github/copilot-instructions.md`, “Domain docs” only.
- **Discovery:** Retain existing repository-wide pointer discovery; no new `applyTo` or broad instruction body.
- **Actionable rule:** Use `GLOSSARY-MAP.md` when present; otherwise consult root `GLOSSARY.md`. Follow `docs/agents/domain.md` for discovery details rather than asserting that this repository is multi-context.
- **Benefit:** Removes a false prerequisite and avoids inventing domain boundaries or treating an absent map as missing setup.
- **Overlap/conflict check:** Aligns with `docs/agents/domain.md` and the loaded domain-modeling skill. Keep the pointer short; do not copy their full rules. No overlap with test instructions, tooling guidance, or triage labels.
- **Why guidance:** This repairs how readers choose domain documentation. A file-existence check can detect a broken unconditional link, but cannot decide the repository’s semantic context boundaries. Those should not be inferred automatically.
- **Proposed validation task:** In a later approved validation session, ask a fresh reader to locate domain documentation with the current root-only layout, then with a representative mapped layout.
- **Success criterion:** The reader uses the appropriate glossary without requesting an absent map, creating files, or declaring unsupported contexts; applicable instruction inclusion is confirmed separately from behavioral adherence.

No full instruction file or authoring/validation workflow is proposed here.

## 5. Open questions for the maintainer

1. **What is the intended local-Skill inventory?** ENV-01 cannot choose a replacement expectation without this decision.
2. **Does “Skill” include authored guidance, installed guidance, or both?** Approve or refine DOM-01 before changing the glossary. Likewise, does “Blueprint” mean an individual content definition rather than its kind?
3. **Is any multi-context model intended but undocumented?** The current root glossary supports single-context discovery; INS-01 deliberately does not settle a future boundary model.
4. **Should tooling-reference repair be a separate follow-up?** Initial task review records a failed `just tool::pnpm` probe caused by an absent `packages/orchestration` directory. The current tooling reference also lists frontend/backend recipes unlike the delivered Node check commands. Decide the authoritative recipe surface before repairing documentation or wrappers; deterministic recipe smoke checks are preferable to adding more behavioral instructions.
5. **Who will complete the independent range-diff inspection?** This report’s direct-reading limitation should remain explicit until a reader with command execution inspects `79d44ff..7c4af9c`.

All items are proposals only; no project files were changed.