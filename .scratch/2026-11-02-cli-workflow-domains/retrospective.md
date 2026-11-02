# Delivery retrospective: CLI workflow domains

Integration range: `a7f652f54c99ee96f1b04287c23ee4529cb943a9`..
`ad50e3a166f833be228c4546c8f29828e8b62494`

## 1. Summary

- **Skills:** The reader loaded `int-domain-modeling` and
  `int-writing-for-agents`. No workspace-instruction candidate was supported,
  so `int-writing-instruction` was not loaded.
- **Tickets:** 01, 02, and 03 are integrated. Ticket 01 had one corrective
  review round; tickets 02 and 03 had none. Snapshot-report reconciliations
  were not code-fix rounds.
- **Blockers and duration:** Ticket 01's build check was blocked because the
  `tool::pnpm` recipe targets a missing directory. A root-targeted Just recipe
  resolved the build check; later tickets used the same workaround. Durations
  were not recorded. All three ticket `## Comments` logs are empty, so no
  duration is inferred.
- **Verdict:** Aggregate reviews found no unresolved code or specification
  issues and recommended merge. The full-suite and repository-wide formatting
  limitations below are not implementation defects. Packaged smoke tests use
  installed runtime dependencies rather than testing a fresh npm installation;
  that was outside the approved criteria.

## 2. Environment findings

### E1 — Automated checks — Minor

- **Evidence:** Ticket controller reports and the final aggregate review
  record the same sole full-suite failure at `tests/stubs.test.ts:85-86`:
  the expected local Skill inventory differs from this checkout's inventory.
  At final verification the suite reported 159/160 tests passing. The focused
  delivery regression suite passed 72/72.
- **Proposal:** Make the inventory test use an isolated fixture or align its
  expectation with the intended environment.
- **Target:** `tests/stubs.test.ts`.

### E2 — Automated checks — Minor

- **Evidence:** The final aggregate review records repository-wide formatting
  failures across more than 50 of 365 files; changed files passed targeted
  formatting checks.
- **Proposal:** Triage the existing formatting baseline and restore a green
  repository-wide formatting check.
- **Target:** Existing unformatted files and
  `.github/scripts/just-modules/format.just`.

### E3 — Tool economy — Minor

- **Evidence:** Ticket 01's controller checks and task review record that
  `tool::pnpm` targets the absent `packages/orchestration` directory, while
  build verification required a temporary root-targeted Just recipe.
  `docs/agents/tooling.md` documents that no usable build recipe exists in
  this checkout.
- **Proposal:** Add a root build recipe and document its use.
- **Target:** `.github/scripts/just-modules/tooling.just` and
  `docs/agents/tooling.md`.

## 3. Domain findings

### Glossary drift

None.

### Undefined terms

None.

### ADR candidates

None. The reviewed choices did not satisfy all three ADR criteria.

## 4. Instruction suggestions

None. No durable gap in `.github/instructions/**/*.instructions.md` is
supported by the delivery evidence.

## 5. Open questions

None.
