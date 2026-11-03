# Blueprint catalog simplification

Reporter: unknown
Category: enhancement
Status: ready-for-agent

## Problem Statement

Blueprint authors currently have to understand Stack overlays, wrapper
directories, filename transformations, and Just Module contribution composition.
This makes authoring and predicting installed content unnecessarily complicated.
There is no unified catalog that declares applicability and removal, and
installations can retain content that no longer applies or no longer exists in a
selected source directory.

## Solution

Use one explicit YAML Blueprint Catalog with logical keys and source paths.
Select whole files or recursive directories, preserving their filenames and
relative structure. Apply Stack matching only at the catalog-entry level.

Make catalog-selected directories authoritative for membership. Remove content
marked `removed`, content inapplicable to the selected Stacks, and files absent
from an otherwise selected directory. Retain rendering and existing version-aware
updates, with per-file Agent/Instruction decisions and whole-directory Skill
decisions. Eliminate legacy selection and layout mechanisms entirely.

## User Stories

1. As a Blueprint author, I want one catalog for all four content kinds, so that
   I can review applicability and lifecycle status in one place.
2. As a Blueprint author, I want logical keys independent of source filenames,
   so that catalog identity does not require renaming content.
3. As a Blueprint author, I want explicit relative source paths, so that the
   selected content is unambiguous.
4. As a Blueprint author, I want a file path to select exactly one file, so that
   unrelated neighboring files are not installed.
5. As a Blueprint author, I want a directory path to select its entire recursive
   subtree, so that supporting files require no individual registration.
6. As a Blueprint author, I want directory selection without glob syntax, so that
   recursive inclusion has one predictable meaning.
7. As an Agent author, I want to author named Agent files directly, so that I do
   not need synthetic entry files or wrapper directories.
8. As an Instruction author, I want filenames and subdirectories preserved, so
   that my source organization matches the installed organization.
9. As a Skill author, I want my Skill and its supporting content copied together,
   so that the ordinary Skill directory structure remains intact.
10. As a Just Module author, I want standalone named module files, so that I can
    inspect the complete installed recipes without mentally combining overlays.
11. As a Just Module author, I want Stack-specific recipes in separate modules,
    so that applicability is explicit rather than contribution-based.
12. As a project maintainer, I want empty Stack lists to mean all Stacks, so that
    shared content needs no duplicated catalog entries.
13. As a project maintainer, I want any selected Stack match to qualify an entry,
    so that multi-Stack projects receive each applicable Blueprint.
14. As a Blueprint author, I want internal directories named `stacks` treated as
    ordinary content, so that selection never silently changes directory layout.
15. As a project maintainer, I want unlisted source content ignored, so that
    installation is controlled exclusively by the catalog.
16. As a project maintainer, I want only `active` and `removed` lifecycle states,
    so that there are no competing meanings for deprecation and removal.
17. As a Blueprint maintainer, I want removal records to work without source
    files, so that retired content can be deleted from existing installations.
18. As a project maintainer, I want removed entries deleted regardless of
    selected Stacks, so that retirement reliably cleans up every project.
19. As a project maintainer, I want Stack-inapplicable content deleted, so that
    changing my selected Stacks removes obsolete guidance and tooling.
20. As a project maintainer, I want whole-target removal to include local
    modifications and additions without prompts, so that the catalog remains
    authoritative.
21. As a project maintainer, I want explicit removals unaffected by skip and
    new-content options, so that update preferences do not retain retired content.
22. As a project maintainer, I want already-absent removal targets to be harmless,
    so that repeated reconciliation is reliable.
23. As a project maintainer, I want every actual removal reported, so that I can
    understand destructive changes.
24. As a project maintainer, I want destination-only files removed from selected
    directories, so that deleted upstream files do not linger.
25. As a project maintainer, I want directory cleanup to include local additions,
    so that membership reflects the selected source without historical tracking.
