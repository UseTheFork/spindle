# CLI workflow domains

Status: Approved; shared understanding confirmed

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
- Retain the global Just prerequisite for all commands, including the new
  workflow commands and help, even though these helpers do not invoke Just.
- The setup-project source domain owns the four bootstrap templates; move them
  out of the Skill Blueprint and update its guidance accordingly.
- "Domain" means a feature-owned subfolder under `src`, like `src/blueprints`;
  it does not introduce bounded contexts, per-context glossaries, or a glossary
  map. Keep the existing root glossary and ADR layout.

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

Move the four bootstrap templates into `src/setup-project/templates/` as their
single canonical source. The setup-project domain resolves its own bundled
assets relative to its module, never through the Blueprint registry or the
target project's installed `.github` content.

Extend the existing build to copy these templates into
`build/setup-project/templates/`; the existing published `build` directory then
includes them. Keep development/source execution working as well. Verify both
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
- Remove the four templates from the setup-project Skill Blueprint and its local
  installed copy; reconcile guidance and links to describe CLI-owned defaults
  without relying on access to the package's internal source tree.
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
- Retain the CLI's existing global Just prerequisite, as explicitly confirmed
  during design review.

## Verification

- Port existing resolver/bootstrap cases without weakening their assertions,
  adapting only entry points and the deliberate error-prefix/help changes.
- Add CLI routing/help and invalid-argument tests for both commands.
- Verify exact JSON shapes, optional round behavior, non-mutating resolution,
  bootstrap idempotence, preservation, and rejection cases.
- Verify commands require neither `.github/spindle.json` nor prior `init`.
- Verify the new commands and their help retain the global Just prerequisite.
- Exercise built/package execution from an unrelated working directory.
- Run applicable existing formatting, lint, type/build, and regression checks
  through project Just recipes; confirm `init`/`update` regressions stay green.

## Decisions left to implementation

Exact internal filenames, helper placement within each domain, and the smallest
command-specific parsing refactor are implementation choices. Avoid a general
command registry unless necessary for these four public command paths.

Template ownership and the global Just prerequisite were explicitly confirmed
during design review.

## Design review outcome

- Separate domains are source-code folders, not new bounded contexts.
- Keep `src/subagent-driven-dev/` with the shorter public `sdd` command.
- Keep Just required globally, including help.
- Make `src/setup-project/` own and package its four default templates rather
  than depending on Skill Blueprint assets.
- Preserve the existing helpers' behavior and JSON contracts; only their
  implementation, entry points, asset ownership, and related guidance change.
- No consequential design questions remain open. Internal file organization
  and parsing mechanics remain implementation choices within these constraints.
- The user confirmed the refined design represents the shared understanding.
