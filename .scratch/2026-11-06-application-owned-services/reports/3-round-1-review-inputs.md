# Ticket 03 corrective round 1 review inputs

## Requirements

- Ticket: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/issues/03-setup-and-sdd-command-services.md`
- Spec: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/spec.md`
- Ticket comments: none; ticket Comments section is empty.
- Initial findings: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/3-code-review.md`
- Initial review inputs and complete ticket-03 implementation snapshot: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/3-review-inputs.md`
- Implementation and corrective history: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/3-implementation.md`
- Applicable test instructions: `/home/sincore/source/spindle/.github/instructions/testing.instructions.md`
- The ticket and initial report manifest define the full ticket scope. This round is limited to the fix delta in `tests/git-root.test.ts`.

## Workspace and snapshot

- Checkout: `/home/sincore/source/spindle`
- Comparison base and HEAD: `a65c33bfb13fe1d374e6114d5aad9ef261331536`; no commit created.
- The frozen corrective candidate is the same uncommitted ticket-03 snapshot described completely in the initial review inputs, plus the single helper-call replacement below. The initial package's `tests/git-root.test.ts` SHA-256 was `13c35a8e1c055ab61225a3369cb7cbce4d266a476cb19b7bed0748fbb1832357`; corrected file SHA-256 is `a6be27f069928ff5ee881fd17b318d4b93a92811f0916a8c5c9d4f900d66c2db`.
- No other source, test, or documentation edits were made in this corrective round. Corrective worker appended only the assigned implementation report. Controller updated the ticket execution state and this review package.

## Finding and complete fix delta

Verbatim finding:

> **REV-03-01 — `tests/git-root.test.ts:156-167`; helper behavior at `tests/helpers.ts:29-36`.** The test named “help and version work outside Git” calls `runCli`, which invokes `ensureGitWorkspace(project)` and initializes a Git worktree before starting the CLI. Consequently, it checks that help/version work when Git is absent from the child process `PATH`, but does not check the separate outside-a-worktree condition claimed by the test and required by the spec. This leaves a small regression-coverage gap, not an observed runtime defect: `src/index.ts:31-34` visibly bypasses discovery for these requests. Use the already imported `runCliRaw` helper for this case so the temporary directory remains outside Git.

Corrective diff:

```diff
-      const result = runCli(project, args, "");
+      const result = runCliRaw(project, args, "");
```

The test already imported `runCliWithFixtureCatalogRaw as runCli`. `tests/helpers.ts` defines this raw fixture helper to delegate to `runCliRaw` without `ensureGitWorkspace`; no fixture environment is passed in this test. The changed call therefore clarifies intent but is behavior-equivalent to the prior call. The generic, unaliased `runCli` helper does call `ensureGitWorkspace`.

## Verification

Controller-run on the frozen correction snapshot:

- `just format::check tests/git-root.test.ts` — passed.
- `just lint::check tests/git-root.test.ts` — passed.
- `just test::types` — passed.
- `just test::test tests/git-root.test.ts` — passed, 6 tests, 0 failures.
- `just tool::git diff --check` — passed.
- The initial review package records the prior full-suite run: `just test::test` passed, 196 tests, 0 failures, on the same implementation snapshot before this behavior-equivalent test helper spelling change. No production code changed in this round; build was not rerun.

The implementer initially ran the focused test on the correction snapshot (6/6). The controller independently reran it and all applicable checks above.