26. As a project maintainer, I want cleanup even when a Skill is current or its
    update is skipped, so that membership does not depend on version decisions.
27. As a project maintainer, I want surviving Agent and Instruction files updated
    independently, so that grouping files does not force group-level updates.
28. As a Skill author, I want version bumps to control additions and changes to
    Skill content, so that whole-Skill versioning remains meaningful.
29. As a project maintainer, I want a new supporting file withheld from a current
    Skill without a version bump, so that copying does not bypass version policy.
30. As a project maintainer, I want new Agents and Instructions independently
    selectable through the existing new-content workflow, so that directory
    selection does not force unrequested additions.
31. As a Blueprint author, I want existing Variable and Stack-aware templates to
    keep rendering, so that simplifying selection does not discard templating.
32. As a project maintainer, I want binary supporting files preserved unchanged,
    so that Blueprint assets remain usable.
33. As a project maintainer, I want existing metadata validation, version
    comparisons, and applicable-content conflict behavior preserved, so that
    simplification does not unexpectedly overwrite surviving files.
34. As a Just user, I want matching modules regenerated without version prompts,
    so that the existing versionless tooling workflow remains intact.
35. As a Just user, I want managed imports derived from module filenames, so that
    logical catalog keys do not alter module identifiers.
36. As a Just user, I want imports removed with retired or inapplicable modules,
    so that the root Just configuration never references deleted managed modules.
37. As a project maintainer, I want unrelated content outside selected targets
    preserved, so that reconciliation stays within declared ownership boundaries.
38. As a Blueprint maintainer, I want missing catalog entries to imply no
    deletion, so that reliable cleanup uses explicit removal records rather than
    an installation database.
39. As a Blueprint maintainer, I want renamed paths cleaned up through explicit
    old-path removal entries, so that no hidden identity-to-path history is needed.
40. As a Blueprint author, I want invalid catalog data and overlapping selections
    rejected before changes, so that ambiguous ownership cannot destroy content.
41. As a project maintainer, I want unsafe paths and symbolic-link traversal
    rejected, so that installation and removal stay inside their designated roots.
42. As a project maintainer, I want all selected writes prepared before changes,
    so that template or metadata failures cannot leave a partially changed project.
43. As a project maintainer, I want application failures to stop and identify
    completed changes, so that filesystem failures are actionable.
44. As a packaged CLI user, I want the catalog and Blueprint sources bundled
    together, so that behavior does not depend on the source checkout.
45. As a contributor, I want shipped sources, tests, and authoring documentation
    migrated to the catalog model, so that legacy conventions do not survive as
    misleading examples.

## Implementation Decisions

- Replace directory-based implicit discovery with a required `catalog.yaml`
  loaded from the resolved Blueprint collection root, including the existing
  externally supplied collection-root mechanism and packaged assets.
- Require exactly the four kind sections: `agents`, `just`, `instructions`, and
  `skills`. Empty mappings are valid. Each section maps logical keys to entries
  with required `path`, `status`, and `stacks` fields.
- Paths are relative to the kind's source root. A trailing slash denotes a
  directory, including for source-less removal records. Preserve each selected
  path relative to the corresponding existing kind destination root; logical
  keys never rename output.
- Only `active` and `removed` are valid statuses. Empty Stack lists mean all
  supported Stacks; nonempty lists use any-match semantics.
- Active entries require valid sources of the declared kind/type, including when
  their Stack filters do not match the current project. Removed entries may have
  no source. Unlisted sources are not installed.
- Reuse the shared reconciliation lifecycle and kind-specific behavior, replacing
  synthetic single-entry mapping and overlay planning with catalog expansion.
  Internal planner structure and YAML parser choice are implementation details.
- Expand selected directories recursively, including ordinary nested directories
  named `stacks`. Remove all special overlay merging, output flattening, and Just
  contribution concatenation.
