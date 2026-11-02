# CLI workflow domains

Reporter: unknown
Category: enhancement
Status: ready-for-agent

## Problem Statement

SDD report-path resolution and project bootstrapping currently require
repository-local CJS scripts and Just modules. Users of the published Spindle
CLI cannot reliably access these capabilities directly, and Skill instructions
depend on helper files that are separate from the CLI implementation.

## Solution

Expose the existing capabilities as native Spindle commands:
`spindle sdd workspace` for read-only report-path resolution and
`spindle setup-project` for non-destructive bootstrap setup. Organize their
implementations into separate TypeScript feature folders, remove the old
script/Just entry points, and update active guidance to invoke Spindle directly.
Retain Just as a global CLI prerequisite.

## User Stories

1. As a Spindle user, I want SDD helpers available through the installed CLI, so that I do not need repository-local helper scripts.
2. As an SDD controller, I want `spindle sdd workspace` to resolve report destinations, so that assigned agents receive consistent durable paths.
3. As an SDD controller, I want an absolute checkout-root requirement, so that report resolution cannot accidentally target a nested directory.
4. As an SDD controller, I want Git checkout and HEAD validation, so that report paths refer to a valid checkout.
5. As an SDD controller, I want report destinations constrained to the checkout's scratch area, so that traversal and escaping links are rejected.
6. As an SDD controller, I want ignored report destinations rejected, so that delivery evidence is not silently excluded from version control.
7. As an SDD controller, I want existing non-regular report targets rejected, so that assigned destinations are suitable for report files.
8. As an SDD controller, I want ticket and corrective-round identifiers validated, so that report filenames remain predictable.
9. As an SDD controller, I want optional round-specific report paths, so that corrective reviews can be recorded separately.
10. As an SDD controller, I want the existing report JSON contract preserved, so that consumers do not need an unrelated output migration.
11. As a repository owner, I want report resolution to leave files and checkout state unchanged, so that inspecting paths has no side effects.
12. As a project owner, I want `spindle setup-project` to bootstrap an existing absolute project directory, so that I can establish the expected documentation layout.
13. As a project owner, I want setup to work without Git or prior Spindle initialization, so that bootstrapping is independently usable.
14. As a project owner, I want the same required directories and four default documents created, so that established engineering conventions remain available.
15. As a project owner, I want existing regular files preserved byte-for-byte, so that setup does not overwrite project customization.
16. As a project owner, I want repeated setup runs to be safe and report preserved items, so that I can rerun after resolving a conflict.
17. As a project owner, I want symlink destinations and file/directory conflicts rejected explicitly, so that setup does not write through unexpected targets.
18. As an automation author, I want setup's existing JSON keys and result ordering preserved, so that migration changes only the invocation.
19. As a package user, I want bootstrap defaults bundled with the setup capability, so that setup works outside the Spindle source checkout.
20. As a Skill user, I want instructions and examples to call the new commands, so that following shipped guidance does not require removed helpers.
21. As an existing Spindle user, I want changed Skill guidance delivered through normal Blueprint updates, so that I can adopt the new entry points.
22. As a CLI user, I want command-specific and top-level help, so that I can discover commands and their supported options.
23. As an automation author, I want invalid arguments and execution failures to produce explicit nonzero errors, so that failures cannot look like successful JSON results.
24. As a Spindle user, I want the Just prerequisite retained for commands and help, so that installation requirements remain consistent.
25. As an existing Spindle user, I want `init` and `update` behavior preserved, so that adding workflow commands does not disrupt Blueprint management.
26. As a maintainer, I want separate typed feature modules without CJS subprocess wrappers, so that capabilities fit the existing TypeScript application.
27. As a maintainer, I want obsolete scripts, wrappers, and duplicate assets removed, so that there is one supported implementation and template source.

## Implementation Decisions

- Implement separate native TypeScript source folders named
  `subagent-driven-dev` and `setup-project`, alongside the existing Blueprints
  feature. “Domain” means a feature-owned folder, not a new bounded context;
  retain the root glossary and ADR organization.
- Expose SDD as `spindle sdd workspace`, requiring `--workspace`,
  `--reports-dir`, and `--ticket`, with optional `--round`. Expose setup as
  `spindle setup-project`, requiring `--workspace`.
- Provide top-level command discovery and help for `sdd`, `sdd workspace`, and
  `setup-project`. Reject missing, unknown, duplicate, inapplicable arguments,
  and invalid command nesting explicitly.
- Keep the existing global executable Just check before command dispatch,
  including help. Neither new command requires prior `init` or a project Config.
- Keep CLI responsibilities limited to argument parsing, dispatch, help,
  successful JSON serialization, and existing `spindle:` error reporting with a
  nonzero exit code. Domain functions accept typed explicit inputs and return
  typed results; they do not parse process arguments, print, or exit.
- Keep Git and report-path helper logic within the SDD feature. Do not introduce
  a general workflow framework or duplicate command parsers.
- Preserve the resolver's absolute checkout-root and valid-HEAD requirements,
  report-directory containment rules, traversal and escaping-link rejection,
  ignored-directory/destination checks, existing-file validation, and positive
  ticket/round identifier rules.
