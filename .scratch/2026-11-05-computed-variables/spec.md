# Computed Variables for Blueprint rendering

Reporter: unknown
Category: enhancement
Status: ready-for-agent

## Problem Statement

Blueprint authors repeat shared text, including the description that marks an
Internal Skill as intended only for explicit use. They cannot currently name
that text once and let Spindle determine its value from the project's resolved
Config. Existing Variables represent values supplied by users, so using them for
this purpose would incorrectly make generated text a persisted, user-overridable
setting.

Authors need reusable text that is centrally maintained, can depend on Config,
and is printed through the existing Nunjucks rendering workflow.

## Solution

Introduce Computed Variables: named text values produced by developer-defined
classes shipped with Spindle. Each class receives read-only, resolved Config
when instantiated and produces its string through a parameterless render method.
Blueprint authors access the resulting strings through a separate `computed`
namespace in Nunjucks.

The first Computed Variable is `computed.internal_skill_description`. It replaces
the repeated Internal Skill description in shipped Blueprint frontmatter while
preserving the exact generated sentence:

> This is an internal skill do not load it unless explicitly required by the user or another skill.

Computed Variables are evaluated once for a generation run and reused across
Blueprints. Their values are neither stored in Config nor directly overridden
by users.

## User Stories

1. As a Blueprint author, I want to reference reusable text by name, so that I do
   not have to repeat and synchronize the same sentence across Blueprints.
2. As a Blueprint author, I want to print a Computed Variable with standard
   Nunjucks interpolation, so that I can use the existing template language.
3. As a Blueprint author, I want Computed Variables in a distinct namespace, so
   that I can distinguish generated text from user-supplied Variables.
4. As a Blueprint author, I want Computed Variables available in frontmatter, so
   that descriptions can share centrally maintained text.
5. As a Blueprint author, I want Computed Variables available in text bodies and
   supporting text files, so that reuse is not limited to entry-file metadata.
6. As a Blueprint author, I want the same Computed Variables available across
   Skills, Agents, and Instructions, so that the feature follows the shared
   Blueprint rendering workflow.
7. As a Spindle developer, I want a shared abstract provider base, so that every
   Computed Variable follows the same construction and rendering contract.
8. As a Spindle developer, I want resolved Config supplied at construction, so
   that a provider can inspect selected Stacks and resolved Variable values.
9. As a Spindle developer, I want applied Variable defaults included in provider
   inputs, so that providers use the same effective values as templates.
10. As a Spindle developer, I want providers to receive read-only Config, so that
    producing shared text does not alter the project's configuration.
11. As a Spindle developer, I want a parameterless method that returns a string,
    so that each provider owns how its text is produced.
12. As a Spindle developer, I want an explicit name-to-class registry, so that
    public template names are deliberate and independent of class names.
13. As a project user, I want Computed Variables to work during initialization,
    so that newly installed Blueprints contain complete rendered text.
14. As a project user, I want Computed Variables to work during updates, so that
    maintained Blueprints use the same rendering behavior as new installations.
15. As a project user, I want generated values kept out of Config, so that Config
    continues to describe my selected Stacks and user-supplied Variables.
16. As a project user, I want my Config to influence generated text only through
    provider-defined behavior, so that shared descriptions are not mistaken for
    directly editable Variables.
17. As a project user, I want all Blueprints in one run to share the same computed
    strings, so that output does not depend on rendering order or repeated calls.
18. As a project user, I want provider failures to identify the failing Computed
    Variable, so that I can diagnose generation errors.
19. As a Blueprint author, I want unknown Computed Variable references to fail
    clearly, so that misspelled names do not silently produce incomplete content.
20. As a project user, I want preparation failures to leave existing project
    files unchanged, so that a failed generation does not partially update them.
21. As a project user, I want the initial shared Internal Skill description to
    retain its exact wording for every Config, so that adopting this feature does
    not change the guidance delivered to agents.
22. As a project user, I want existing Variables, Stack conditions, and literal
    text to retain their behavior, so that adding Computed Variables does not
    break existing templates.
23. As a packaged CLI user, I want the shipped providers and templates to work
    without a source checkout, so that the feature is available in normal
    installations.

## Implementation Decisions

- Keep the domain distinction: a Variable is user-supplied; a Computed Variable
  is named text derived from Config during generation, without persistence or a
  direct user override.
- Introduce one shared abstract base for Computed Variable providers. Its
  constructor accepts read-only, resolved Config, and its abstract `render()`
  method accepts no arguments and returns a string synchronously.
- Resolved Config means the project's selected Stacks and effective Variables
  after normal validation, defaults, and any existing input-resolution workflow.
  It does not mean machine-wide settings or unrestricted environment access.
- Providers receive no nested collection mutability through their typed Config
  contract. They do not prompt, modify Config, or own input resolution.
- Providers are developer-defined classes compiled and shipped with Spindle.
  Do not load provider code from consuming projects.
- Use an explicit, typed registry mapping public template names to provider
  classes. Do not introduce automatic discovery or derive names from class names.
- Extend the shared render context with a `computed` namespace containing
  resolved strings, not provider instances, methods, or callbacks.
- Preserve the existing `stacks` and `variables` template namespaces. A
  user-supplied Variable with the same leaf name does not override its counterpart
  in `computed`.
- For a generation run, instantiate each registered provider once and call its
  render method once, after Config resolution and before applying installation
  changes. Reuse those strings for all rendering in that run, including
  frontmatter/version inspection and supporting files; do not cache them across
  separate runs.
- Integrate resolution with the shared Blueprint lifecycle and render-context
  preparation rather than recomputing in individual handlers or render calls.
  Preserve existing behavior for operations that do not need template rendering.
