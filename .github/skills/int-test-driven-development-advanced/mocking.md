# Mocking and Test Doubles

A test double replaces a real dependency to isolate behavior or control an external effect. Use one when it makes a test more reliable or focused—not merely because the dependency is present.

## Prefer real application components when practical

Use real code for the behavior under test and its ordinary collaborators when that keeps the test fast and reliable. Prefer a test database over mocking database queries when testing persistence.

Use a mock, fake, or stub when a dependency is external, slow, nondeterministic, expensive, or needs to produce a controlled failure. Examples include an external API, email provider, clock, or random-number source.

## Double the boundary, not the behavior under test

Keep the component being tested real. Replace only the dependency that needs isolation, and preserve any real side effects the test relies on.

Before replacing a dependency, understand what the real operation does. A mock that skips a required write, state change, or callback can make a test pass while the application behavior is broken.

When testing an interaction with an external system, assert the interaction if it is part of the contract—for example, that the application sends the expected amount to a payment provider. Do not assert calls, counts, or ordering merely because the test can observe them.

## Keep test doubles realistic

Give doubles behavior and data that match the dependency's documented contract. Include the fields downstream code relies on, and use separate setups for meaningfully different outcomes such as success, failure, or malformed data.

Avoid generic doubles that accept any input or return a success-shaped default. They can hide incorrect arguments and unhandled error cases.

## Prefer simpler tests over elaborate mocks

If a test needs many mocks, conditional mock behavior, or complicated setup, consider whether an integration test with real components would be clearer and more reliable.

Use dependency injection or a small adapter when it naturally isolates an external boundary. Do not complicate production design solely to make internal collaborators easier to mock.

Test-only setup and cleanup belong in test helpers. Keep production classes responsible for production behavior and lifecycle.
