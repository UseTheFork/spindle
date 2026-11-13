# Test and verification handoff

The implementer follows repository test guidance and writes or updates tests appropriate to the assigned behavior. SDD does not require test-first sequencing or proof of an initial failure.

The report records relevant commands and results, the tested snapshot, failures, and checks not run. Distinguish evidence run by the implementer from evidence supplied by the controller. Formatting, lint, type checks, and ticket-wide regression checks belong to the controller unless explicitly assigned to the worker.

On resume, use `int-verification-before-completion` to determine whether evidence is current and sufficient. Missing, stale, ambiguous, or failing required evidence remains unresolved; it is not success-shaped completion.
