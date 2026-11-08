# Issue 06 — Initial Spec and Quality Review

## Scope and snapshot

- **Phase/scope:** Initial review of issue 06 only.
- **Snapshot:** Comparison base and HEAD `ed1c9ee83f0fa6c057395cd03e6e1a7966b57230`. The frozen implementation consists of the eight files and hashes recorded in issue 06's `## Comments`; I independently verified those eight SHA-256 hashes and confirmed HEAD. `git status` shows only those implementation files plus the controller-owned issue record and implementation report; the latter `.scratch` records are outside implementation identity.
- **Change examined:** Complete assigned diff retrieved read-only with the supplied `just tool::git diff -- ...` command. I inspected changed CLI and ledger code with surrounding paths, the public workflow/catalog/packaged tests, tracker/tooling guidance, and the `sdd-reviewer` Blueprint.
- **Requirements:** Issue 06 and its complete Comments section; feature `spec.md` and `design.md`; applicable commenting, testing, and Blueprint-reference instructions; project tooling, issue-tracker and domain guidance; `GLOSSARY.md`; ADRs 0003 and 0004; review-input and TDD/verification standards. Issue 05 is integrated at the supplied baseline. No prior issue-06 review findings or rulings were supplied.
- **Implementation report:** `.scratch/2026-11-06-command-driven-sdd/reports/06-implementation.md`.

## Evidence and limitations

- **Controller-supplied, covering the frozen snapshot:** formatting passed; targeted lint passed; type checking passed; build passed; focused SDD/catalog/install tests passed (96); packaged CLI tests passed (5); and `git diff --check` passed. The full project test suite was not run. I did not run those checks.
- **Personally verified:** HEAD and all eight implementation file hashes match the frozen identity. I inspected the complete supplied diff and matching source/tests, including Commander parsing behavior relevant to the option conflict check. I ran no project tests, build, lint, or formatter.
- **Guidance-validation limitation:** The implementation report discloses that no agent-behavior baseline/retest was performed for the changed reviewer Blueprint. Packaged/catalog checks establish shipped content/version, not that an agent applies the revised instructions in a real review scenario.

## Spec

**FAIL.** Most issue-06 requirements are implemented, but two blocking defects violate explicit submission and acceptance protections.

- **Finding registration and IDs:** `finding create` requires report/snapshot, severity, exactly one blocking choice, summary/details, and author; it allocates issue-local `F-` IDs, returns canonical records, and checks assignment membership. **Met.**
- **Enums and severity/blocking independence:** The command and ledger validation use the required severity and status enums, with blocking separate from severity; `wontfix` is rejected as a finding status. **Met.**
- **Review declarations and membership:** Submission requires a findings list or no-findings declaration and validates finding provenance against the assigned report/snapshot. However, the raw `process.argv` test is bypassable by `--findings=...`, allowing a contradictory declaration to be accepted; see **06-Q01**.
- **Duplicate provenance:** Explicit linking retains a source report/snapshot and avoids prose-based deduplication. However, linking a new observation to a previously fixed blocking finding leaves it fixed, allowing a current review to report that blocker while acceptance still treats it as resolved; see **06-Q02**.
- **Rulings and requirements changes:** Confirmation remains unresolved; fixed requires a current identity and passing required checks; dismissal requires details; deferral requires rationale/follow-up, and a blocking deferral requires an approved decision plus fresh passing review coverage. The requirements-change path records an attributed decision, invalidates old review assignments on approval, and requires fresh checks/review before the deferral gate can pass. **Met in inspected paths.**
- **Persistence, audit, and idempotency:** Findings, provenance, decisions, and histories are structured in the ledger; issue comments are attributed; identical registrations/submissions/rulings are handled idempotently. Invalid validation paths inspected do not write partial state. **Met in inspected paths.**
- **Status/next and transitions:** Status/next include findings, decisions, blockers, assignments, and actions; submitted unresolved blocking findings route to changes-requested/adjudication. **Met in tested paths.**
- **Public CLI coverage:** Tests exercise registration, issue-local IDs, provenance, dispositions, checks, requirements approval/fresh review, persistence, idempotency, and acceptance blockers. The contradictory `--findings=... --no-findings` form and reappearance of a fixed finding are not covered. The cross-report test invokes the finding CLI but fabricates additional review assignments directly in the ledger.
- **Reviewer guidance and versioning:** The `sdd-reviewer` Blueprint is updated to version `1.2.0`; tracker/tooling guidance documents the new commands and contracts, with packaged/catalog assertions for shipped content. Behavior application of the revised agent guidance remains unverified as noted above.

## Quality

**FAIL.** The implementation keeps the workflow in the existing command/service and versioned-ledger model, uses report/snapshot provenance, validates before writes in the inspected command paths, and adds broad public CLI coverage. The option-conflict check does not use parsed option state, and a newly reported recurrence can inherit a stale resolved ruling. Those are material acceptance-path correctness defects. The full suite was not run, and the changed reviewer guidance has no behavior-level baseline/retest evidence.

## Findings

### 06-Q01 — `--findings` and `--no-findings` conflict check is bypassable

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:922-948`, especially `:934-935`
- **Defect and impact:** The submit action searches `process.argv` for the exact token `"--findings"` instead of checking the parsed option values. Commander accepts the valid `--findings=F-0001` spelling; that token is not equal to `"--findings"`. When followed by `--no-findings`, Commander’s negated option can replace the findings value with `false`, and the handler maps that to `noFindings: true`. Thus the contradictory invocation can evade the mutual-exclusion check and submit as finding-free, discarding the supplied ID. It can also falsely reject an unrelated option value that happens to equal a flag token.
- **Impact:** The CLI does not reliably enforce the required exclusive declaration and can silently discard caller-supplied canonical finding IDs.
- **Required correction:** Enforce exclusivity from parsed argument state (or a parser-level mutually exclusive option contract), not raw process arguments; add public CLI coverage for both `--findings=F-0001 --no-findings` and valid flag-like option values.

### 06-Q02 — Linking a new observation does not reopen a fixed blocker

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:2118-2157`, `:2881-2885`, and `:3137-3164`
- **Defect and impact:** The `--link` path appends provenance/history to an existing canonical finding but never changes its disposition. Later submission logic changes execution to `changes-requested` only when a reported blocking finding is neither `fixed` nor `dismissed`, and `#findingBlockers` likewise excludes all findings whose status is `fixed`. In a normal correction cycle, a controller may fix a blocker, pass checks, and receive a fresh review. If that review finds the same defect and links it to the existing `F-...`, the canonical record remains `fixed`; a passing submission does not route to changes-requested and `accept` sees no unresolved finding blocker, even though the latest report has fresh provenance asserting that finding.
- **Impact:** A defect that has recurred in the reviewed snapshot can be accepted on the strength of an earlier fixed ruling, contrary to the requirements that blockers stay unresolved until verified fixed and that returning findings route to adjudication.
- **Required correction:** Treat a newly linked observation of a resolved finding as requiring renewed adjudication (for example, reopen it or reject the link until the ruling is explicitly revisited); ensure submission/acceptance cannot rely on the stale resolved status. Add a public CLI regression covering fix, fresh report/link, submission, and blocked acceptance.

## Observations and remaining context

- No material unnecessary-complexity finding is established.
- The controller-supplied final checks cover the frozen implementation; the full project suite was not run.
- Reviewer Blueprint installation/version assertions do not substitute for a behavior-level scenario. The implementation report records that the baseline/retest was not performed; this remains a guidance-validation evidence gap.
- This report reviews issue 06 only. It does not assess issues 07–11, aggregate delivery behavior, integration, or make an acceptance/integration decision.
