# Project Tooling

Run project build, test, lint, and formatting commands through Just. Recipes select the project directory and forward their arguments. Spindle workflow commands are invoked directly through the `spindle` CLI, not through Just modules.

## Build

- No build recipe is defined in this checkout. The listed `tool::pnpm` recipe targets the absent `packages/orchestration` directory, so it is not usable here.

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

- `spindle init` and `spindle update` — Install or update project Blueprints.
- `spindle sdd workspace --workspace <checkout> --reports-dir <reports-dir> --ticket <NN>` — Resolve durable report destinations.
- `spindle setup-project --workspace <absolute-project-root>` — Bootstrap missing project documentation defaults.
