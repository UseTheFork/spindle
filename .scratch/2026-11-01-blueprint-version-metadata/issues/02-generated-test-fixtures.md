Category: enhancement
Status: ready-for-agent
Reporter: unknown

# 02: Isolate Generated Test Fixtures

**What to build:** Test-created temporary files live in a dedicated ignored
directory under the test tree, keeping generated artifacts out of the
repository-root scratch area.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Test helpers create temporary directories under `tests/.generated/`.
- [ ] A test-local ignore rule excludes the generated fixture directory.
- [ ] Existing tests continue to pass and clean up their temporary fixtures as
      appropriate.

## Comments
