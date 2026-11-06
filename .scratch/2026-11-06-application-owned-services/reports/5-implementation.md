# Ticket 05 implementation report

**Status:** DONE_WITH_CONCERNS

## Snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `d7235b417c6bdbb3806dbefd7dd4245414c8347c`
- Final revision: `d7235b417c6bdbb3806dbefd7dd4245414c8347c` (no commit authorized or created)
- The starting worktree contained only the controller-owned ticket execution marker. The final worktree contains that marker, the ticket 05 implementation and this report; no unrelated generated files were found.
- Exact tested snapshot: the final implementation working tree based on `d7235b417c6bdbb3806dbefd7dd4245414c8347c`, before adding this report. No implementation changes followed the final checks.

## Criteria, changes, and tests

- Moved Blueprint reconciliation into `src/installation/installation-service.ts`. The App-managed service receives immutable workspace and source roots from its App and supplies them to the operation. Init and Update resolve this service in `boot()` and call it directly; the old reconciliation export and `src/blueprints/lifecycle.ts` were removed.
- Removed `src/install.ts`. Installation filesystem/rendering helpers now live in `src/utilities/blueprint-files.ts`; Stack and conflict-policy helpers are split into focused utility files, and installation types are standalone in `src/installation/types.ts`.
- The CLI resolves the Blueprint source root at application construction. `SPINDLE_BLUEPRINTS_DIR` remains an asset-only override; adjacent packaged assets and source-mode assets retain their lookup behavior. The installation service does not re-read environment state or derive paths from the current directory.
- Operation state remains local to each reconciliation call. Added workflow-level coverage using explicit roots: two Apps install into separate workspaces from separate source roots, and repeated use of one service observes its updated source without changing the other App's generated files.
- Migrated command, catalog, rendering, stub, and installation-test imports to the new APIs. Existing output, validation, filesystem-safety, preparation-before-application, generated-file, and no-unintended-write assertions were retained.
- Updated `docs/blueprints.md` to document application-owned source-root resolution and packaged assets.
- TDD evidence: treated the migration as a pure refactor and established a passing baseline of 84 focused tests before restructuring. The added isolation test was written after the service migration and passed on its first run; no historical RED is claimed or manufactured.

## Changed files

- Replaced `src/blueprints/lifecycle.ts` with `src/installation/installation-service.ts`.
- Replaced `src/install.ts` with `src/installation/types.ts` and:
  - `src/utilities/blueprint-files.ts`
  - `src/utilities/blueprint-source-root.ts`
  - `src/utilities/conflict-policy.ts`
  - `src/utilities/stacks.ts`
- Updated `src/cli.ts`, `src/commands/init/init-command.ts`, `src/commands/update/update-command.ts`, and `src/blueprints/catalog.ts`.
- Updated `tests/install.test.ts`, `tests/rendering.test.ts`, and `tests/stubs.test.ts`.
- Updated `docs/blueprints.md`.
- The controller-owned issue marker was not edited.

## Verification

All commands ran through Just from `/home/sincore/source/spindle`.

- Baseline: `just test::test tests/install.test.ts tests/init.test.ts tests/update.test.ts tests/rendering.test.ts tests/stubs.test.ts tests/catalog.test.ts tests/coordinated-preparation.test.ts` — passed, 84 tests.
- Post-migration focused suite: same command — passed, 84 tests.
- Added-test check: `just test::test tests/install.test.ts` — passed, 2 tests, including App isolation and repeated operation.
- Final focused suite: `just test::test tests/install.test.ts tests/init.test.ts tests/update.test.ts tests/rendering.test.ts tests/stubs.test.ts tests/catalog.test.ts tests/coordinated-preparation.test.ts` — passed, 85 tests.
- Type check: `just test::types` — passed.

## Self-review and pending checks

- No implementation issue was found in self-review. The final focused suite confirms source-mode installation and workflow behavior.
- Not run: formatting, lint, full regression suite, build, and the packaged-CLI test. These remain with the controller; packaged execution should be verified against a build containing this snapshot. These pending checks are not implementer failures or evidence of ticket acceptance.

**Hand-back:** Installation ownership, utility organization, consumer migration, and focused coverage are complete. No commit was created. Controller-owned build/package, formatting, lint, and broader regression checks remain pending.

## Initial review and corrective round 1

