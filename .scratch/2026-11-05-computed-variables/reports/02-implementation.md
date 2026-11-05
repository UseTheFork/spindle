# Ticket 02 Implementation Report

## Status

**DONE**

## Checkout and snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `3ae33e89602369d4bfa4371de20d15a3d4e4d030`
- Final revision: `3ae33e89602369d4bfa4371de20d15a3d4e4d030` (no commit authorized)
- The assigned issue file was already dirty at start and remains preserved:
  `.scratch/2026-11-05-computed-variables/issues/02-shared-internal-skill-description.md`.
- Implementation changes are the 14 requested shipped Skill files, `docs/blueprints.md`,
  `tests/computed-variables.test.ts`, and `tests/packaged-cli.test.ts`.
- No untracked checkout changes were present at final snapshot capture. `just build`
  generated the bundled assets used by the package test; build output is ignored.
- The final focused test snapshot was HEAD plus the above implementation/test changes
  and the pre-existing issue-file edit. The report was added after those tests.

## Criteria, changes, and evidence

- Replaced only the matching frontmatter description in all 14 assigned shipped Skill
  Blueprints with `{{ computed.internal_skill_description }}`. Generated values remain
  the exact required sentence.
- Added real-shipped-asset CLI coverage: copy the actual `src/blueprints` tree, use the
  fixture catalog with `init`, and check each migrated Skill's parsed description,
  unchanged version metadata, and absence of unresolved interpolation. The test also
  checks the separate Internal visibility sentence remains in the `int-writing-skills`
  body. It bumps one copied source Skill's version to make an update eligible, then
  verifies that Skill updates and an otherwise-current matching Skill stays
  byte-identical.
- Reworked the packaged CLI test to use the actual bundled shipped Skill asset without
  rewriting it. It runs the packaged CLI from a temporary package/project outside the
  source checkout and verifies the migrated template, rendered sentence, parseable
  metadata/version, and no unresolved interpolation.
- Added the author-facing Computed Variables section to `docs/blueprints.md`. It
  explains the Variables distinction, `computed` namespace, explicit typed registry
  and provider addition, read-only resolved Config construction, parameterless
  synchronous string rendering, once-per-run reuse, no persistence/direct override,
  named failures during preparation before application, and the absence of project
  plugins or machine-wide inputs.
- The behavior-preserving template migration followed RED→GREEN. Initial focused RED
  failed on the intended mismatch: shipped source and built asset still had the
  repeated literal instead of the computed template. After migration, a first GREEN
  attempt exposed a test fixture that had not made its Skill update eligible and a
  stale package build; the fixture was corrected and the assets rebuilt before GREEN.

## Changed files

- `src/blueprints/skills/int-code-review/SKILL.md`
- `src/blueprints/skills/int-code-slop-review/SKILL.md`
- `src/blueprints/skills/int-codebase-design/SKILL.md`
- `src/blueprints/skills/int-domain-modeling/SKILL.md`
- `src/blueprints/skills/int-prototype/SKILL.md`
- `src/blueprints/skills/int-retrospective/SKILL.md`
- `src/blueprints/skills/int-subagent-driven-dev/SKILL.md`
- `src/blueprints/skills/int-test-driven-development/SKILL.md`
- `src/blueprints/skills/int-testing-agent-guidance/SKILL.md`
- `src/blueprints/skills/int-verification-before-completion/SKILL.md`
- `src/blueprints/skills/int-writing-agents/SKILL.md`
- `src/blueprints/skills/int-writing-for-agents/SKILL.md`
- `src/blueprints/skills/int-writing-instruction/SKILL.md`
- `src/blueprints/skills/int-writing-skills/SKILL.md`
- `docs/blueprints.md`
- `tests/computed-variables.test.ts`
- `tests/packaged-cli.test.ts`

## Verification

- RED: `just test::test tests/computed-variables.test.ts tests/packaged-cli.test.ts`
  — both new migration assertions failed on the old shipped frontmatter as intended;
  the other 8 selected tests passed.
- GREEN, final source snapshot: `just test::test tests/computed-variables.test.ts tests/packaged-cli.test.ts`
  — 10 passed, 0 failed. Includes real shipped-asset init/update and the packaged
  CLI integration outside the checkout.
- `just build` — passed; built the CLI and bundled migrated Blueprint assets used by
  the packaged test. The only later change before final focused tests was documentation
  wording; source and bundled assets were unchanged.
