# Project Tooling

Run project commands directly with pnpm or Git, not Just. Run all commands
from the repository root. Replace `<args>` with optional command arguments.

## Build

- `pnpm run build` - Rebuild the Blueprint bundle from current sources and compile the CLI, removing stale bundled files.

## Linting

- `pnpm run lint <args>` - Check files without modifying them.
- `pnpm run lint:fix <args>` - Apply lint fixes.

## Formatting

- `pnpm run fmt <args>` - Format files.
- `pnpm run fmt:check <args>` - Check formatting without modifying files.

## Type checking

- `pnpm exec tsc --noEmit` - Type-check production sources without emitting files.

## Tooling

- `git --no-pager <args>` - Run Git without an interactive pager.
- `git --no-pager status --short --branch` - Inspect repository status.
- `git --no-pager diff --no-ext-diff` - Inspect unstaged changes.
- `git --no-pager diff --cached --no-ext-diff` - Inspect staged changes.
- `git ls-files --others --exclude-standard` - List untracked files.

## Testing

- `pnpm exec vitest run <args>` - Run migrated Vitest tests once.
- `pnpm exec vitest run tests/app.test.ts` - Run the migrated application tests.
- `pnpm exec vitest run tests/sdd/*.test.ts` - Run only the migrated SDD workflow tests.
- `pnpm exec vitest <args>` - Run Vitest in watch mode during local development.
- `pnpm exec vitest run --coverage <args>` - Run migrated tests with coverage; requires a compatible Vitest coverage provider.

## Spindle workflows

- `pnpm run spindle <args>` - Run the CLI from source with arbitrary arguments.
- `pnpm run spindle init <args>` - Install project Blueprints.
- `pnpm run spindle update <args>` - Update installed project Blueprints.
- `pnpm run spindle sdd <args>` - Run subagent-driven development workflow commands.
- `pnpm run spindle setup-project <args>` - Bootstrap missing project documentation defaults.

Pass workspace and spec paths as absolute paths. Append `--help` to inspect
command options, for example `pnpm run spindle sdd create --help`.
