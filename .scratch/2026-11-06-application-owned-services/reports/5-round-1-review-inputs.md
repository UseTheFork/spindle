# Ticket 05 corrective round 1 review inputs

## Requirements

- Ticket: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/issues/05-installation-service-and-utilities.md`
- Spec: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/spec.md`
- Ticket comments: none; its Comments section is empty.
- Initial finding: MINOR-R5-01 in `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/5-code-review.md`
- Initial complete candidate and verification package: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/5-review-inputs.md`
- Initial reviews: code review `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/5-code-review.md`; code-slop `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/5-slop-review.md`; task review `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/5-task-review.md`.
- Implementation and correction history: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/5-implementation.md`
- Applicable test instructions: `/home/sincore/source/spindle/.github/instructions/testing.instructions.md`

## Workspace and snapshot

- Checkout: `/home/sincore/source/spindle`
- Base/HEAD: `d7235b417c6bdbb3806dbefd7dd4245414c8347c`; no commit created.
- Previous reviewed implementation snapshot: the same HEAD plus the dirty/untracked implementation candidate in `5-review-inputs.md`, with the four files below at the previous hashes recorded there.
- Frozen corrected snapshot: the previous implementation candidate plus only the four-file correction below. Remaining implementation files, deletions, and additions match the initial review-input package; no binary changes. Workflow-only ticket marker and review reports are excluded.
- Corrected file hashes:
  - `docs/blueprints.md` — SHA-256 `f7bd127f91d241af29ba47ce4874473481300a678795fd8f89455155cd4dd06f` (previous: `262b054ba3feb3c7304a98a21cec4fd8ee56b1fd1511f2395ad65c1ffcad8776`)
  - `src/cli.ts` — `d9809a81f1f594c42b743620a55b5451dbbbda0451162c5bfef7a32b55344e6c` (previous: `2f2f5e0795c52a7f680104937ee0bca4c61b88faad16289292fff2f4e9e10f79`)
  - `src/utilities/blueprint-source-root.ts` — `b2a810f4e5f6a06028dd4e5356bccb9fe5a2d056647d5e48c152fa6329e19e47` (previous: `b377d791d826ccd44c38c41b57e73fe780fb9d7a6280298ae1f2bfa90e1c0775`)
  - `tests/install.test.ts` — `cd06b96d0ae6fdc00ed4f0ce93f197e653ddb2305d4d0acc06c0aa3a349ea7a3` (previous: `a5c4105a67e6ad0cefa4b870794e949152bd639d18cbb8db2bb3185f42b0f72e`)

## Finding and complete fix delta

Verbatim finding:

> **MINOR-R5-01 — Relative Blueprint source overrides are not fixed to the App's creation-time directory.** **Confidence: High.** `src/utilities/blueprint-source-root.ts:5-6` returns `SPINDLE_BLUEPRINTS_DIR` unchanged. When the override is relative, the App stores a relative root; subsequent filesystem use resolves it against the then-current working directory. If a programmatic caller changes directories after App construction, reconciliation can read a different asset tree or fail to find assets, contrary to the immutable-root requirement. Resolve a relative override to an absolute path when constructing the App, or reject it with a clear validation error. This is a narrow case and is non-blocking.

Complete corrective delta, also shown in the appended section of `5-implementation.md`:

- `src/utilities/blueprint-source-root.ts`: accept `workspaceRoot`; use `resolve(workspaceRoot, SPINDLE_BLUEPRINTS_DIR)` when overridden. Absolute overrides remain absolute; package/source fallback logic is unchanged.
- `src/cli.ts`: pass the already-discovered `workspaceRoot` into source-root resolution at App construction.
- `tests/install.test.ts`: add a test with a relative override, nested initial cwd, and later cwd change; assert the App stores the absolute workspace-relative root and still installs the expected Skill.
- `docs/blueprints.md`: document that relative overrides resolve against the discovered Git workspace root and stay fixed after cwd changes.

## Prior verdicts and controller ruling

- Initial code review found only this Minor; Ready to merge was Yes.
- Initial code-slop review found no material slop.
- Initial Spec/Quality review passed with no findings.
- Controller ruling persisted before dispatch: resolve once against the absolute `workspaceRoot` at App construction; preserve absolute override and packaged/source fallbacks; do not introduce a current-directory lookup. Add focused regression coverage and document relative semantics.
- Corrective round: 1 of 5; prior attempts: NONE.

## Verification

Controller-run on the frozen corrected candidate:

- Format and lint checks on all changed docs/source/tests — passed.
- `just test::types` — passed.
- `just test::test tests/install.test.ts tests/init.test.ts tests/update.test.ts tests/rendering.test.ts tests/stubs.test.ts tests/catalog.test.ts tests/coordinated-preparation.test.ts tests/app.test.ts` — passed, 96 tests, 0 failures.
- `just build` — passed.
- `just test::test tests/packaged-cli.test.ts` — passed, 4 tests, 0 failures, after build.
- `just test::test` — passed, 199 tests, 0 failures, sequentially after build.
- `just tool::git diff --check` — passed.

The implementer reports a RED run for the focused regression before the fix and GREEN afterward; see `5-implementation.md`. Checks and hashes above identify the current corrected source/test candidate.