- Skills retain their ordinary directory and versioned Skill entry. Agents and
  Instructions are authored under their final filenames, with independent
  metadata validation and version decisions for each file.
- Catalog entries are selection and ownership boundaries, not version units.
  A directory grouping Agents or Instructions has no group version.
- Preserve existing rendering, Variable substitution, binary copying, version
  metadata, comparison behavior, malformed-installed-version handling,
  applicable-content conflict decisions, and new-content selection behavior.
- Skills remain whole-directory update units. Adding or changing Skill content
  requires a version bump; do not install new supporting files into a current
  Skill without one. New Agents and Instructions remain independently eligible
  through the existing new-content workflow.
- Treat selected directories as authoritative for destination membership.
  Independently plan deletion of every destination-only file, including local
  additions, even when a Skill is current or its update is skipped. Surviving
  files remain subject to the appropriate version/update rules.
- Both initialization and update reconcile deletions. A removed entry, or an
  active entry with no matching selected Stack, deletes its entire installed
  file or subtree, including local additions and modifications. No confirmation,
  version comparison, conflict-skip option, or new-content option suppresses
  these deletions. Missing targets are no-ops.
- Do not infer cleanup from entries disappearing from the catalog or from a
  logical key changing its path. Keep explicit old-path removal entries when
  cleanup is required; do not introduce an installation inventory.
- Just Modules are standalone root-level named `.just` files with the existing
  module-identifier requirements. Separate Stack-specific files replace composed
  contributions. Modules regenerate without version/conflict prompts, and root
  imports derive from filename stems rather than catalog keys.
- Reconcile managed Just imports with module installation and deletion. Remove
  imports for removed or Stack-inapplicable entries, preserving unrelated root
  configuration and unlisted content rather than inferring deletion from catalog
  absence.
- Reject malformed YAML, unknown fields, invalid statuses or Stacks, invalid
  entry shapes, missing active sources, incompatible types, absolute paths,
  traversal, glob patterns, symbolic-link traversal, and paths outside designated
  roots. Reject duplicate/overlapping target ownership within a kind, including
  active/removed overlaps, before applying changes.
- Preserve unrelated content outside catalog-owned targets. Local additions
  inside a selected directory are explicitly owned content and may be deleted.
- Validate the complete catalog and planned operations, resolve required choices,
  and prepare every selected write before changing the installation. Preparation
  failures leave installed content, project Config, and root imports unchanged.
- Stop on application-time filesystem failures and explicitly report applied
  changes and the failure. Full transactional rollback is not required.
- Surface actual removals in CLI reporting alongside existing install/update
  results. Avoid silently reporting success for failed deletion or application.
- Migrate all shipped content to explicit catalog entries, flatten Agent and Just
  sources, and replace overlay-dependent content with explicit selections while
  preserving applicable guidance and recipes. Remove obsolete legacy code and
  tests rather than keeping compatibility paths.
- Align authoring guidance, domain terminology, lifecycle decisions, packaging,
  and test fixtures with the catalog model. The proposed catalog ADR replaces
  prior wrapper-directory, overlay, and contribution-composition decisions, not
  the retained rendering and versioning behavior.

## Testing Decisions

- The user confirmed the real CLI as the primary test seam: run initialization
  and update against temporary project directories and fixture Blueprint
  collections. Assert externally observable paths, file bytes, root imports,
  Config state, exit status, warnings, and operation reports.
- Reuse the existing Node test runner, strict assertions, temporary-directory
  helpers, CLI execution helpers, interactive harness where needed, and
  collection-root override. Do not introduce a testing framework or public API
  solely for tests.
- Existing CLI tests for Agents, Instructions, initialization, update, rendering,
  existing repositories, and packaged execution provide prior art. Migrate
  relevant fixtures to catalog-backed collections; replace obsolete
  overlay/layout assertions rather than preserving old semantics.
