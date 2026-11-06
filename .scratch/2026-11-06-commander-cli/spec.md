# Commander CLI and command-owned options

Reporter: unknown
Category: enhancement
Status: ready-for-agent

## Problem Statement

Spindle's command-line parsing, handwritten help, and command dispatch are
concentrated in the central CLI. A maintainer changing a command must also
update separate option and help definitions, making it harder to keep the
interface and the command's behavior aligned. Users need consistent,
discoverable command help and clear argument errors without disrupting existing
Blueprint and workflow operations.

## Solution

Use Commander for command registration, argument parsing, generated help, and
CLI argument errors. Each executable command class owns its command declaration
and chooses its supported options, while the central CLI composes the command
tree and shared startup. Preserve existing workflows and valid invocations,
with the agreed changes to help, errors, and startup ordering.

## User Stories

1. As a Spindle user, I want root help to list the available commands, so that I can discover the CLI.
2. As a Spindle user, I want command-specific help generated from the registered options, so that help reflects the actual interface.
3. As a Spindle user, I want help for the SDD group and its workspace command, so that I can discover nested workflows.
4. As a Spindle user, I want Commander's built-in help conveniences, including `-h` and the help command, so that I can use familiar CLI conventions.
5. As a Spindle user, I want help and version available outside a Git working tree, so that I can inspect the CLI before entering a project.
6. As a Spindle user, I want argument errors reported before Git discovery, so that an invalid invocation explains its actual CLI problem.
7. As a Spindle user, I want valid workspace commands to require a Git working-tree root, so that operations use the intended project.
8. As a Spindle user, I want `init` to retain its Stack and Variable options, so that I can configure Blueprints as before.
9. As a Spindle user, I want to repeat Stack and Variable options, so that I can supply multiple values.
10. As a Spindle user, I want `update` to use the existing Config, so that I can maintain installed Blueprints.
11. As a Spindle user, I want `update --include-new` to retain its existing meaning, so that I can install newly available Blueprints without a selection prompt.
12. As a Spindle user, I want conflict policy and interactivity options to keep their meanings, so that existing automation and prompt behavior remain reliable.
13. As a Spindle user, I want inapplicable options rejected, so that an option intended for another command is not silently ignored.
14. As a Spindle user, I want invalid conflict policies rejected, so that reconciliation does not proceed with an unintended policy.
15. As an SDD controller, I want workspace report-path options to remain available, so that existing report workflows continue to work.
16. As an SDD controller, I want required options, value validation, and duplicate-option rejection preserved, so that report destinations remain unambiguous.
17. As a project owner, I want setup-project to retain its workspace option and existing behavior, so that I can bootstrap project defaults.
18. As an automation author, I want workflow JSON results unchanged, so that existing consumers continue to parse them.
19. As an automation author, I want unknown commands, unknown options, missing values, and unexpected positional arguments rejected, so that mistakes do not look like successful runs.
20. As an automation author, I want Commander's built-in CLI errors and exit codes, so that argument failures follow familiar conventions.
21. As an existing user, I want non-help command output and Chalk styling preserved, so that this migration does not change unrelated feedback.
22. As a package user, I want the installed executable to support the same command tree, so that behavior does not depend on running from source.
23. As a maintainer, I want each executable command class to declare its own command and options, so that its CLI interface is maintained with its implementation.
24. As a maintainer, I want shared options defined once and explicitly selected by each command, so that common behavior stays consistent.
25. As a programmatic caller, I want existing command `run` interfaces to remain independent of Commander, so that I can invoke services without constructing a CLI.
26. As a maintainer, I want existing application-owned service lifecycle and workspace-root rules retained, so that commands continue to share the established application structure.

## Implementation Decisions

- Replace the existing argument parser and handwritten help with the existing
  Commander runtime dependency. The central CLI registers the root command,
  grouping commands, executable command declarations, version, and shared
  startup; it does not duplicate executable commands' option definitions.
- Each executable command class owns its Commander declaration, including its
  name, description, accepted options, and action wiring. A static registration
  method is the agreed approach. Keep the SDD grouping route centrally composed
  without inventing a service merely for the group.
- Keep command `run` methods independent of Commander and preserve their
  existing programmatic signatures and defaults. Resolve command services
  through the application rather than constructing them outside its lifecycle.
- Define reusable shared option builders once, and have each command explicitly
  select applicable options. Preserve command-specific descriptions or
  constraints where necessary.
- Preserve the existing command tree and supported options: `init` with
  repeatable `--stack` and `--var`, `--on-conflict`, and `--no-interactive`;
  `update` with `--on-conflict`, `--no-interactive`, and `--include-new`;
  `sdd workspace` with required `--workspace`, `--reports-dir`, and `--ticket`
  plus optional `--round`; and `setup-project` with required `--workspace`.
- Preserve existing validation and acceptance of command inputs, including
  required values, option applicability, duplicate-option rejection for SDD
  workspace and setup-project, and rejection of unexpected positionals.
  Preserve repeated init Stack and Variable values. Continue to enforce
  workflow-specific validation rather than assuming parsing alone is enough.
- Use Commander's generated root and command-specific help. Root help lists
  commands instead of showing init help. Accept Commander's built-in help
  conveniences, including `-h` and its help command, as deliberate additions to
  previously accepted inputs. Commander may handle help combinations differently
  from the old parser.
- Use Commander's built-in argument error messages and exit codes, even when
  wording or status differs from the old CLI. Workflow failures remain explicit;
  do not convert them into successful output. Preserve non-help output and
  existing Chalk styling.
- Parse and validate CLI arguments before attempting Git-root discovery.
  Informational requests and CLI argument errors must not require Git.
  Discover the Git working-tree root before executing a valid workspace
  command, without a current-directory fallback. Keep the explicit workspace
  targets of SDD and setup-project distinct from the invocation Git root.
- Preserve existing interactivity detection, conflict handling, Config and
  Blueprint behavior, result shapes, JSON serialization, and command side
  effects. Update directly related CLI documentation and examples where the
  agreed help, error, or startup changes make them inaccurate.

## Testing Decisions

- Prefer externally observable behavior over assertions about registration
  internals, static methods, or Commander implementation details.
- Use the existing source CLI subprocess helpers as the primary seam to cover
  root and nested help, version, built-in help conveniences, accepted options,
  repeated values, invalid arguments, option applicability, and error exit
  behavior.
- Exercise help, version, and malformed invocations outside Git, and verify
  that valid workspace commands still fail explicitly there. Cover nested
  working-tree invocation and explicit workspace targets using existing
  workflow fixtures.
- Preserve and extend existing init, update, SDD workspace, and setup-project
  behavior tests, including non-interactive and interactive behavior where
  applicable, JSON results, and errors. Retain direct command tests as coverage
  of the existing programmatic service interfaces.
- Use the existing packaged CLI subprocess tests to verify the built executable's
  help, parsing, and representative workflow behavior outside the checkout.
  Assert important behavior and error information without coupling tests to
  incidental Commander formatting beyond the agreed interface.

## Out of Scope

- Redesigning Blueprint reconciliation, Config, Stack or Variable semantics.
- Changing workflow outputs, replacing application-owned services, or removing
  Chalk from non-help output.
- Adding new executable workflows or a general command framework.
- Implementing the migration as part of this specification.

## Further Notes

- The existing application-owned services decision requires Git-root discovery
  for workspace operations and keeps help and version available without it;
  parsing first preserves those requirements while also allowing argument
  errors outside Git.
- The compatibility exceptions are Commander-generated help, built-in help
  conveniences, Commander CLI error wording and exit codes, and the agreed
  parsing-before-Git startup order.
