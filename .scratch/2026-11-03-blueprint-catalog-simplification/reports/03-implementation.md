# Ticket 03 implementation hand-back

## Status

**DONE_WITH_CONCERNS** — assigned implementation and focused CLI checks are
complete. Controller-owned type, formatting, lint, and ticket-wide checks remain
pending; this is not a ticket acceptance claim.

## Snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `5be1be9e35d332c422152a3b5d09c2921a79af18`
- Final revision: `5be1be9e35d332c422152a3b5d09c2921a79af18`
- No commit was created; commit authorization was denied.
- Exact tested source snapshot: the final uncommitted changes to
  `src/blueprints/catalog.ts`, `src/blueprints/lifecycle.ts`,
  `docs/blueprints.md`, and `tests/directory-membership.test.ts` on the final
  revision above. The implementation report was written after the final test
  run.
- Preserved pre-existing controller change:
  `.scratch/2026-11-03-blueprint-catalog-simplification/issues/03-authoritative-directory-membership.md`
  (tracker-only update; not edited by this worker).
- No other user changes were present at entry. The only new untracked file before
  writing this report was `tests/directory-membership.test.ts`; this report is
  the other assigned new `.scratch` file.

## Criteria, changes, and evidence

- Active matching directory catalog entries now expose source-owned relative
  file membership. The reconciliation plan separately exposes
  `membershipCleanup` work for coordinated consumers; explicit removed and
  Stack-inapplicable catalog deletions remain distinct.
- Init and update remove destination-only files, including nested upstream
  disappearances and local additions. Cleanup applies even when Skills are
  current or updates are skipped. Surviving files retain their existing
  per-file Agent/Instruction and whole-Skill version/conflict decisions.
- Cleanup does not install source-only files: tests cover withheld new
  Agents/Instructions and new current-Skill support content, then accepted
  include-new and version-bumped Skill updates.
- Selected-file ownership does not authorize neighbor cleanup. Directory
  cleanup is constrained to its selected subtree; unrelated neighboring
  content is retained. Nested `stacks/` content remains ordinary content.
- Destination traversal is checked for symlinks and unsafe file types before
  changes; failures surface explicitly. Cleanup removals are reported by path.
  No installed-content inventory was introduced.
- Direct documentation now describes directory membership ownership and its
  relationship to existing version policies.
- Behavior changes followed RED → GREEN. The focused real-CLI tests initially
  failed because update/init retained destination-only files and accepted a
  nested destination symlink; after implementation the focused suite passed.

## Changed files

- `src/blueprints/catalog.ts`
- `src/blueprints/lifecycle.ts`
- `tests/directory-membership.test.ts`
- `docs/blueprints.md`
- Assigned report file (this file)

The controller's tracker-only update listed above was preserved.

## Fresh checks

Run from `/home/sincore/source/spindle`:

- `just test::test tests/directory-membership.test.ts` — **passed, 4/4** on
  the final source snapshot.
- `just test::test tests/directory-membership.test.ts tests/update.test.ts tests/removals.test.ts tests/agents.test.ts tests/instructions.test.ts tests/init.test.ts`
  — **passed, 114/114** on the final source snapshot.

## Self-review and pending checks

- Self-review found no in-scope behavior issue. Changes remain limited to
  directory-membership planning/cleanup, its tests, and directly related
  ownership documentation. Ticket 04 coordinated preparation/application work
  was not implemented.
- `just test::types` was not run; the controller owns the type gate after
  handoff.
- Formatting, lint, and ticket-wide regression checks were not run; they remain
  with the controller. Approved commands were not treated as a schedule to run
  those gates in this worker.
- No other unresolved implementation concern.

## Hand-back

Ticket 03 implementation is ready for controller review. Real-CLI evidence
covers init/update membership cleanup, version and conflict preservation,
cleanup reporting, repeated runs, file-selection boundaries, and unsafe nested
symlink rejection. Controller checks remain pending; no commit was made.

## Controller verification

The initial controller gate found formatting issues in
`src/blueprints/lifecycle.ts` and `tests/directory-membership.test.ts`. Its
first full-suite run also found a pre-existing assertion in
`tests/existing-repo.test.ts` that expected destination-only Skill files to
remain on `--on-conflict skip`, contrary to ticket 03. The controller updated
that assertion to verify the skipped `SKILL.md` remains unchanged while stale
files are removed, then applied the Just formatter to assigned files and
reran the gate:

