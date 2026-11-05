# 02: Adopt the shared Internal Skill description

Reporter: unknown
Category: enhancement
Status: ready-for-agent

**What to build:** Shipped Internal Skill Blueprint descriptions use
`computed.internal_skill_description` instead of repeating their shared sentence.
Generated guidance remains identical, including when using the packaged CLI
outside the source checkout. Blueprint authors have documentation explaining how
to consume and define Computed Variables.

**Blocked by:** 01: Computed Variables through init and update.

- [ ] Every shipped Internal Skill Blueprint frontmatter description matching
      "This is an internal skill do not load it unless explicitly required by the user or another skill."
      uses the registered Computed Variable through standard Nunjucks
      interpolation.
- [ ] Rendered descriptions retain that exact sentence for representative
      supported Stack selections and Variable values, with no added newline or
      unresolved interpolation. Frontmatter remains parseable and existing
      version metadata is preserved.
- [ ] Leave unrelated prose, including occurrences outside matching description
      frontmatter, unchanged. Do not broadly rewrite installed customization
      files or force otherwise unchanged Blueprints to update.
- [ ] Integration coverage verifies the migrated shipped descriptions during
      initialization and eligible updates, rather than only testing synthetic
      fixture templates or the provider's return value.
- [ ] A packaged-CLI integration test runs outside the source checkout and
      verifies a shipped Internal Skill's rendered description, demonstrating
      that compiled providers and bundled Blueprint assets work together without
      source files.
- [ ] Author-facing documentation explains the distinction between Variables and
      Computed Variables, the `computed` template namespace, the explicit
      name-to-class registry, and how to add a provider.
- [ ] Documentation describes read-only resolved Config constructor injection,
      parameterless synchronous string rendering, once-per-run evaluation and
      reuse, no persistence or direct overrides, and identifying failures during
      preparation. It does not imply project plugins or machine-wide settings
      are supported.
- [ ] Generated text, Config behavior, Blueprint selection, version/conflict
      policy, and application-failure guarantees remain consistent with ticket
      01 and the agreed specification.
- [ ] Covering tests and the normal build pass through Just recipes, including
      the packaged-CLI check against freshly built assets. Existing rendering
      tests affected by migrating the description receive resolved context
      without weakening their behavioral assertions.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress;
`- [S]` Skipped.

## Comments