- Cover all kinds together where feasible, including logical keys different
  from filenames, same-named entries in different kinds, nested instruction
  paths, recursive supporting assets, binary data, and ordinary `stacks`
  subdirectories.
- Verify empty-list applicability, each supported Stack, any-match behavior for
  multi-Stack projects, unlisted source exclusion, and transitions between
  selected Stacks. Assert exact installed membership, not only file counts.
- Verify removed and inapplicable files and directories are deleted, including
  edited content and nested local additions, without prompts and despite skip
  or new-content options. Exercise both initialization and update, absent
  targets, source-less removal records, repeated runs, and explicit removal
  reporting.
- Verify destination-only cleanup when sources lose files and when destinations
  gain local files. Include current and skipped Skills; assert surviving file
  contents are not replaced merely because cleanup runs.
- Verify new Skill supporting files require a version bump and that a qualifying
  whole-Skill update installs them. Verify grouped Agents/Instructions can yield
  independently updated, current, skipped, unknown-version, and new-file results.
- Verify removing a whole catalog entry does not delete its prior installation.
  Verify path renames do not infer historical cleanup, and an explicit old-path
  removal record does.
- Verify rendering and metadata behavior remains intact, including template
  errors, invalid shipped versions, malformed installed metadata, and binary
  preservation, through the CLI rather than planner implementation assertions.
- Verify Just module contents are standalone, not concatenated; matching
  multi-Stack modules coexist; imports use filename stems; removed and
  inapplicable modules lose imports; and unrelated root configuration and
  unlisted modules remain untouched.
- Exercise catalog validation failures, missing active sources, invalid types,
  overlapping ownership, traversal, absolute/glob paths, and unsafe symlinks.
  Assert nonzero status, actionable diagnostics, unchanged installed bytes, and
  no writes or deletions outside the intended roots.
- Pair a planned deletion with a failing selected template, metadata validation,
  or Just preparation step. Assert the complete installation, Config, and root
  imports remain unchanged, not merely that the invalid file was not written.
- Reuse existing failure-injection patterns for application-time write/deletion
  failures. Assert the CLI stops, exits unsuccessfully, and identifies completed
  operations and the failure without claiming rollback.
- Extend the packaged CLI smoke test to run outside the checkout with bundled
  catalog and Blueprint assets, demonstrating that catalog lookup does not
  depend on source-tree fallback.
- Run focused tests and type checking through the project's Just recipes.
  Escalate to related CLI regression suites when shared lifecycle changes
  warrant it; do not substitute tests of private planner shapes for behavior.

## Out of Scope

- Backwards compatibility, legacy layout discovery, overlay composition, or
  automatic migration of historical installations.
- An installed-content database or inferred cleanup for missing catalog entries
  and historical paths.
- Glob selection, destination remapping, nested Just module/import semantics,
  directory-level Agent/Instruction versions, or extra lifecycle statuses.
- Protecting local additions within catalog-owned directories from the confirmed
  authoritative cleanup rules.
- Changing template semantics, version metadata conventions, supported Stack
  vocabulary, or applicable-content update/conflict policy beyond the explicit
  cleanup rules.
- Full transactional rollback after application begins.
- Unrelated CLI workflow changes.

## Further Notes

- Requirements source: [the feature design](./design.md), read in full. The
  conversation supplies the user's explicit confirmation of the CLI test seam;
  it does not override the referenced design.
- Architectural context:
  [the proposed catalog ADR](../../docs/adr/0003-catalog-selected-blueprints.md).
  Earlier lifecycle and single-file ADRs describe the mechanisms being replaced.
- The source design and catalog ADR still carry their existing approval status.
  Publishing this requested specification does not silently alter those records
  or authorize implementation.
- No unresolved requirements block specification readiness. YAML parser choice,
  internal planning representation, and specific diagnostic wording are left to
  implementation within the contracts above.
- This specification covers design-to-spec publication only; no tickets,
  implementation, or commits are created by this workflow.
