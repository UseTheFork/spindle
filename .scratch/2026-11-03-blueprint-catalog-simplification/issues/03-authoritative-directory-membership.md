# 03: Reconcile authoritative directory membership

Reporter: unknown
Category: enhancement
Status: ready-for-agent
Execution: integrated

Source: [Feature specification](../spec.md)

**What to build:** Catalog-selected directories own installed membership:
destination-only files disappear even when updates are current or skipped,
while surviving content retains its existing version and conflict rules.

**Blocked by:** 01: Install and update through the Blueprint Catalog.

- [X] Initialization and update compare matching selected source directories
      with their installed subtrees and delete every destination-only file,
      including nested local additions and previously shipped files.
- [X] Cleanup runs for current Skills and Skills whose updates are skipped;
      version checks, conflict-skip decisions, and new-content choices do not
      suppress removal of destination-only files in an installed selected tree.
- [X] Cleanup does not itself overwrite surviving files or install source-only
      files. Agent/Instruction version and new-content decisions remain per file;
      Skill additions and changes still require a whole-Skill version update.
- [X] A new supporting file is withheld from a current Skill without a version
      bump, but is installed by an accepted qualifying Skill update.
- [X] Grouped Agents and Instructions independently produce updated, current,
      skipped, unknown-version, and new-file outcomes while destination-only
      files are cleaned up.
- [X] File selections do not authorize cleanup of neighboring files; directory
      cleanup stays inside the selected subtree. Preserve unrelated content
      outside catalog-owned targets.
- [X] Reuse catalog ownership validation and reject symbolic-link traversal and
      unsafe cleanup targets before changes. No installed-content tracking
      database is introduced.
- [X] Report actual cleanup removals and surface failures explicitly. Expose
      planned cleanup work for coordinated preparation in ticket 04.
- [X] Real CLI tests assert exact filesystem membership and surviving bytes
      after upstream file disappearance, local additions, current/skipped Skill
      cleanup, grouped file updates, and repeated runs. Test nested paths and
      ordinary internally named Stack directories.
- [X] CLI tests prove unrelated neighboring content is retained and unsafe
      cleanup targets cannot cause deletion outside the selected subtree.
- [X] Update directly related ownership/versioning documentation and run
      focused tests and type checking through project Just recipes.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
**2026-11-03T18:10:16Z - @unknown**
Execution set to `claimed` at base `5be1be9e35d332c422152a3b5d09c2921a79af18` in `/home/sincore/source/spindle`; ticket 01 is integrated and the worktree was clean before this tracker update.
**2026-11-03T18:10:45Z - @unknown**
Execution set to `implementing` at base `5be1be9e35d332c422152a3b5d09c2921a79af18`; the SDD implementer is assigned ticket 03, with ticket 01 integrated as the dependency.
**2026-11-03T19:06:48Z - @unknown**
Execution set to `in-code-review` on the uncommitted ticket 03 snapshot based on `5be1be9e35d332c422152a3b5d09c2921a79af18`. Controller updated the stale `--on-conflict skip` expectation to align with required destination-only cleanup and formatted assigned files. Fresh full tests passed 188/188, types, scoped format/lint, and diff check.
**2026-11-03T19:07:00Z - @unknown**
Execution set to `in-review` on the same frozen ticket 03 snapshot; initial code, code-slop, and Spec/Quality reviews are dispatched in parallel.
**2026-11-03T19:11:15Z - @unknown**
Execution set to `changes-requested` after round-1 reviews on the uncommitted ticket 03 diff. Blocking Important finding `T03-R1-01`: when an accepted whole-Skill update removes destination-only files, membership cleanup runs afterward and sees those paths absent, so their removals are not reported. Preserve/report the planned destination-only paths subsumed by the accepted Skill replacement; add an assertion for `accepted/local.txt`. Code-slop finding `T03-R1-SLOP-01` (Minor): membership cleanup duplicates validation/application/error/reporting flow from catalog deletion in `src/blueprints/lifecycle.ts`; consider shared helpers while keeping operation categories and policies distinct. Reports: `../reports/03-code-review.md`, `../reports/03-code-slop-review.md`, `../reports/03-task-review.md`. One corrective dispatch is assigned (round 1 of five).
**2026-11-03T19:11:30Z - @unknown**
Execution set to `implementing` for corrective round 1 at base `5be1be9e35d332c422152a3b5d09c2921a79af18`; findings `T03-R1-01` and `T03-R1-SLOP-01` are assigned.
**2026-11-03T19:18:39Z - @unknown**
Execution set to `in-review` after corrective round 1. Controller checks on the frozen working-tree snapshot (base `5be1be9e35d332c422152a3b5d09c2921a79af18`; lifecycle SHA-256 `9453164c81f7bd256b9e00c6ad12e9275fa0d2456e3ef07d7c7c03adc0b8232a`; membership-test SHA-256 `0a2cf89aa1f23f8419c2485b311e7a66d0a97647263120acbaba8994754f550d`) passed: `just test::test` (188/188), `just test::types`, scoped `just format::check src/blueprints/catalog.ts src/blueprints/lifecycle.ts tests/directory-membership.test.ts tests/existing-repo.test.ts docs/blueprints.md`, scoped `just lint::check src/blueprints/catalog.ts src/blueprints/lifecycle.ts tests/directory-membership.test.ts tests/existing-repo.test.ts`, and `just tool::git diff --check HEAD`. Findings `T03-R1-01` and `T03-R1-SLOP-01` are assigned to scoped corrective-round re-review. Acceptance remains pending reviewer return and controller reconciliation.
**2026-11-03T19:22:38Z - @unknown**
Execution set to `integrated` after scoped re-review addressed `T03-R1-01` (Important) and `T03-R1-SLOP-01` (Minor), with no new breakage; initial code, code-slop, and Spec/Quality reviews passed or were resolved. Fresh final verification on the same source snapshot: `just test::test` passed 188/188; `just test::types`, scoped `just format::check src/blueprints/catalog.ts src/blueprints/lifecycle.ts tests/directory-membership.test.ts tests/existing-repo.test.ts docs/blueprints.md`, scoped `just lint::check src/blueprints/catalog.ts src/blueprints/lifecycle.ts tests/directory-membership.test.ts tests/existing-repo.test.ts`, and `just tool::git diff --check HEAD` passed. Scoped re-review: `../reports/03-re-review-round1.md`; commit follows.
