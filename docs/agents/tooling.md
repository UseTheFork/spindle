# Project Tooling

Run project build, test, lint, formatting, and Spindle workflow commands through Just. Recipes select the project directory and forward their arguments.

## Build

- `just build` — Rebuild the Blueprint bundle from current sources and compile the CLI, removing stale bundled files.

## Linting

- `just lint::check *args` — Check files without modifying them.
- `just lint::lint *args` — Apply lint fixes.

## Formatting

- `just format::check *args` — Check formatting without modifying files.
- `just format::format *args` — Format files.

## Type checking

- `just test::types` — Type-check without emitting files.

## Tooling

- `just tool::git *args` — Run Git in the repository root.

## Testing

- `just test::test *args` — Run all TypeScript tests when no paths are supplied; otherwise run the selected Node tests through tsx.
- Focused tests: `just test::test tests/<name>.test.ts`
- `just test::coverage *args` — Run Node tests with coverage.

## Spindle workflows

These recipes run the Spindle CLI from source through `pnpm run spindle` in the repository root. Pass paths as absolute paths.

- `just spindle::init *args` — Install project Blueprints.
- `just spindle::update *args` — Update installed project Blueprints.
- `just spindle::sdd workspace --workspace <checkout> --reports-dir <reports-dir> --ticket <NN>` — Resolve durable report destinations.
- `just spindle::setup-project --workspace <absolute-project-root>` — Bootstrap missing project documentation defaults.
- `just spindle::run *args` — Run any other Spindle CLI command with arbitrary arguments.
- Append `--help` to any recipe to see the command's options, for example `just spindle::sdd workspace --help`.
