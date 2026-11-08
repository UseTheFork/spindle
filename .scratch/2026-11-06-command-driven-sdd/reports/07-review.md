# Issue 07 review — Require eligible specialist reviews

## 1. Scope and snapshot

- **Scope:** Initial issue review (`INITIAL_ISSUE`), comprehensive Spec and
  Quality review of issue 07.
- **Snapshot:** Base and HEAD are both
  `624c7744feb0f022b7983907feda41e4fe0d0a65`. The reviewed change is the
  supplied uncommitted diff for the nine product files, with aggregate
  implementation identity
  `2fb08471ceb13be047b97d70e92f7a00e39152faa9932c85dc178fc0081d8716`.
  I independently verified the nine supplied per-file SHA-256 values against
  the checkout. The controller-owned issue update and this report are excluded
  from product identity.
- **Requirements:** Canonical issue
  `.scratch/2026-11-06-command-driven-sdd/issues/07-require-eligible-specialist-reviews.md`;
  feature `spec.md` and `design.md` in that workspace; `GLOSSARY.md`;
  `docs/agents/domain.md` and `docs/agents/tooling.md`; ADR-0001
  (`docs/adr/0001-blueprint-lifecycle.md`) and ADR-0003
  (`docs/adr/0003-catalog-selected-blueprints.md`); applicable code-commenting
  and testing instructions; and the TDD and verification skill references.
- **Change inventory:** `docs/agents/issue-tracker.md`,
  `docs/agents/tooling.md`, `src/blueprints/agents/sdd-code-reviewer.agent.md`,
  `src/blueprints/agents/sdd-orchestrator.agent.md`,
  `src/blueprints/catalog.ts`,
  `src/blueprints/skills/int-subagent-driven-dev/SKILL.md`,
  `src/commands/sdd/sdd-command.ts`, `tests/catalog.test.ts`, and
  `tests/sdd-workflow.test.ts`.

## 2. Evidence and limitations

- I inspected the complete supplied product diff, the relevant current
  implementations and tests, the catalog and Blueprint lifecycle context, and
  the issue, spec, design, guidance, and applicable ADRs. The catalog diff
  confirms that its optional `canReview` schema support and runtime
  normalization were already present at the base. The comprehensive
  `sdd-reviewer` was already marked eligible; this change marks the legacy
  `sdd-code-reviewer` as eligible and extends coverage.
- **Controller-supplied same-snapshot verification (not run by me):**
  formatting check passed on all nine product files; targeted TypeScript lint
  passed; type-check and build passed; focused SDD/catalog/install tests passed
  69/69; packaged CLI tests passed 5/5; `git diff --check` passed.
- **Implementer-supplied TDD evidence (inspected in
  `reports/07-implementation.md`, not independently run):** the first focused
  RED failed because `review require` was unsupported; a second focused RED
  failed because specialist objective was lost on unavailable submission;
  focused specialist GREEN passed 2/2; the final implementer test group passed
  66/66.
- I ran no tests or other project checks. The full repository test suite and
  coverage were not run in the supplied verification; those remain evidence
  limitations, not a finding of failure.

## 3. Spec

**Verdict: PASS**

- **Catalog eligibility semantics:** The catalog's optional field is
  agent-only at runtime, boolean-validated, and preserved during normalization,
  including explicit `false`. Eligibility decisions use exact `canReview ===
  true`, so absent and false values do not qualify. Tests cover true/false
  normalization, nonboolean rejection, and rejecting the field on skills and
  instructions.
- **Requirement registration:** `review require` takes explicit spec, issue,
  agent, details, and author; validates controller ownership and nonempty
  objective; and rejects unknown or not-explicitly-eligible catalog agents
  before state mutation. The objective and attribution are persisted and
  audited. Identical registration is idempotent; conflicting replacement,
  duplicate default-policy registration, and registration after assignments
  freeze are rejected. There is no removal operation.
- **Assignment and provenance:** The default reviewer and each pinned
  specialist receive distinct UUID-backed assignments and report paths while
  retaining role `review`; specialist objective is separate from submission
  failure details. Submission requires the assigned ID and exact destination.
  Snapshot, inventory, and submitted-report digest are revalidated. Acceptance
  requires exactly one matching initial assignment for each pinned reviewer,
  rejects unrequired assignments and duplicate IDs/paths, and blocks pending,
  failed, unavailable, stale, or changed-report evidence.
- **Pinned policy and complete batch:** The required list combines the stored
  issue review policy with specialist requirements. Registration does not
  rewrite the stored policy; status/reporting reads retain stored policy
  rather than replacing it with current defaults. The default remains one
  comprehensive reviewer, with no automatic three-reviewer batch or selectable
  profile. Existing public CLI coverage exercises stored-policy stability;
  current changes add requirement idempotency and complete-batch behavior.
- **Boundaries:** Eligibility is catalog metadata only. The CLI does not add
  harness-availability, generic capability, lifecycle, Stack-applicability,
  or installation checks. Orchestrator and controller guidance separately
  require confirming actual callability before specialist dispatch.
- **Blueprint and tooling integration:** The legacy `sdd-code-reviewer`
  Blueprint is narrowed and versioned as a justified specialist rather than
  replacing the comprehensive `sdd-reviewer` contract. The orchestrator access
  list, controller skill, issue-tracker and Just guidance explain eligibility,
  specialist objectives, distinct assignments, and callability. Catalog
  lifecycle/install tests verify the shipped specialist Blueprint.

## 4. Quality

**Verdict: PASS**

- The implementation reuses the already-established catalog schema and
  workflow identity/provenance machinery instead of adding a general
  capabilities or reviewer-profile model.
- The public CLI tests cover eligible/ineligible registration and
  no-mutation failures, objective persistence and separation from submission
  details, idempotency/conflicting replacement, distinct assignments and
  destinations, provenance substitution rejection, pending-batch acceptance
  blocking, and successful acceptance after all required reviews pass.
  Existing workflow tests cover failed/unavailable and stale review evidence;
  catalog tests cover validation and normalization. Assertions exercise
  observable command behavior and persisted state.
- The focused implementation changes are consistent with surrounding ledger,
  lock, snapshot, and report-validation patterns. No material unnecessary
  complexity or demonstrated regression was identified.
- The comprehensive reviewer Blueprint introduced by issue 06 remains
  available and is still the default. The changed legacy code-reviewer
  Blueprint clearly limits its role to the assigned specialist objective.

## 5. Findings

**NONE.**

## 6. Observations and remaining context

- The full repository suite and coverage remain unverified; controller-supplied
  focused, packaging, type, lint, formatting, build, and diff checks cover the
  assigned change but do not establish full-suite status.
- No additional controller decision or scope clarification is required by this
  review.
