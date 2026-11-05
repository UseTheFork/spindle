# 01: Computed Variables through init and update

Reporter: unknown
Category: enhancement
Status: ready-for-agent

**What to build:** Blueprint authors can print named, developer-defined Computed
Variables during initialization and updates using the separate `computed`
Nunjucks namespace. Providers receive effective project Config at construction,
produce shared strings once per generation run, and fail clearly before project
changes are applied. Deliver the first provider,
`computed.internal_skill_description`, through this complete generation path.
Migration of shipped descriptions and author documentation belong to ticket 02.

**Blocked by:** None (can start immediately).

- [ ] Introduce a shared abstract provider base whose constructor receives
      read-only, resolved Config and whose abstract `render()` method accepts no
      arguments and synchronously returns a string. Nested Stacks and Variables
      collections are read-only through the typed contract.
- [ ] An explicit typed registry maps public template names to classes shipped
      with Spindle. There is no project-defined executable provider loading,
      automatic discovery, or naming derived from class names.
- [ ] Register `internal_skill_description` with the exact output
      "This is an internal skill do not load it unless explicitly required by the user or another skill."
      for every Config, without an added newline.
- [ ] Both init and update resolve providers after normal Config validation,
      Variable defaults, and any existing prompting. Providers neither prompt nor
      modify Config.
- [ ] Templates receive only resolved strings under `computed`, alongside the
      unchanged `stacks` and `variables` namespaces. Frontmatter, bodies, and
      supporting text files across Skills, Agents, and Instructions can print
      these values.
- [ ] Each registered provider is instantiated and rendered once per generation
      run. Shared context resolution reuses its values for version inspection and
      eventual writes, without per-template recomputation or cross-run caching.
      Operations that do not need rendering retain their existing behavior.
- [ ] Provider exceptions stop generation with the public registry name and
      underlying failure information. Unknown computed output references fail
      with the missing name; neither failure substitutes empty text or other
      success-shaped output.
- [ ] Computed resolution and rendered-output preparation complete before
      Blueprint writes, Config writes, deletions, or directory-membership cleanup.
      Failure during preparation leaves the project unchanged. Existing
      application-time failure reporting remains intact.
- [ ] Computed values are not persisted, prompted for, or directly overridable
      through Config or CLI flags. A user Variable with the same leaf name does
      not replace the computed value. No Config schema change is required.
- [ ] CLI integration tests exercise successful init and update output, parsed
      frontmatter, supporting files, representative Stack and Variable inputs,
      unchanged version metadata, and absence of computed values from Config.
      Reuse the existing real-CLI and fixture-catalog test patterns.
- [ ] CLI preparation-failure tests include an unknown computed output reference
      alongside planned creations and removals. Assert a nonzero result, the
      missing name in diagnostics, byte-for-byte unchanged existing Config and
      managed files, and no applied creations or removals.
- [ ] Focused provider-resolution tests verify Config-derived strings including
      resolved defaults, once-per-run evaluation and reuse, fresh evaluation in a
      separate run, and a named provider exception before application. Use this
      seam only for requirements the initial constant provider cannot demonstrate
      through CLI output; add no production plugin mechanism solely for tests.
- [ ] Existing rendering behavior remains covered: Variables, Stack conditions,
      raw blocks, literal text, strict undefined outputs, disabled autoescaping,
      and binary handling. Blueprint selection, conflict/version policy, and
      unchanged-Blueprint update behavior remain intact.
- [ ] Focused tests, type checking, and the normal CLI build pass through the
      repository's Just recipes. Provider code ships in the built CLI.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress;
`- [S]` Skipped.

## Comments
