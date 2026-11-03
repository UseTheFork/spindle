# 04: Guarantee coordinated preparation and packaged behavior

Reporter: unknown
Category: enhancement
Status: ready-for-agent
Execution: integrated

Source: [Feature specification](../spec.md)

**What to build:** Catalog reconciliation across all kinds prepares the entire
selected change set before modifying an installation, reports partial progress
on application failure, and works identically from the packaged CLI outside the
checkout.

**Blocked by:**
- 02: Remove retired and Stack-inapplicable content.
- 03: Reconcile authoritative directory membership.

- [X] Coordinate catalog validation, source expansion, update/conflict/new-content
      decisions, all selected rendered writes, whole-target deletions,
      destination-only cleanup, Config writes, and managed Just imports before
      any installation changes.
- [X] Preparation failures leave the complete installation, Config, and root
      imports unchanged, even when valid writes and destructive cleanup were
      already planned in other kinds.
- [X] A current or skipped update does not accidentally suppress confirmed
      cleanup, and a preparation failure does not accidentally apply it.
- [X] Filesystem failures during application stop the command with unsuccessful
      status and explicit diagnostics identifying changes already applied and
      the failure. Do not claim successful rollback or hide partial progress.
      Full transactional rollback remains out of scope.
- [X] Use existing failure-injection patterns to exercise application-time
      write and deletion failures through the real CLI without introducing a
      public testing API.
- [X] CLI tests pair planned deletions and directory cleanup with failures in
      another selected kind's templates, metadata, or Just preparation. Assert
      exact unchanged filesystem bytes, Config, imports, and outside-root
      sentinel content.
- [X] Cross-kind tests cover successful mixed writes/removals/cleanup and
      repeated runs, verifying exact results and operation reporting rather than
      private planner structure.
- [X] Packaged CLI smoke tests run outside the checkout with bundled catalog
      and Blueprint assets, without a source-tree fallback, and demonstrate
      initialization/update behavior and managed import correctness.
- [X] Complete the regression migration: remove remaining obsolete legacy
      discovery/layout/composition assertions and verify retained rendering,
      binary preservation, version handling, conflict behavior, and unrelated
      CLI workflows still work.
- [X] Reconcile authoring guidance, glossary, architectural records, packaging
      expectations, and fixtures with the final behavior, preserving unrelated
      content and historical decision context. Do not silently change design
      approval records as a side effect of implementation.
- [X] Run focused failure/packaging tests, type checking, and related CLI
      regression suites through project Just recipes; resolve integration
      regressions caused by the combined changes.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
