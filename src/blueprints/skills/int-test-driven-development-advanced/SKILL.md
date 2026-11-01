---
name: int-test-driven-development-advanced
version: 1.0.0
description: "This is an internal skill do not load it unless explicitly required by the user or another skill."
user-invocable: false
---

# Test-Driven Development

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.

When exploring the codebase, read `GLOSSARY.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Before writing any test, write down the seams under test and confirm them with the user. No test is written at an unconfirmed seam. You can't test everything, so agreeing the seams up front is how testing effort lands on the critical paths and complex logic instead of every edge case.

Ask: "What's the public interface, and which seams should we test?" Give each proposed seam a one-line note on what it catches and what it misses.

When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), call the Skill tool with "codebase-design" for the vocabulary. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## TDD loop

For each behavior change or bug fix, work in small red → green cycles. Refactoring is separate from this loop.

1. **Choose a behavior and test boundary.** Identify the behavior to change and the public interface or other appropriate boundary for observing it. If the expected behavior or boundary is genuinely unclear, clarify it before writing the test; otherwise, choose a reasonable boundary and proceed.
2. **RED: write one focused test.** Describe the expected behavior, not the implementation. If the production code already exists, don't delete it just to simulate test-first; write or adjust a test that demonstrates the required behavior or reproduces the regression.
3. **Verify RED.** Run the focused test. Confirm it fails for the intended reason—not because of a typo, broken setup, or unrelated failure. If it passes, check whether the behavior already exists or the test fails to distinguish the expected behavior.
4. **GREEN: make the smallest change.** Change only what is needed to satisfy the test. Avoid speculative behavior and unrelated cleanup.
5. **Verify GREEN.** Rerun the focused test and confirm it passes. Run the narrowest additional checks appropriate to the change, and report relevant failures.
6. **Repeat for the next behavior.** Start another focused red → green cycle only for the next behavior change or bug fix, not for a change to internal structure.

## Refactoring outside the loop

Refactoring preserves observable behavior. After GREEN, or for a standalone refactor with passing tests, make the structural improvement and rerun the same relevant tests. A pure refactor requires neither new tests nor a fresh RED phase; keep existing behavioral assertions unchanged.

**Complete when:** the relevant tests pass again and the diff preserves the tested behavior. If the refactor breaks an existing test, correct the regression rather than weakening the assertion. If the intended behavior changes, treat that change as its own red → green slice instead of calling it a refactor.

See [tests.md](tests.md) for test examples and [mocking.md](mocking.md) for mocking guidance.
