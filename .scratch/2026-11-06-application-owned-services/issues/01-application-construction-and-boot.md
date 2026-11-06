# 01: Application construction and boot lifecycle

Reporter: unknown
Category: enhancement

**What to build:** An application that owns immutable workspace and Blueprint source roots and safely constructs application-local services, giving callers fully initialized singleton or fresh instances through one public API.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Introduce an import-safe application class and a shared service base class whose constructor accepts and stores the owning application; services do not inherit from the application.
- [ ] Application roots are immutable and can be supplied explicitly without consulting the working directory. Separate applications own separate roots and service state.
- [ ] The base class supplies an empty asynchronous boot hook returning a promise of void. Constructors do not resolve dependencies, initiate asynchronous work, or run workflows.
- [ ] Application-managed boot runs only after derived construction and field initialization finish; dependencies can be awaited during boot.
- [ ] Expose read-only boot readiness, managed by the application and set only after successful boot. Successfully initialized instances are not rebooted on retrieval.
- [ ] Singleton retrieval always returns a promise and shares instance identity and in-flight initialization within one application, without exposing incomplete instances.
- [ ] Fresh-instance creation always returns a promise and constructs and boots a distinct instance without registering it as a singleton.
- [ ] Boot failures propagate explicitly and never leave a failed instance available as a usable singleton.
- [ ] Circular dependencies through singleton or fresh-instance resolution reject with the dependency chain rather than hanging, recursing indefinitely, or returning partial instances.
- [ ] Concurrent non-cyclic retrieval, including shared dependencies, is not mistaken for a cycle.
- [ ] Public application API tests cover identity, readiness, derived-field availability, delayed asynchronous initialization, failure, cycles, and isolation without asserting private container structures.
- [ ] Validate focused application tests and type checking through existing Just recipes; retain existing command behavior while introducing the construction foundation.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