- `just test::test` — **passed, 188/188**, exit 0.
- `just test::types` — **passed**, exit 0.
- Scoped `just format::check` on ticket 03 code, tests, and docs — **passed**,
  exit 0.
- Scoped `just lint::check` on ticket 03 code and tests — **passed**, exit 0.
- `just tool::git diff --check HEAD` — **passed**, exit 0.

The reviewed source snapshot is commit
`5be1be9e35d332c422152a3b5d09c2921a79af18` plus ticket 03 changes; report and
tracker updates are not CLI test inputs.

## Corrective round 1

### Status

**DONE_WITH_CONCERNS** — both assigned findings are corrected and focused CLI
checks pass. Controller-owned type, formatting, lint, and ticket-wide regression
checks remain pending; this is not a ticket acceptance claim.

### Snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting and final revision: `5be1be9e35d332c422152a3b5d09c2921a79af18`
- No commit was created; commit authorization was denied.
- Exact tested source snapshot: the uncommitted ticket 03 source plus this
  round's changes to `src/blueprints/lifecycle.ts` and
  `tests/directory-membership.test.ts`, on the revision above. The appended
  report is not a test input.
- Preserved dirty/untracked state includes the existing ticket 03 tracker
  update, `docs/blueprints.md`, `src/blueprints/catalog.ts`,
  `tests/existing-repo.test.ts`, prior lifecycle changes and report history,
  and untracked code-review, code-slop-review, task-review, implementation, and
  directory-membership test files. No unrelated changes were made.

### Findings and evidence

- **T03-R1-01:** The real CLI test now recreates `accepted/local.txt` before
  accepting the whole-Skill replacement and asserts exactly one
  `Removed skill 'accepted/local.txt'` line. The code reports planned cleanup
  paths inside the replaced Skill only when those files still exist and after
  replacement succeeds. A later run asserts the already-absent path is not
  reported. RED: `just test::test tests/directory-membership.test.ts` failed at
  the new assertion (`0 !== 1`); the other three tests passed. GREEN on the
  behavior change: 4/4 passed.
- **T03-R1-SLOP-01:** Catalog deletion and directory-membership cleanup now
  share target validation and removal application, parameterized by expected
  file/directory type, recursion, diagnostics, and completed-operation wording.
  Their planned-operation categories and file/directory policies remain
  distinct.
- Fresh refactor regression run:
  `just test::test tests/directory-membership.test.ts tests/removals.test.ts`
  — **passed, 13/13**, exit 0.

### Self-review and pending checks

- Changes for this round are limited to `src/blueprints/lifecycle.ts`,
  `tests/directory-membership.test.ts`, and this report append.
- No ticket 04 atomic prepare/application work or unrelated behavior was added.
- Type checking, formatting, lint, and ticket-wide/full-suite regression checks
  were not run by this worker; they remain pending with the controller and are
  not implementer failures.

### Hand-back

Corrective round 1 evidence is ready for controller review. The blocking
removal-reporting assertion has verified RED → GREEN, and the behavior-preserving
shared-helper extraction passed its relevant CLI regression suites. No commit
was made.

## Controller verification after corrective round 1

The controller formatted the round's assigned files, then ran fresh checks on
the current uncommitted source snapshot:

- `just test::test` — **passed, 188/188**, exit 0.
- `just test::types` — **passed**, exit 0.
- Scoped `just format::check src/blueprints/catalog.ts src/blueprints/lifecycle.ts tests/directory-membership.test.ts tests/existing-repo.test.ts docs/blueprints.md` — **passed**, exit 0.
- Scoped `just lint::check src/blueprints/catalog.ts src/blueprints/lifecycle.ts tests/directory-membership.test.ts tests/existing-repo.test.ts` — **passed**, exit 0.
- `just tool::git diff --check HEAD` — **passed**, exit 0.

The checked round snapshot is based on
`5be1be9e35d332c422152a3b5d09c2921a79af18`. `src/blueprints/lifecycle.ts`
SHA-256: `9453164c81f7bd256b9e00c6ad12e9275fa0d2456e3ef07d7c7c03adc0b8232a`;
`tests/directory-membership.test.ts` SHA-256:
`0a2cf89aa1f23f8419c2485b311e7a66d0a97647263120acbaba8994754f550d`.
Scoped re-review is pending; this evidence does not assert ticket acceptance.
