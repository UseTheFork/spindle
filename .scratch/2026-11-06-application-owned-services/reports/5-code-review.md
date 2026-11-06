# Ticket 05 code review

## Strengths

- The reconciliation workflow is now owned by `InstallationService`, resolved through the application service lifecycle by Init and Update, and uses the App's workspace and Blueprint source roots (`src/installation/installation-service.ts`; `src/commands/init/init-command.ts`; `src/commands/update/update-command.ts`).
- Reconciliation operation data remains local to `performReconciliation`; the singleton retains no per-run Config, computed context, or plans.
- Former installation helpers are separated into focused utilities, with shared installation types in `src/installation/types.ts`. The old `src/install.ts` and `src/blueprints/lifecycle.ts` exports are removed, with no compatibility adapters retained.
- The new installation test exercises separate Apps with separate workspace/source roots and a repeated update through one service, while the existing rendering and installation assertions are retained (`tests/install.test.ts`).
- Directly related docs describe source-root selection and packaged assets (`docs/blueprints.md`).

## Issues

### Critical

None.

### Important

None.

### Minor

- **MINOR-R5-01 — Relative Blueprint source overrides are not fixed to the App's creation-time directory.** **Confidence: High.** `src/utilities/blueprint-source-root.ts:5-6` returns `SPINDLE_BLUEPRINTS_DIR` unchanged. When the override is relative, the App stores a relative root; subsequent filesystem use resolves it against the then-current working directory. If a programmatic caller changes directories after App construction, reconciliation can read a different asset tree or fail to find assets, contrary to the immutable-root requirement. Resolve a relative override to an absolute path when constructing the App, or reject it with a clear validation error. This is a narrow case and is non-blocking.

## Recommendations

Resolve relative `SPINDLE_BLUEPRINTS_DIR` values once at the application boundary, or document and validate that the override must be absolute (see MINOR-R5-01).

## Checks

- **Reviewer-run, read-only snapshot checks:** confirmed HEAD `d7235b417c6bdbb3806dbefd7dd4245414c8347c`; compared SHA-256 values for every supplied modified and added implementation file with the review package; all matched. The tracked changes, deleted modules, and six added source files matched the supplied inventory. The controller-owned issue marker and assigned reports were the only additional workspace entries and are outside the implementation snapshot.
- **Controller-supplied evidence, not run by reviewer:** `just format::check` and `just lint::check` on the changed docs/source/tests passed; `just test::types` passed; the focused affected suite passed with 95 tests; `just build` passed; packaged CLI tests passed (4); the full test suite passed (198); and `just tool::git diff --check` passed. The review package and implementation report identify these checks as covering the final frozen source/test snapshot.
- No tests, lint, formatting, or build commands were run by the reviewer. No checkout files other than this assigned report were changed.

## Declined to judge

None. No considered candidate behavior was set aside as outside the ticket scope.

## Assessment

Reviewed snapshot: uncommitted implementation at base/HEAD `d7235b417c6bdbb3806dbefd7dd4245414c8347c`; all supplied implementation-file hashes matched. Coverage included the complete listed additions, deleted modules, modified consumers/tests/docs, and relevant App and command context. Evidence sources were the canonical spec and ticket, applicable repository guidance, the supplied implementation report and review package, and the matching checkout. No snapshot mismatch was found.

Limitations: controller-run verification was inspected, not independently rerun. The one Minor finding concerns relative Blueprint source overrides when the process working directory changes after application construction.

**Ready to merge? Yes.** There are no Critical or Important findings and no unresolved declined-behavior decisions; MINOR-R5-01 is non-blocking.
