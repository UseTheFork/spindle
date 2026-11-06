# 04: Per-run computed-context service

Reporter: unknown
Category: enhancement

**What to build:** Computed Variable resolution becomes an application-managed, per-run service while retaining existing provider contracts and fresh Config-derived values for every reconciliation.

**Blocked by:** 01: Application construction and boot lifecycle.

**Status:** ready-for-agent

- [ ] Move computed-variable resolution and context memoization into cohesive classes rather than retaining old resolver exports behind service wrappers.
- [ ] Use application-managed fresh-instance construction for per-run context ownership, keeping mutable Config and computed caches outside application-wide singletons.
- [ ] Retain existing Computed Variable provider classes and their read-only resolved Config rendering contract; do not make those providers inherit the application service base merely for uniformity.
- [ ] Repeated and concurrent context requests within one run share the same resolved context and evaluate each provider once.
- [ ] Separate runs through the same application resolve fresh Config and Computed Variable values; separate applications cannot share caches.
- [ ] Preserve copying/freezing of resolved inputs and existing provider error reporting, including the public computed key and underlying failure.
- [ ] Preserve the distinction between Variables and Computed Variables, generated text, and non-persistence of computed values in Config.
- [ ] Migrate all current resolver consumers and direct-import tests together, including current reconciliation wiring, without compatibility exports. Do not require the later reconciliation-class migration to keep this ticket functional.
- [ ] Extend existing computed workflow tests for application-owned construction and repeated runs; assert observable rendered values, memoization, isolation, and errors rather than private cache details.
- [ ] Validate focused computed and affected rendering/reconciliation tests plus type checking through Just, and update directly related developer documentation.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