- Wire both initialization and update to the same resolution behavior. Available
  version inspection must use the same computed values as the eventual writes.
- Compute values and prepare rendered output before applying Blueprint writes,
  Config writes, deletions, or directory-membership cleanup. Preserve the existing
  preparation-before-application boundary.
- A provider exception stops generation with an error identifying its registry
  name and retaining the underlying failure information. Do not substitute empty
  text or another success-shaped fallback.
- An unknown Computed Variable used as an output value stops generation with an
  error identifying the missing name. Preserve strict undefined-output behavior
  without changing standard Nunjucks conditional, raw-block, or escaping semantics.
- Keep computed values out of persisted Config and out of the user Variable
  definition/prompt mechanism. No Config schema or CLI option is added for
  overriding computed output.
- Register `internal_skill_description` with a provider that returns exactly
  "This is an internal skill do not load it unless explicitly required by the user or another skill."
  for every resolved Config. This initial provider need not read any Config field.
- Replace every matching literal description in shipped Internal Skill Blueprint
  frontmatter with interpolation of `computed.internal_skill_description`. Keep
  the surrounding frontmatter valid after rendering and leave unrelated prose
  unchanged.
- Preserve existing Blueprint selection, version/conflict policy, binary-file
  handling, raw blocks, and autoescaping behavior. Do not force updates of
  otherwise unchanged installed Blueprints merely because a provider is present.
- Ship provider code through the normal CLI build and Blueprint assets through
  the existing asset-bundling path. Update directly related author-facing
  documentation with the namespace, provider contract, lifecycle, and failure
  behavior.

## Testing Decisions

- The user confirmed the existing CLI integration seam as the primary seam.
  Assert observable results: generated file contents, parsed frontmatter, Config
  contents, exit status, identifying diagnostics, and unchanged project state on
  preparation failure. Do not assert private helper calls or internal object
  layouts.
- Follow the existing initialization and update integration tests, which launch
  the real CLI against temporary projects and fixture Blueprint catalogs.
  Exercise both commands and rendering in frontmatter, bodies, and supporting
  text files across the shared Blueprint kinds.
- Check the first provider's exact output, including capitalization, punctuation,
  and lack of an added newline, across representative supported Stack selections
  and Variable values. Verify that shipped matching description templates resolve
  to that sentence and contain no unresolved interpolation in generated output.
- Confirm generated frontmatter remains parseable and existing version metadata
  is preserved.
- Confirm persisted Config contains no generated `computed` values. Include a
  same-leaf-name user Variable scenario to demonstrate namespace isolation without
  adding a new public override mechanism.
- Follow coordinated-preparation tests for unknown-name failures: seed planned
  writes and removals, cause a missing computed output reference, and assert a
  nonzero result, the missing name in diagnostics, and byte-for-byte preservation
  of existing Config and managed files, with no planned creations or removals
  applied.
- Use focused tests of the provider-resolution boundary only where the initial
  constant provider cannot expose the requirement through CLI output. Test
  providers can derive strings from resolved Stacks and Variables, including
  defaults; observation of returned strings demonstrates the input contract.
- At that focused boundary, use a test provider with observable successive
  outputs to verify one evaluation per run and reuse across render operations.
  Verify a fresh run resolves again rather than reusing a prior run's values.
- At the same boundary, exercise a throwing provider and confirm its public name
  and original failure are surfaced before any application step. Prefer existing
  dependency-injection or fixture patterns; do not expose a production CLI plugin
  mechanism solely for tests.
- Preserve renderer regression coverage for user Variables, Stack expressions,
  raw blocks, literal text, undefined outputs, and disabled autoescaping. Existing
  rendering tests are prior art for these assertions.
- Use the existing packaged-CLI integration pattern to confirm the built CLI
  renders a shipped Internal Skill description outside the source checkout.
- Run focused checks covering the affected behavior through the repository's
  Just recipes, plus type checking and the normal build to verify provider
  contracts and bundled assets. No new test framework is needed.

## Out of Scope

- Project-defined providers, plugin loading, runtime code discovery, and arbitrary
  executable configuration.
- Persisting computed output or adding direct overrides through Config or CLI
  flags.
- Machine-wide configuration, environment-driven provider inputs, or exposing the
  filesystem or prompt system as part of the provider contract.
- Asynchronous providers, non-string return values, provider-to-provider
  dependencies, template arguments, and exposing provider methods to Nunjucks.
- Per-template or per-Blueprint evaluation and caching between generation runs.
- Changing the initial Internal Skill description based on Config.
- Replacing unrelated prose, redesigning Variable input resolution, changing
  Blueprint lifecycle/version rules, or broadly rewriting installed project
  customization files.
- Rollback for application-time filesystem failures; the existing preparation
  guarantees and application-failure reporting remain in place.

## Further Notes

- Requirements source: the current conversation, including the user's constructor
  injection correction and confirmation of the proposed test seams. No external
  design file or prototype is the source.
- The Computed Variable term has already been recorded in the root domain
  glossary.
- Current rendering has only Stacks and user Variables. Initialization supplies
  them directly; update resolves effective Variables through the shared
  lifecycle's cached context callback. Extend these existing paths rather than
  creating a parallel generation workflow.
- The existing catalog architecture retains rendering and prepares changes before
  application. This feature must preserve those boundaries regardless of the
  proposed status of the catalog ADR.
- There are no remaining blocking requirements questions. Exact internal module
  names and class names are implementation choices; the public template name,
  constructor-input boundary, and parameterless string-returning contract are
  settled.
