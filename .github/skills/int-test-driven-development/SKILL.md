---
name: int-test-driven-development
description: "This is an internal skill do not load it unless explicitly required by the user or another skill."
user-invocable: false
metadata:
  spindle:
    version: 1.1.0
---

# Test-Driven Development

Reference for TDD sequencing and test quality. Implementers apply the relevant procedure within their assigned workflow; reviewers assess tests and supplied evidence without implementing or starting a TDD cycle. The caller owns task sequencing, permissions, check scheduling, and delivery.

Read the relevant glossary and ADRs so test vocabulary and boundaries match the domain.

## Behavior and seam

A test observes behavior through the module's interface at a **seam**. Reuse confirmed seams recorded in the assignment when unchanged. For missing or changed seams, propose the interface and what it catches and misses; obtain confirmation before writing tests there. Dispatched workers request clarification or approval through the controller; otherwise ask the user.

Testing is ready when the expected behavior is clear and the seam has applicable confirmation. Work stays within the assigned scope.

## Behavior changes and bug fixes

1. **Write one focused test** for one behavior at the agreed seam.
2. **Verify RED.** Run it and confirm an intended behavioral failure. Repair setup errors before evaluating RED. If it passes, investigate existing behavior or an insensitive test; never delete working code to manufacture failure.
3. **Implement minimally.** Change only what satisfies that behavior.
4. **Verify GREEN.** Rerun the focused test; correct failures before the next slice.

Work in vertical slices: reach GREEN for one behavior before writing the next behavior's test. Each requested behavior needs coverage, with relevant tests passing on the final implementation.

## Pure refactors

Start from passing relevant tests, make the structural change, then rerun those same tests. No RED phase is required. Reuse adequate coverage; if it cannot protect the affected behavior, add passing characterization coverage within the assigned scope before refactoring. Preserve behavioral assertions; fix regressions rather than weakening them. Observable behavior changes take the RED → GREEN path.

Keep small necessary local refactors after GREEN; substantial cleanup requires a review finding or explicit refactoring ticket.

Relevant tests must pass again and the diff must preserve tested behavior.

## Test quality

- Assert public behavior, not private methods or internal collaborator calls.
- Derive expected values independently from the spec, a known-good literal, or a worked example, not the production algorithm.
- Keep tests meaningful through behavior-preserving structural changes.

When adding or changing tests, or reviewing their quality, read [Writing good tests](./references/tests.md). When choosing or assessing test doubles, read [Mocking and test doubles](./references/mocking.md).

## Review and test evidence

Assess behavioral coverage and available RED/GREEN evidence within the review assignment. A concise test summary and fresh GREEN results suffice; missing archived RED logs alone do not block approval. Current GREEN establishes present behavior, not historical test order. Disclose a skipped test-first step honestly; preserve working code rather than manufacturing historical RED.

Use `int-verification-before-completion` for evidence attribution, scope, freshness, and completion claims. The caller defines required checks and their authorized owner; this reference does not schedule checks or grant permission to run them.
