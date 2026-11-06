# 01: Application construction and boot lifecycle

Reporter: unknown
Category: enhancement

**What to build:** An application that owns immutable workspace and Blueprint source roots and safely constructs application-local services, giving callers fully initialized singleton or fresh instances through one public API.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent
**Execution:** integrated

Corrective round 1 persisted before dispatch (1 of 5). Controller check finding F-01: `just test::test` fails 7 production-Blueprint installation cases because `tests/stubs.test.ts` forbids all Markdown links to `SKILL.md`, including valid relative links to the installed skill's own documentation. The same test already verifies relative link targets exist. User authorized correcting this pre-existing regression.

Corrective round 2 persisted before dispatch (2 of 5). Findings F-02 (`1-code-review.md`) and T01-R-01 (`1-task-review.md`) are reconciled as the same defect: `App.get()` checks the constructor-only resolution chain before the initialized singleton cache, falsely rejecting a fresh instance's valid request for an already-booted singleton of the same type. Controller ruling: perform the successful singleton cache lookup first, then retain ancestry/dependency-graph cycle checks for unresolved/in-flight instances. Add a public API regression case and preserve the existing actual-cycle and concurrent-sharing tests.

- [X] Introduce an import-safe application class and a shared service base class whose constructor accepts and stores the owning application; services do not inherit from the application.
- [X] Application roots are immutable and can be supplied explicitly without consulting the working directory. Separate applications own separate roots and service state.
- [X] The base class supplies an empty asynchronous boot hook returning a promise of void. Constructors do not resolve dependencies, initiate asynchronous work, or run workflows.
- [X] Application-managed boot runs only after derived construction and field initialization finish; dependencies can be awaited during boot.
- [X] Expose read-only boot readiness, managed by the application and set only after successful boot. Successfully initialized instances are not rebooted on retrieval.
- [X] Singleton retrieval always returns a promise and shares instance identity and in-flight initialization within one application, without exposing incomplete instances.
- [X] Fresh-instance creation always returns a promise and constructs and boots a distinct instance without registering it as a singleton.
- [X] Boot failures propagate explicitly and never leave a failed instance available as a usable singleton.
- [X] Circular dependencies through singleton or fresh-instance resolution reject with the dependency chain rather than hanging, recursing indefinitely, or returning partial instances.
- [X] Concurrent non-cyclic retrieval, including shared dependencies, is not mistaken for a cycle.
- [X] Public application API tests cover identity, readiness, derived-field availability, delayed asynchronous initialization, failure, cycles, and isolation without asserting private container structures.
- [X] Validate focused application tests and type checking through existing Just recipes; retain existing command behavior while introducing the construction foundation.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
