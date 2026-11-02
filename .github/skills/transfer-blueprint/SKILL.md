---
name: transfer-blueprint
description: Transfer a user-specified .github agent, skill, or instruction into its Blueprint and bump the Blueprint version.
argument-hint: "<.github item path or kind and name> [version or bump]"
disable-model-invocation: true
user-invocable: true
---

# Transfer Blueprint

Promote local customization changes into reusable Blueprint source, preserving rendering behavior.

## Workflow

### 1. Resolve the supplied item

The user must supply an item path or an unambiguous kind and name. If absent or ambiguous, ask and stop before edits; an IDE selection is not a supplied item.

| Source | Blueprint entry |
| --- | --- |
| `.github/agents/<name>.agent.md` | `src/blueprints/agents/<name>/AGENT.md` |
| `.github/skills/<name>/SKILL.md` or its directory | `src/blueprints/skills/<name>/SKILL.md` |
| `.github/instructions/<name>.instructions.md` | `src/blueprints/instructions/<name>/INSTRUCTION.md` |

Resolve identity from the basename, not the frontmatter display name. Reject unsupported paths explicitly. Read the complete source item, existing Blueprint, relevant handler, and repository instructions. Inspect local changes before editing.

**Done:** one existing source, one destination, and the complete supporting-file scope are identified. A missing destination means creating a new Blueprint.

### 2. Reconcile Blueprint source

Consult [Blueprint decisions](../../../docs/adr/) and [planning](../../../src/install.ts), [rendering](../../../src/render.ts), and [Variables](../../../src/variables.ts) for current behavior.

- Transfer intended content and frontmatter changes into the existing authoring structure. Preserve Blueprint metadata, unrelated content, Stack branches, and overlays.
- Skills include referenced supporting files with their relative paths. Retain unmatched destination files unless their removal is part of the supplied change. Agents and Instructions must install exactly one entry file; ask if additional files are needed.
- Compare `.github/spindle.json` with template branches to distinguish rendered local content from reusable source. Preserve unselected Stacks; ask when a change cannot safely be assigned to shared or Stack-specific content.
- Use Nunjucks only where reusable variation requires it, following existing `stacks` and `variables` usage. Wrap intended literal `{{ ... }}`, `{% ... %}`, or `{# ... #}` text in raw blocks, including inside code fences.
- Keep shared files outside `stacks/`; overlay paths are additive, not overrides. Avoid duplicate output paths and file/directory collisions.
- Preserve binary assets as bytes. Symlinks are not installed; ask how to handle required symlinked or external assets.

**Done:** every intended source change is accounted for without flattening templates, inventing Variables, or losing required assets.

### 3. Bump the item version

Read [version rules](../../../src/version.ts). Set entry frontmatter `meta.spindle.version` to valid SemVer, preserving other metadata. Honor a supplied version or bump, but require the result to exceed both existing Blueprint and installed source versions: equal versions do not update content.

Without an explicit release choice, patch-bump the higher stable version. Ask for a release version when neither version exists or when either existing version is invalid or a prerelease. Bump only the Blueprint entry, not the package or installed source.

**Done:** the new version is valid and strictly higher than every existing valid item version.

### 4. Validate and report

Read [tooling](../../../docs/agents/tooling.md); use Just recipes. Check formatting of changed files and run focused rendering, matching-kind, and update tests. Update directly affected test expectations after reading their instructions; preserve unrelated assertions.

Review the diff for template syntax, links, complete output file sets, metadata, and scope. Do not run `spindle init/update` against this checkout to validate: that mutates installed customizations. Item discovery requires no catalog registration.

**Done:** report source, destination, transferred assets, template decisions, old/new versions, validation results, and any blocked or unverified behavior. Keep the `.github` source intact; commit only when requested.
