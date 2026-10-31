# Ticket 03 corrective round 1 fix package

## Snapshot identity

- Checkout: `/home/sincore/source/spindle`
- Base HEAD: `47738fa9b474524af8d0640d35d970026d3f5a1d`
- Corrective base full tracked diff SHA-256: `058147f247917acfd4b76bdeab0824bc8355ad5a1272b909978140f197924517`
- Corrective base implementation-only diff SHA-256: `79341ce7a9864334ee2ace4b80df722cbf217550d19ec31bf2c0b4480aeb6d75`
- Fixed full tracked diff SHA-256 at re-review follow-up: `6c9e3f73603b99ac46ac145248684d54c1f5efe6a96d37a29fbdd04ec72996ab`
- Fixed implementation-only diff SHA-256: `d8d3644d0d255feac11ec4eb722b96c7b61b2445adeb0dd5597dcce7f2b229bc`
- HEAD and branch are unchanged; the corrective change is limited to `src/reconcile.ts` and `src/update.ts`.
- Preserved test helper `tests/fail-config-write.mjs` SHA-256: `767c48963d72642ed14e0a56945b5dfa2ae684999f4f5316042f81ba472ceb5e`.

The base tracked-diff fingerprint in the initial assignment (`7cc0ddc...`) predates the controller's ticket execution/comment update. The controller verified the actual corrective base as `058147f...`; the implementation/test snapshot is the same reviewed snapshot.

## Complete fix-only diff

```diff
diff --git a/src/reconcile.ts b/src/reconcile.ts
--- a/src/reconcile.ts
+++ b/src/reconcile.ts
@@ interface ReconcileCommon
   context?: RenderContext;
   resolveContext?: () => Promise<RenderContext>;
-  afterInstall?: () => Promise<void>;
   conflictPolicy?: ConflictPolicy;
   chooseNew?: (skills: string[]) => Promise<string[]>;
   chooseConflict?: (
@@ after the init Config write
       `${JSON.stringify(options.config, null, 2)}\n`,
     );
-  } else if (willInstall) {
-    await options.afterInstall?.();
   }
diff --git a/src/update.ts b/src/update.ts
--- a/src/update.ts
+++ b/src/update.ts
@@ after the deferred context resolver
       const resolved = await resolveVariables(config, stubsRoot(), interactive);
       prompted = resolved.prompted;
       return resolved.context;
     },
-    afterInstall: async () => {
-      if (Object.keys(prompted).length === 0) return;
-      await writeFile(
-        configPath,
-        `${JSON.stringify(
-          {
-            ...config.config,
-            variables: { ...config.variables, ...prompted },
-          },
-          null,
-          2,
-        )}\n`,
-      );
-    },
   });
+  if (Object.keys(prompted).length > 0) {
+    await writeFile(
+      configPath,
+      `${JSON.stringify(
+        {
+          ...config.config,
+          variables: { ...config.variables, ...prompted },
+        },
+        null,
+        2,
+      )}\n`,
+    );
+  }
```

The Config write has identical contents and remains conditional. Moving it after the awaited reconciliation means it runs only after every selected Skill installation succeeds; reconciliation/install errors prevent reaching it. The complete deletion removes the entire formerly empty `else if (willInstall)` branch, not merely its callback statement.

## Finding mapping

- `T03-CS-001`: removed the one-use, update-specific `afterInstall` hook from shared reconciliation; `update` now owns prompted Config persistence after successful reconciliation.

## Fresh verification evidence

- `just format::check src/index.ts src/prompts.ts src/reconcile.ts src/update.ts tests/helpers.ts tests/update.test.ts tests/fail-config-write.mjs` — passed.
- `just lint::check` — passed.
- `just test::types` — passed.
- `just test::test tests/update.test.ts` — 22 passed, 0 failed, 0 skipped after the fix (implementer-reported).
- `just test::test` — 65 passed, 0 failed, 0 skipped after the fix.
- `git diff --check` — passed.

The focused suite was also run before the refactor and passed 22/22, as recorded in `03-implementation.md`.
