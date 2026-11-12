# Project Tooling

## Spindle

- `spindle init`: Install Spindle Blueprints and initialize project guidance.
- `spindle update`: Update installed Spindle Blueprints.
- `spindle tool <list|add|update|remove>`: Manage documented project tooling commands.

## Build

- `pnpm run build`: Rebuild the Blueprint bundle and compile the CLI.

## Linting

- `pnpm run lint -- <args>`: Check selected files without modifying them.
- `pnpm run lint:fix -- <args>`: Apply lint fixes to selected files.

## Formatting

- `pnpm run fmt -- <args>`: Format selected files.

## Type checking

- `pnpm exec tsc --noEmit`: Type-check production sources without emitting files.
- `pnpm exec tsc --noEmit -p tests/tsconfig.sdd.json`: Type-check the SDD and related tests.
- `pnpm exec tsc --noEmit -p tests/tsconfig.assets-project.json`: Type-check BlueprintManagement, Project, Tooling, Foundation, and related tests.

## Testing

- `pnpm exec vitest run <explicit-files>`: Run selected Vitest tests once.
- `pnpm exec vitest run tests/integration/PackagedCli.test.ts`: Run packaged CLI smoke tests after pnpm run build.