- Initial code review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/5-code-review.md` found one Minor finding, MINOR-R5-01. Relative `SPINDLE_BLUEPRINTS_DIR` values remain relative on the App and can resolve differently after process cwd changes.
- Initial code-slop review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/5-slop-review.md` found no material slop.
- Initial Spec/Quality review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/5-task-review.md` passed both with no findings.
- Controller ruling: resolve the override once against the discovered absolute `workspaceRoot` while constructing the App. Preserve absolute override and packaged/source fallbacks; do not introduce a `process.cwd()` read outside bootstrap. Add a focused regression test and document relative override semantics.
- Corrective budget: round 1 of 5, persisted before dispatch. Prior attempts for MINOR-R5-01: NONE.
- Corrective implementation report path: append to this file. Scoped re-review path: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/5-round-1-review.md`.

## Corrective round 1 implementation result

**Status:** DONE

### Finding, ruling, and correction

- Round: 1 of 5. Assigned finding: MINOR-R5-01. Prior attempts: NONE.
- Followed the controller ruling: `resolveBlueprintSourceRoot(workspaceRoot)` resolves the environment override against the discovered absolute workspace root during CLI App construction. No new/current-directory lookup was introduced in production. Absolute overrides remain absolute; the packaged/source fallback branches are unchanged.
- Added one regression at the confirmed source-root-resolution/App/installation seam. Construction occurs from a nested cwd distinct from the workspace root. The test asserts the absolute workspace-relative source root, changes cwd, then verifies that reconciliation still installs the expected Skill. It restores cwd and the original environment override in `finally`.
- Documented that relative overrides are workspace-root-relative rather than invocation-directory-relative and remain fixed after cwd changes.

### Snapshot and changed files

- Checkout: `/home/sincore/source/spindle`.
- Starting and final revision: `d7235b417c6bdbb3806dbefd7dd4245414c8347c`; no commit authorized or created.
- Starting inventory matches `5-review-inputs.md`, plus the controller-persisted corrective ticket context and initial review reports. The four correction-file starting hashes matched that package.
- Changed only `src/utilities/blueprint-source-root.ts`, `src/cli.ts`, `tests/install.test.ts`, `docs/blueprints.md`, and this appended report. All prior work/history was preserved; the ticket marker and other reports were untouched.
- Final dirty/untracked inventory remains the supplied ticket-05 inventory: modified ticket, docs, catalog, CLI, Init/Update consumers and installation/rendering/stub tests; deleted lifecycle/install modules; untracked installation directory, four utilities, and five reports. No additional paths were introduced.
- Exact tested snapshot: the supplied uncommitted candidate at the above HEAD plus the corrective diff below. Final SHA-256 values:
  - `docs/blueprints.md`: `f7bd127f91d241af29ba47ce4874473481300a678795fd8f89455155cd4dd06f`
  - `src/cli.ts`: `d9809a81f1f594c42b743620a55b5451dbbbda0451162c5bfef7a32b55344e6c`
  - `tests/install.test.ts`: `cd06b96d0ae6fdc00ed4f0ce93f197e653ddb2305d4d0acc06c0aa3a349ea7a3`
  - `src/utilities/blueprint-source-root.ts`: `b2a810f4e5f6a06028dd4e5356bccb9fe5a2d056647d5e48c152fa6329e19e47`
- Every other surviving implementation-file hash still matches `5-review-inputs.md`. No code/test/doc edits followed GREEN; this report is outside the tested code snapshot.

### Fresh focused evidence and self-review

Both commands were implementer-run through Just from `/home/sincore/source/spindle`:

1. RED: `just test::test tests/install.test.ts` — exit 1; 2 passed, 1 failed. The new test failed at `assert.ok(isAbsolute(app.blueprintSourceRoot))`, confirming the intended relative-root defect rather than a setup failure.
2. GREEN: `just test::test tests/install.test.ts` — exit 0; 3 passed, 0 failed. Covers the regression, rendering preservation, and application isolation/repeated operations.

Self-review found no remaining assigned-finding issue. The CLI passes the discovered root explicitly; production does not call `process.cwd()` or re-read the override during reconciliation. The test catches resolving against construction-time nested cwd as well as retaining a relative path, and verifies actual filesystem use after changing cwd. No test doubles were added.

Not run by this worker: formatting, lint, types, build, packaged tests, full/focused ticket-wide regression, or diff check. Those checks remain with the controller on this new snapshot; previously passing controller evidence describes the pre-correction snapshot, not fresh verification of this correction. Pending controller checks are neither worker failures nor ticket acceptance.

### Exact corrective code/test/doc diff

This delta is relative to the supplied uncommitted candidate, not HEAD (which also contains the earlier migration).

