# Manage GitHub content through Blueprints

The proposed [ADR-0003](./0003-catalog-selected-blueprints.md) replaces this
decision's Stack-overlay and discovery rules. It is awaiting design approval;
the text below records the earlier architecture.

Spindle will manage GitHub content through a shared Blueprint lifecycle engine, with a static TypeScript registry and per-kind handlers; `init` and `update` remain unified, starting with Skills and adding other kinds only when ready. Versioned Blueprints own their Markdown frontmatter, parsed with `gray-matter` after Nunjucks rendering; each versioned kind stores its SemVer at `meta.spindle.version`. Typed TypeScript defines shared Variables and each project Config holds the user's selected Stacks and values. Duplicate output paths fail for Blueprints. This is a new direction with no backwards-compatibility requirement.