- `just tool::git diff --check` — passed on the final implementation changes.
- Self-review confirmed the sentence remains only in the requested `int-writing-skills`
  body occurrence in the shipped Skill tree; no unrelated Skill prose was changed.
- Not run by this implementer: `just format::check`, `just lint::check`,
  `just test::types`, and full `just test::test`. These are pending controller checks,
  not implementer failures or evidence of ticket acceptance.

## Self-review and concerns

No out-of-scope implementation changes or new concerns found. Provider/runtime files,
catalog selection, version/conflict policy, and the pre-existing tracker edit were
left unchanged. No commit was made.

## Hand-back

Ticket 02 implementation evidence is recorded here. The migrated descriptions,
documentation, focused coverage, and normal build are complete; the controller owns
remaining mechanical checks, ticket-wide review/acceptance, and commit authorization.

## Round 1 correction — CTRL-VERIFY-01

**Status: DONE.** This addendum supersedes the earlier snapshot/check summary where
applicable and preserves the initial implementation history.

### Controller verification and assignment

- Controller-reported full-suite result before this correction: **163 passed,
  14 failed**. The seven codebase-design rendering cases and seven production-init
  expected-content cases called `renderText` without the newly required computed
  description. CLI initialization itself succeeded.
- Assigned finding: `CTRL-VERIFY-01`; corrective round: 1. No previous corrective
  dispatch. The controller authorized only test-fixture adaptations in
  `tests/rendering.test.ts`, `tests/stubs.test.ts`, and report updates.
- Checkout and starting/final HEAD remain
  `3ae33e89602369d4bfa4371de20d15a3d4e4d030`. Starting dirty/untracked state matched
  the preceding implementation report and controller disclosure. No commit or
  execution-state edit was made.

### Correction and self-review

- Supplied the exact shipped sentence under `computed.internal_skill_description`
  in the direct-render test contexts in both assigned test files.
- Preserved all rendering, Stack-selection, production file equality, metadata,
  supporting-file, and missing-output assertions. The existing prefix comparison
  now resolves its expected template prefix with the same context, because that
  prefix includes the migrated frontmatter interpolation.
- No product code or shipped assets changed during this correction.
- The literal body sentence in `int-writing-skills/SKILL.md` remains unchanged;
  its explicit existing check in `tests/computed-variables.test.ts` is preserved.
  The passing production-init cases also compare every installed Skill/supporting
  file against its rendered source across all seven Stack combinations.

### Fresh checks and exact tested snapshot

- RED: `just test::test tests/rendering.test.ts tests/stubs.test.ts`
  from `/home/sincore/source/spindle` — **9 passed, 14 failed**, reproducing the
  named missing-computed-output errors before editing.
- GREEN: same command after the narrow correction — **23 passed, 0 failed**.
- `just tool::git diff --check` — passed after the correction.
- Tested snapshot: unchanged HEAD plus all previously disclosed ticket-02 dirty
  files, the preserved dirty issue tracker, and the two corrected legacy test files.
  The existing untracked implementation report was present; only this addendum
  was written after GREEN.
- Final changed-file inventory is the initial implementation inventory plus
  `tests/rendering.test.ts`, `tests/stubs.test.ts`, and this report. All pre-existing
  changes remain preserved.
- No further concerns found in the scoped correction. Controller formatting,
  lint, type checks, and ticket-wide regression verification remain pending for
  this corrected snapshot. The full suite was not rerun by this implementer;
  focused GREEN is not ticket-wide acceptance evidence.

### Controller verification addendum

The ticket 02 review snapshot remains based on HEAD
`3ae33e89602369d4bfa4371de20d15a3d4e4d030` plus the ticket 02 implementation,
test corrections, tracker edit, and this report. No code or test changes were
made after the round-1 focused GREEN.

- `just format::check` over all changed documentation, Skill Blueprints, and
  tests — passed.
- `just lint::check` over the same files — passed.
- `just test::types` — passed.
- `just build` — passed; the build completed before the full suite, ensuring the
  packaged CLI test used freshly bundled assets.
- `just test::test` — passed, 177 tests, 0 failures.
- `just tool::git diff --check` — passed.
- Round-1 focused GREEN `just test::test tests/rendering.test.ts
  tests/stubs.test.ts` — passed, 23 tests, 0 failures; focused RED was 9 passed,
  14 failed on missing computed context before the test-only correction.

### Hand-back

`CTRL-VERIFY-01` is corrected with fresh focused RED/GREEN evidence. Return to the
controller for full-suite verification and acceptance; no commit was made.