- Preserve the resolver's exact result structure: `workspace`,
  `reportsDirectory`, and `reports`. Each report contains `relative` and
  `absolute`. Retain `implementation`, `codeReview`, `taskReview`, `finalReview`,
  and `finalFixReview`, adding `scopedReview` only when a round is supplied.
  Preserve existing filename conventions and result ordering.
- Report resolution must not create directories, modify files, write reports,
  or alter checkout state.
- Preserve bootstrap directory creation and the four existing defaults for
  domain documentation, local issue tracking, triage labels, and project tooling.
  Require an existing absolute project directory; no Git repository is required.
- Preserve bootstrap's `workspace`, `created`, and `preserved` result keys and
  ordering, existing-file preservation, repeat-run behavior, and rejection of
  symlink destinations and file/directory conflicts.
- Bootstrap failures remain explicit; partial setup may remain. Do not add a
  transactional rollback guarantee. Do not create glossary content, edit
  Copilot instructions, or claim interactive configuration is complete.
- The setup feature owns its four default templates as the single canonical
  source. Resolve assets relative to its module rather than through Blueprint
  discovery or the target project's installed Skills.
- Extend the existing build's asset copying so the setup templates ship beside
  the compiled feature and work in source execution and the published package.
- Remove the old CJS implementations, their Just modules and root imports, and
  superseded CJS test files after porting their coverage. Remove the old shared
  CJS utility once no callers remain. Provide no compatibility wrappers.
- Relocate useful helper documentation and update active shipped Skill
  guidance, examples, installed local Skill copies, tracker guidance, and
  templates to call Spindle directly.
- Remove the four duplicated templates from the setup Skill Blueprint and its
  local installed copy. Reconcile all affected links and guidance without
  requiring users to browse package-internal sources.
- Bump changed Blueprint versions using the existing lifecycle so normal
  updates deliver revised instructions.
- Document direct Spindle invocation as the workflow-helper exception to
  project-command Just guidance. Retain Just for project build, test, lint, and
  other tooling; leave unrelated Just modules intact.
- Preserve historical feature designs, tickets, and reports unchanged.
- Preserve existing `init` and `update` behavior; keep the smallest necessary
  command-dispatch refactor without adopting a new CLI framework or dependency.

## Testing Decisions

- The user confirmed the public CLI as the primary and highest testing seam,
  plus packaged-CLI smoke coverage outside the checkout.
- Follow existing subprocess CLI tests and their disposable-project fixtures,
  Just stubs, controlled executable search paths, and observable-output
  assertions. Adapt the existing helper tests' disposable Git repositories.
- Test external behavior: JSON contracts, stdout/stderr, exit status, files
  created or preserved, and Git checkout state. Do not assert internal helper
  structure or require extra function-level seams.
- Port all existing CJS resolver/bootstrap cases into the standard TypeScript
  suite without weakening assertions. Change expectations only for the chosen
  invocation, help text, and unified error prefix.
- Cover SDD with and without a round, exact report keys and filenames, valid
  existing reports, no directory creation, unchanged report contents, and
  unchanged checkout state.
- Cover invalid checkout roots, missing/invalid HEAD, invalid report paths,
  traversal, escaping links, ignored destinations, non-regular report targets,
  and invalid identifiers.
- Cover setup's exact default contents and result ordering, custom-file
  preservation, repeat runs, symlinks including dangling destinations,
  file/directory conflicts, missing projects, and invalid workspace inputs.
- Cover new-command routing, all help entry points, and missing, unknown,
  duplicate, inapplicable options and invalid command nesting. Failure cases
  must not emit success-shaped JSON.
- Verify both commands run without a project Config or prior `init`; verify
  setup also runs in a non-Git project.
- Extend prerequisite coverage to both commands and help: without Just, fail
  with the existing installation guidance before side effects.
- Run the built, packaged CLI against disposable target projects from an
  unrelated working directory without access to checkout-local scripts or
  templates. Verify bundled defaults and both command results.
- Check active guidance no longer points at removed helpers, template
  references remain usable, and changed Blueprints carry updated versions.
- Use applicable existing Just recipes for formatting, lint, type/build, and
  regression checks. Retain existing `init`/`update` regression coverage.

## Out of Scope

- New SDD report kinds, report naming changes, or orchestration capabilities.
- Expanding bootstrap into the interactive setup/configuration workflow.
- New bounded contexts, per-context glossaries, or a glossary map.
- Removing or relaxing the global Just prerequisite.
- Backward-compatible script paths, Just aliases, or fallback entry points.
- New CLI frameworks, dependencies, generic registries, or workflow engines.
- Rewriting historical delivery evidence or modifying unrelated project tools.
- Implementation, ticket generation, and delivery orchestration as part of
  authoring this specification.

## Further Notes

- Source: the approved [design](./design.md), including the design-review
  decisions about source folders, command naming, Just, and template ownership.
- The user confirmed the proposed CLI testing seam before this spec was written.
- No consequential requirements remain unresolved. Internal filenames, local
  helper placement, and parsing mechanics remain implementation choices within
  these constraints.
- This specification is published in the feature's original dated directory;
  the approved source design is preserved.
