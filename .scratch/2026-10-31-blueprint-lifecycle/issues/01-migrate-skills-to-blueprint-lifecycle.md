Category: enhancement
Status: ready-for-agent
Reporter: unknown

# 01: Migrate Skills to the Blueprint lifecycle

**What to build:** As a Spindle maintainer, I want Skills managed through the shared Blueprint lifecycle, so that `init` and `update` retain their user-facing behavior while the architecture is ready to support additional Blueprint kinds.

**Blocked by:** None (can start immediately).

- [ ] A static TypeScript registry connects the shared lifecycle engine to a Skill handler; the registry initially contains Skills only.
- [ ] The Skill handler declares the Skill source, destination, and metadata/lifecycle rules, while common discovery, rendering, installation, and reconciliation behavior is shared.
- [ ] Unified `init` and `update` commands use this lifecycle and preserve Skill version-aware updates and existing conflict behavior.
- [ ] The Skill handler and its Markdown Blueprints are organized together; no backwards-compatibility layer for the prior internal source layout is added.
- [ ] Project Config continues to store selected Stacks and user Variable values, which are passed explicitly to lifecycle behavior rather than stored in mutable global state.
- [ ] Shared Variable names and definitions are declared in typed TypeScript and use a single namespace and value across Blueprint kinds and selected Stacks.
- [ ] Markdown is rendered with Nunjucks before frontmatter is parsed with `gray-matter`; all project frontmatter parsing uses `gray-matter`, with kind-specific metadata validation.
- [ ] Shared and nested text content renders with Stack conditionals and Variables; non-renderable files retain their existing byte-preserving behavior.
- [ ] CLI-level `init` and `update` tests using fixture Blueprints verify generated content, Config, rendering, frontmatter/version behavior, and relevant existing Skill lifecycle outcomes.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
