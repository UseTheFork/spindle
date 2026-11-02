# CLI workflow domains

Status: Awaiting approval

## Intent and success criteria

Make the existing SDD workspace resolver and project bootstrapper first-class
Spindle capabilities, available from the published CLI without repository-local
CJS scripts or Just modules.

Success means both commands work from the built, packaged CLI against a separate
target project, retain their existing behavior and JSON result shapes, and all
active skill/documentation callers use the new commands.

## Confirmed user decisions

- Implement native TypeScript domains, not packaged CJS subprocess wrappers.
- Keep the source domains separate: `src/subagent-driven-dev/` and
  `src/setup-project/`.
- Expose the SDD domain as `sdd`, not `subagent-driven-dev`.
- Remove the old scripts and their Just wrappers; no compatibility entry points.
- Update callers to invoke Spindle directly.

## CLI

```sh
spindle sdd workspace --workspace /absolute/checkout \
  --reports-dir .scratch/YYYY-MM-DD-feature/reports --ticket 03 [--round 2]

spindle setup-project --workspace /absolute/project
```

Provide command-specific help, including `spindle sdd --help`, and update
top-level help to make both commands discoverable. Missing, unknown, duplicate,
or inapplicable arguments must fail explicitly rather than being ignored.

## Considered approaches

1. **Native TypeScript domains (selected).** Typed application functions called
   in-process by the CLI. Requires porting the helpers and tests, but fits the
   existing source/build model and centralizes CLI error handling.
2. **Packaged CJS scripts (not selected).** Smaller initial rewrite, but retains
   separate process startup, argument parsing, and error handling.

## Selected direction

### Domain boundaries

- `src/subagent-driven-dev/` owns workspace validation, Git checkout inspection,
  report destination validation, and typed report-path results.
- `src/setup-project/` owns non-destructive directory/default-document setup and
  typed `workspace`, `created`, and `preserved` results.
- The CLI owns command dispatch, option parsing, JSON serialization, help, and
  the existing `spindle:` error reporting/nonzero exit convention.
- Domain functions accept explicit inputs and return results; they do not parse
  `process.argv`, print output, or terminate the process.
- Port only necessary shared helper behavior. Keep Git/report-specific helpers
  in the SDD domain rather than introducing a generic workflow framework.

### Preserved behavior

**SDD:** Require an absolute Git checkout root with a valid HEAD; validate report
paths inside `.scratch`, reject traversal, escaping symlinks, ignored destinations,
and non-regular existing report targets. Preserve ticket/round validation,
existing report keys and filenames, and optional scoped-review output. Resolve
paths without creating directories, writing reports, or changing the checkout.

**Setup:** Require an existing absolute project directory, not necessarily a Git
repository or an initialized Spindle project. Create the same directories and
four default documentation files, preserving existing regular files. Reject
symlink destinations and file/directory conflicts. Preserve repeat-run behavior,
result ordering, and explicit failures; partial setup may remain after a failure.
Do not create glossary content, edit Copilot instructions, or claim interactive
project configuration is complete.

### Templates and packaging

Recommendation: keep setup templates canonical in the shipped setup-project
Skill Blueprint rather than duplicating them into the new domain. Reuse the
existing Blueprint-root resolution mechanism to read bundled defaults, never
templates from the target project's installed `.github` content.

Use the existing TypeScript build and Blueprint asset packaging. Verify both
commands from the built package outside this checkout, including setup template
availability.

### Migration surfaces

- Remove both old CJS implementations and their Just modules, and remove their
  imports from the root Justfile.
- Port their CJS tests into the normal TypeScript test suite, then remove the
  superseded test files.
- Remove the old shared CJS utility once no callers remain.
- Relocate useful SDD helper documentation before removing its old directory.
- Update shipped Skill Blueprints, examples, setup's issue-tracker template,
  local installed skill copies, and current agent documentation.
- Bump changed Blueprint versions according to the existing lifecycle so
  `spindle update` can deliver changed command instructions.
- Document that Spindle workflow commands are invoked directly; keep Just for
  project build/test/lint commands and leave unrelated modules intact.
- Preserve historical `.scratch` designs, tickets, and reports as historical
  evidence rather than rewriting their command examples.

## Constraints and non-goals

- Preserve existing `init` and `update` behavior.
- No new SDD report kinds, naming changes, or orchestration features.
- No expansion of setup into the interactive configuration steps owned by its
  Skill.
- No new CLI framework, dependency, compatibility shim, or automatic fallback
  to old scripts.
- Assumption: retain the CLI's existing global Just prerequisite; changing that
  installation requirement is outside this migration.

## Verification

- Port existing resolver/bootstrap cases without weakening their assertions,
  adapting only entry points and the deliberate error-prefix/help changes.
- Add CLI routing/help and invalid-argument tests for both commands.
- Verify exact JSON shapes, optional round behavior, non-mutating resolution,
  bootstrap idempotence, preservation, and rejection cases.
- Verify commands require neither `.github/spindle.json` nor prior `init`.
- Exercise built/package execution from an unrelated working directory.
- Run applicable existing formatting, lint, type/build, and regression checks
  through project Just recipes; confirm `init`/`update` regressions stay green.

## Decisions left to implementation

Exact internal filenames, helper placement within each domain, and the smallest
command-specific parsing refactor are implementation choices. Avoid a general
command registry unless necessary for these four public command paths.

The template ownership and unchanged Just prerequisite above are recommendations
and assumptions proposed for approval, not separately confirmed user decisions.