**2026-11-03T19:25:01Z - @unknown**
Execution set to `claimed` at clean base `518a80414bcf32f3289f49785be9b18319c9b7f7` in `/home/sincore/source/spindle`; ticket 02 is integrated at `5be1be9e35d332c422152a3b5d09c2921a79af18` and ticket 03 at the base. Workspace reports resolved through `just spindle::sdd workspace`. Confirmed real-CLI failure-injection seams (`tests/fail-agent-write.mjs`, `tests/fail-config-write.mjs`, `tests/fail-removal.mjs`) and packaged CLI tests (`tests/packaged-cli.test.ts`). Relevant terms and decisions reviewed in `GLOSSARY.md`, proposed `docs/adr/0003-catalog-selected-blueprints.md`, and issue 04; historical approval labels will remain unchanged.
**2026-11-03T19:25:16Z - @unknown**
Execution set to `implementing` at base `518a80414bcf32f3289f49785be9b18319c9b7f7`; the SDD implementer is assigned ticket 04. Tickets 02 and 03 are integrated dependencies.
**2026-11-03T19:49:24Z - @unknown**
Execution set to `in-review` on the frozen uncommitted ticket 04 snapshot, base/head `518a80414bcf32f3289f49785be9b18319c9b7f7`. Controller gate passed: `just test::test` (195/195), `just test::types`, scoped `just format::check GLOSSARY.md docs/adr/0003-catalog-selected-blueprints.md docs/blueprints.md package.json src/blueprints/just.ts src/blueprints/lifecycle.ts src/blueprints/types.ts src/update.ts tests/coordinated-preparation.test.ts tests/packaged-cli.test.ts tests/removals.test.ts`, scoped `just lint::check src/blueprints/just.ts src/blueprints/lifecycle.ts src/blueprints/types.ts src/update.ts tests/coordinated-preparation.test.ts tests/packaged-cli.test.ts tests/removals.test.ts`, and `just tool::git diff --check HEAD`. A focused post-lint-correction packaged suite passed 4/4. The implementer reported `pnpm run build` passed before handoff; no build recipe exists in this checkout's Just tooling. Snapshot patch: session `files/ticket04-reviewed-snapshot.patch`; key SHA-256 values recorded with the implementation/review evidence. Initial code, code-slop, and Spec/Quality reviews now dispatched in parallel.
**2026-11-03T19:54:49Z - @unknown**
Execution set to `changes-requested` after initial ticket 04 reviews. `T04-R1-01` (Important, code review): “A selected Skill directory is applied file-by-file by `installPlannedBlueprintFiles`, but the code records only one completed-change entry after the entire call succeeds. If a later supporting file fails after an earlier file was written (or the Skill target was removed for replacement), the command reports the failed Skill but omits the newly applied files within that operation. This hides partial application progress, contrary to the required diagnostics. Record successful files as they are applied and identify the specific file whose application failed; add a real-CLI test that fails on a later Skill file and checks the partial-state diagnostic.” Code-slop review found no issues. Task review marked Spec/Quality UNVERIFIED because the first review patch omitted untracked `tests/coordinated-preparation.test.ts`; controller regenerated the complete patch, verified it includes that test (file SHA-256 `d5b69f31224117cff07c5e910295f01a074b78e2126ab79faa08015e70aa4505`, full package SHA-256 `8992d5d9c2ad3405fd1ece7180070e8aba58b2f9f8370ed0f96a8ea0e111ec52`), and the unchanged source snapshot had fresh 195/195 tests, type, format, lint, diff-check, and packaged 4/4 evidence. Re-review must confirm this snapshot/report evidence now matches while assessing the implementation fix. Reports: `../reports/04-code-review.md`, `../reports/04-code-slop-review.md`, `../reports/04-task-review.md`. One corrective dispatch is assigned (round 1 of five).
**2026-11-03T19:54:55Z - @unknown**
Execution set to `implementing` for corrective round 1 at base `518a80414bcf32f3289f49785be9b18319c9b7f7`; `T04-R1-01` is assigned. Controller administrative correction for the review-package omission is complete; full patch artifact now includes the untracked coordinated-preparation test.
**2026-11-03T20:01:58Z - @unknown**
Execution set to `in-review` after corrective round 1. Controller checks on corrected snapshot passed: `just test::test tests/coordinated-preparation.test.ts tests/directory-membership.test.ts tests/agents.test.ts` (50/50), full `just test::test` (196/196), `just test::types`, scoped `just format::check src/install.ts src/blueprints/lifecycle.ts tests/coordinated-preparation.test.ts tests/fail-skill-file-write.mjs`, scoped `just lint::check` on the same files, and `just tool::git diff --check HEAD`. Complete corrective package includes tracked worktree diff and both untracked test files: session `files/ticket04-round1-reviewed-snapshot.patch` SHA-256 `9e14c49d6fc58cccbfc42da97d244b374cfbd08989d73673fa7cda9209c4e761`; `tests/coordinated-preparation.test.ts` SHA-256 `0bd220ceadffc0cf666970540745ac4f431997dc76c24c3d40cbf0135972609f`; `tests/fail-skill-file-write.mjs` SHA-256 `17545bd823929798d959851b26b408456ac59ef63a0330b23eb54e4b6af460a2`. Re-review `T04-R1-01` and task-review reconciliation of prior patch omission are dispatched.
**2026-11-03T20:06:29Z - @unknown**
Execution set to `integrated` after initial code review finding `T04-R1-01` was addressed in corrective round 1; scoped re-review confirms addressed/no new breakage, initial code-slop review found no issues, and task review addendum verifies the complete package and passes Spec/Quality (prior `REV-04-01` snapshot omission resolved). Fresh checks on the final source snapshot: focused coordinated/membership/agent tests 50/50; full suite 196/196; types; scoped formatting/lint; and diff-check passed. A fresh package build was run through a Just wrapper because no build recipe exists; fresh packaged CLI tests passed 4/4. Evidence: `../reports/04-code-review.md`, `../reports/04-code-slop-review.md`, `../reports/04-task-review.md`, `../reports/04-re-review-round1.md`, and `../reports/04-implementation.md`. Commit follows.
**2026-11-03T20:12:12Z - @unknown**
Final aggregate review of committed range `33a7515fabbd13aaa46710ae3a2acd1e00eba622..4f8608253ba8c1701794214ae5d9e02f8e6eb0db`: code review found no Critical/Important findings but reported two Minor issues; code-slop review reported three Minor issues. Controller rules all five in-scope and uses the one allowed full-spec final-fix dispatch. Code review findings: `FINAL-01` — Just Module staging directory created during preparation is cleaned only if the prepared apply callback runs; if an earlier Agent/Instruction/Skill application fails, `.spindle-just-modules-*` remains at project root. Clean staged resources on abort and test real CLI with a Just module plus earlier-kind injected failure, asserting no leftover staging directory. `FINAL-02` — active managed Just Module imports with noncanonical aliases are retained by alias-based lookup while canonical import is appended; match selected managed target by path and normalize or fail clearly, with real-CLI test. Code-slop findings: `FINAL-SLOP-01` — remove unused `ReconciliationPlan.deletions` field, parameter and call-site plumbing; `FINAL-SLOP-02` — remove unused `expandBlueprintCatalog` wrapper; `FINAL-SLOP-03` — remove duplicate Just filename/identifier planner validation while retaining catalog parser validation. Full reports: `../reports/final-review.md`, `../reports/final-code-slop-review.md`. One final-fix dispatch assigned, followed by controller checks and scoped re-review; prior T03/T04 ticket corrective rounds remain unchanged.

**2026-11-03T20:27:13Z - @unknown**
Final-fix re-review passed: all five `FINAL-*` findings are addressed and no new Critical or Important breakage was found (`../reports/final-fix-review.md`). Controller final verification on the reviewed snapshot passed: `just test::test` (198/198), `just test::types`, scoped `just format::check` and `just lint::check` on the six changed source/test files, `just tool::git diff --check HEAD`, fresh package build through a temporary Just recipe, and `just test::test tests/packaged-cli.test.ts` (4/4). Ticket 04 is integrated; all four tickets are integrated. The design and ADR approval labels remain unchanged.
