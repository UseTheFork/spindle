Category: enhancement
Status: ready-for-agent
Reporter: unknown

# 03: Namespace Blueprint Version Metadata

**What to build:** Every current and future Blueprint kind uses
`meta.spindle.version` as its SemVer version field, so Spindle-owned version
metadata has one consistent namespace and update behavior.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Version extraction and validation read only `meta.spindle.version`;
      other frontmatter fields and metadata namespaces retain their behavior.
- [ ] All shipped Blueprint source frontmatter and this repository's installed
      Blueprint copies use the nested version field. Top-level `version` has
      no compatibility fallback.
- [ ] The full entry file is rendered through Nunjucks with the normal resolved
      context before Gray-matter parses frontmatter, even when version metadata
      is static or the Blueprint may be up to date.
- [ ] Existing SemVer comparison, missing/invalid installed-version behavior,
      update policies, and the source-change guard remain intact.
- [ ] Undefined template variables and non-interactive missing-input
      conditions remain explicit errors; normal variable prompts still apply.
- [ ] The lifecycle architecture decision records the shared version field.
- [ ] CLI tests cover one representative Nunjucks-templated nested version and
      ordinary nested-version validation/update behavior for each Blueprint
      kind; redundant syntax permutations are removed without dropping the
      behavior.

## Comments
