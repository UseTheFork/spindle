# Project Tooling

You MUST use the JUST commands over the regular commands.

**JUST automatically picks the correct directory to run these commands from**

## Setup

- `just setup` — Install root and orchestration dependencies (pnpm and Composer).

## Linting

- `just lint::frontend *args`
- `just lint::backend *args`

## Formatting

- `just format::frontend *args`
- `just format::backend *args`

## Type checking

- `just test::types-frontend`
- `just test::types-backend`
- `just test::generate-types` — Generate frontend types with Laravel Wayfinder.

## Tooling

- `just laravel::artisan *args`
- `just tool::git *args`
- `just tool::pnpm *args`
- `just tool::composer *args`

## Testing

- `just test::pest *args`
- `just test::coverage *args`
- Focused tests: `just test::pest --filter=<test-name>`
- Unit tests: `just test::pest --testsuite=Unit`
- Integration tests: `just test::pest --testsuite=Integration`
- E2E tests, when required: `just test::pest --testsuite=E2E`
