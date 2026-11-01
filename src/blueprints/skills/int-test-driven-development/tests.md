# Writing Good Tests

A useful test catches a plausible bug in behavior that matters. It should describe a contract clearly enough that someone can understand what would break if it failed.

## Name the behavior the test protects

Before writing a test, ask: **What realistic production change should make this test fail?**

Good candidates include a wrong branch, missing validation, incorrect result, or missing side effect. Test behavior callers rely on—not a particular implementation choice.

Prefer a test name that describes the behavior:

```typescript
test("rejects an expired invitation", () => {
  // ...
});
```

Avoid names that merely describe the code under test:

```typescript
test("calls validateInvitation", () => {
  // ...
});
```

## Choose an appropriate boundary

Test through the interface that best demonstrates the contract:

- Use a unit test for focused logic with a clear input and output.
- Use an integration test when behavior depends on collaborating components, persistence, or framework wiring.
- Use an end-to-end test when the user-visible flow itself needs verification.

Prefer public interfaces over private methods or implementation details. A database assertion can be appropriate when persistence is part of the behavior being tested; avoid querying storage merely to inspect internal details unrelated to the contract.

Test behavior owned by this application, not framework mechanics that the framework itself guarantees. If an upstream behavior is surprising and important to rely on, a narrow characterization test can document that assumption.

## Keep expectations independent

Expected values should come from the requirement, a known result, or a hand-checked fixture—not from the code under test or the same logic it uses.

```typescript
// Good: the expected value is independently known
expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
```

Avoid calculating the expected result with the same algorithm as the implementation. That can let the same mistake appear on both sides of the assertion.

## Keep each test focused

A test should explain one behavior. It may need several assertions to describe that behavior fully; split it when the assertions cover distinct outcomes or unrelated responsibilities.

Use small, meaningful fixtures. Include the fields and relationships the real contract requires, and choose values that make incorrect behavior visible.

Cover important alternate paths and boundaries, such as invalid, empty, unauthorized, or missing input when those cases matter to the contract. Do not add a test for every function or line just to mirror the implementation.

## Check that the test can catch a bug

Before finishing, consider a plausible incorrect change: a missing validation, wrong return value, omitted state change, or incorrect branch. Would this test fail?

If not, strengthen the test around the behavior that matters. Avoid tests that only prove a constant, mock, private structure, or source text has a particular shape.