```diff
--- a/src/utilities/blueprint-source-root.ts
+++ b/src/utilities/blueprint-source-root.ts
@@
-import { join } from "node:path";
+import { join, resolve } from "node:path";
@@
-export function resolveBlueprintSourceRoot(): string {
-  if (process.env.SPINDLE_BLUEPRINTS_DIR) return process.env.SPINDLE_BLUEPRINTS_DIR;
+export function resolveBlueprintSourceRoot(workspaceRoot: string): string {
+  if (process.env.SPINDLE_BLUEPRINTS_DIR) {
+    return resolve(workspaceRoot, process.env.SPINDLE_BLUEPRINTS_DIR);
+  }
--- a/src/cli.ts
+++ b/src/cli.ts
@@
-    blueprintSourceRoot: resolveBlueprintSourceRoot(),
+    blueprintSourceRoot: resolveBlueprintSourceRoot(workspaceRoot),
--- a/docs/blueprints.md
+++ b/docs/blueprints.md
@@
 services use that application's fixed Blueprint source root for every operation.
+Relative overrides are resolved against the discovered Git workspace root, not
+the invocation directory, and remain fixed if the process later changes directory.
 Without an override, source execution uses `src/blueprints/` and packaged
--- a/tests/install.test.ts
+++ b/tests/install.test.ts
@@
-import { dirname, join } from "node:path";
+import { dirname, isAbsolute, join } from "node:path";
@@
 } from "../src/utilities/blueprint-files.ts";
+import { resolveBlueprintSourceRoot } from "../src/utilities/blueprint-source-root.ts";
 import { makeTempDir } from "./helpers.ts";
 
+test("relative Blueprint overrides stay fixed to the App workspace after cwd changes", async () => {
+  const workspace = await makeTempDir("spindle-install-relative-root-");
+  const laterCwd = await makeTempDir("spindle-install-later-cwd-");
+  const originalCwd = process.cwd();
+  const originalOverride = process.env.SPINDLE_BLUEPRINTS_DIR;
+  const expectedSourceRoot = join(workspace, "assets");
+  const config = { stacks: ["typescript"], variables: {} };
+
+  try {
+    await cp(fileURLToPath(new URL("../src/blueprints/", import.meta.url)), expectedSourceRoot, {
+      recursive: true,
+    });
+    await mkdir(join(workspace, "nested"));
+    process.env.SPINDLE_BLUEPRINTS_DIR = "assets";
+    process.chdir(join(workspace, "nested"));
+    const app = new App({
+      workspaceRoot: workspace,
+      blueprintSourceRoot: resolveBlueprintSourceRoot(workspace),
+    });
+
+    assert.ok(isAbsolute(app.blueprintSourceRoot));
+    assert.equal(app.blueprintSourceRoot, expectedSourceRoot);
+    process.chdir(laterCwd);
+    assert.equal(app.blueprintSourceRoot, expectedSourceRoot);
+    const service = await app.get(InstallationService);
+    await service.reconcile(blueprintHandlers, { mode: "init", context: config, config });
+    assert.match(
+      await readFile(
+        join(workspace, ".github", "skills", "int-test-driven-development", "SKILL.md"),
+        "utf8",
+      ),
+      /version: 1\.1\.1/,
+    );
+  } finally {
+    process.chdir(originalCwd);
+    if (originalOverride === undefined) delete process.env.SPINDLE_BLUEPRINTS_DIR;
+    else process.env.SPINDLE_BLUEPRINTS_DIR = originalOverride;
+    await rm(workspace, { recursive: true, force: true });
+    await rm(laterCwd, { recursive: true, force: true });
+  }
+});
+
 test("installation renders recognized UTF-8 text and preserves files that must not be rendered", async () => {
```

**Hand-back:** MINOR-R5-01 corrected with test-first RED/GREEN evidence and documentation. All 3 focused installation tests pass. Ready for controller checks and scoped re-review; no ticket acceptance or integration claim.

## Final acceptance and integration

- Corrective scoped re-review: `/home/sincore/source/spindle/.scratch/2026-11-06-application-owned-services/reports/5-round-1-review.md` marked MINOR-R5-01 ADDRESSED, found no new breakage, and passed Spec and Quality.
- Initial code review found no Critical or Important issues; its single Minor is closed by the corrective round. Initial code-slop review found no material slop. Initial task review passed Spec and Quality.
- Controller checks on the final corrected candidate: format and lint passed across changed docs/source/tests; types passed; focused tests passed 96/96; build passed; packaged CLI tests passed 4/4; full suite passed 199/199; `just tool::git diff --check` passed.
- All eleven ticket criteria are complete. Ticket 05 is accepted and marked `Execution: integrated`. Controller integration is proceeding.
