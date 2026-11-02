# Blueprint Version Metadata

## Intent

Move Spindle's Blueprint version from a top-level frontmatter field into the
Spindle-owned metadata namespace:

```yaml
meta:
  spindle:
    version: 1.0.0
```

Apply this convention to every Blueprint kind, including kinds added in the
future, so version handling remains consistent across the shared lifecycle.
Every kind uses the shared SemVer validation and update behavior, reading its
version from `meta.spindle.version`.

## Success criteria

- The shared version reader and version validation read only
  `meta.spindle.version`.
- Version handling leaves other frontmatter fields and metadata namespaces
  unchanged.
- Every current and future versioned Blueprint kind uses the shared SemVer
  validation and update behavior.
- Shipped Blueprint source frontmatter uses the nested version field.
- Blueprint frontmatter will not contain a top-level `version`; no backward
  compatibility or fallback is needed. The user will reinstall this
  repository's installed copies for all Blueprint kinds.
- Always render the complete entry file through Nunjucks before Gray-matter
  parses its frontmatter and reads `meta.spindle.version`, whether or not the
  version field itself contains Nunjucks syntax.
- Resolve the normal Nunjucks context for version checks even when a Blueprint
  may be up to date and not installed. Existing prompts and non-interactive
  missing-input errors continue to apply.
- Update planning retains the existing guard against a Blueprint entry file
  changing between version planning and installation; that guard is independent
  of frontmatter templating.
- Use one representative CLI test for Nunjucks-templated nested version
  metadata, alongside ordinary nested-version validation/update coverage for
  each Blueprint kind.
- Generated test fixtures live under a dedicated subdirectory of `tests/`,
  specifically `tests/.generated/`, ignored by `tests/.gitignore`, rather than
  in the repository-root `.scratch/`.
- Undefined variables encountered during unconditional rendering remain
  explicit errors. Tests that previously avoided rendering an up-to-date
  Blueprint body with undefined variables must be adjusted to reflect this
  behavior.
- Record the shared `meta.spindle.version` convention in
  [ADR 0001](../../docs/adr/0001-blueprint-lifecycle.md).

## Scope and constraints

In scope: the shared version parsing and validation paths, shipped Blueprint
metadata, directly related tests and documentation, and the test fixture
directory and ignore rule.

Out of scope: backwards-compatible reads of top-level `version`, removing
Nunjucks support from frontmatter, and changes to Nunjucks rendering outside
version extraction.

## Considered approaches

| Approach | Summary | Trade-off |
| --- | --- | --- |
| **1. Update the shared version reader** | Read `meta.spindle.version`, migrate shipped metadata, and retain rendering when frontmatter is templated. | Smallest change; the shared rule automatically applies to every current and future kind. |
| 2. Add a generic Spindle metadata parser | Introduce a reusable metadata parsing layer and route versioning through it. | Could support future metadata features, but adds abstraction not needed for this version change. |

## Selected direction

Use approach 1. Keep one shared extraction and validation path for all
versioned Blueprint kinds, changing its lookup to `meta.spindle.version`.
Require every current and future versioned kind to supply a valid SemVer value
at that path.
Version handling owns only this namespaced value; other frontmatter fields and
metadata namespaces retain their existing behavior.
Always resolve the normal Nunjucks context and render the complete entry file
before parsing frontmatter, rather than detecting whether the version field is
templated. This retains Nunjucks support in frontmatter and means body
templates are also evaluated during version planning, including when a
Blueprint might otherwise be considered up to date. Existing variable
prompts and non-interactive missing-input errors apply in that case as well.

Migrate shipped Blueprint source metadata across all kinds. Do not retain a
top-level `version` field or a fallback for it. Reinstalling this repository's
installed copies for all kinds is the user's chosen way to bring those files
in sync.

Retain a source-change guard between update planning and installation,
independent of frontmatter templating.

## Assumptions left to implementation

- Existing version comparison, missing/invalid-version behavior, and update
  policies remain unchanged apart from the metadata path.
- Tests should prove that nested metadata drives install/update decisions.
  Retain one representative CLI test for a Nunjucks-templated nested version
  and ordinary nested-version validation/update coverage for each Blueprint
  kind; remove redundant syntax permutations rather than dropping the behavior.
- Test-generated temporary fixtures should use an ignored subdirectory under
  `tests/`, specifically `tests/.generated/` ignored by `tests/.gitignore`,
  rather than the root `.scratch/`.
- Undefined variables encountered during unconditional rendering continue to
  produce explicit errors, as they do now. Update planning can therefore fail
  on an undefined variable in the body even if the Blueprint would otherwise
  be up to date.
- Rendering source entries for version checks requires the normal resolved
  context even when no update or installation is ultimately needed.
