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

## Success criteria

- The shared version reader and version validation read only
  `meta.spindle.version`.
- Shipped Blueprint source frontmatter uses the nested version field.
- Existing top-level `version` values are not supported; no backward
  compatibility is required because the user will reinstall Agents and
  Instructions in this repository.
- Version extraction no longer detects or renders Nunjucks in frontmatter.
  Remove the related implementation and tests. Nunjucks rendering of Blueprint
  content, including the body, remains unchanged.
- Tests cover the nested metadata contract and existing version-based
  install/update behavior without testing templated frontmatter.

## Scope and constraints

In scope: the shared version parsing and validation paths, shipped Blueprint
metadata, and directly related tests and documentation.

Out of scope: backwards-compatible reads of top-level `version`, general
frontmatter templating, and changes to Nunjucks rendering outside version
extraction.

## Considered approaches

| Approach | Summary | Trade-off |
| --- | --- | --- |
| **1. Update the shared version reader** | Read `meta.spindle.version`, migrate shipped metadata, and remove frontmatter-specific Nunjucks handling. | Smallest change; the shared rule automatically applies to every current and future kind. |
| 2. Add a generic Spindle metadata parser | Introduce a reusable metadata parsing layer and route versioning through it. | Could support future metadata features, but adds abstraction not needed for this version change. |

## Selected direction

Use approach 1. Keep one shared extraction and validation path for all
versioned Blueprint kinds, changing its lookup to `meta.spindle.version`.
Remove frontmatter-templating detection, conditional context resolution for
version extraction, and tests that establish templated versions as supported.
Keep ordinary body rendering and rendered-content validation intact.

Migrate shipped Blueprint source metadata across all kinds. Do not retain a
fallback for top-level `version`. Reinstalling this repository's Agents and
Instructions is the user's chosen way to bring those installed files in sync.

## Assumptions left to implementation

- Existing version comparison, missing/invalid-version behavior, and update
  policies remain unchanged apart from the metadata path.
- Tests should prove that nested metadata drives install/update decisions and
  that templated bodies continue to render; they should not add a separate
  test for Nunjucks inside frontmatter.
