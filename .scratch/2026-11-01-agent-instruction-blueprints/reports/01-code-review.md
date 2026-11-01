# Code review: ticket 01

Review phase: **INITIAL_TASK**

## Strengths

- The Agent handler maps the declared `AGENT.md` directly to the kind-specific
  `.agent.md` destination. Discovery checks the selected single-file plan and
  duplicate output paths before applying any kind (`src/blueprints/lifecycle.ts:247-276`,
  `src/install.ts:143-196`).
- Outcomes and prompts retain the Blueprint kind, including independent
  selection of same-named Skills and Agents. The CLI tests exercise these
  paths, overlay selection, unversioned warnings, and symlink destinations
  (`tests/agents.test.ts`).
- The shared version planner retains warning/skip behavior for unknown installed
  versions, and SemVer comparisons use `bigint` for large numeric identifiers
  (`src/blueprints/versioned.ts:18-48`, `src/version.ts:10-46`).
- The shipped `shared-r` source and local copy match at version `1.0.0`.
  Production-collection tests cover all seven supported Stack combinations;
  an additional compiled-CLI smoke test installed it and recognized it as
  up to date.

## Issues

### Critical

None.

### Important

1. **[01-CR-001] A failed replacement deletes the installed Agent.**
   `src/install.ts:116-121` removes the destination before attempting the
   exclusive write. If that write fails, for example because the filesystem
   fills up or the process is interrupted, the original Agent is already gone.
   In an isolated public-CLI test, an injected `ENOSPC` on the Agent write
   made `update` exit nonzero and left the previously installed Agent absent.
   Stage the rendered content in a sibling temporary file and replace the
   destination only after the write succeeds, retaining the symlink and
   new-file conflict protections. Add a failure-injection CLI regression.

2. **[01-CR-002] Overwriting an Agent path can recursively delete a directory.**
   `src/install.ts:117` uses recursive removal for a single-file target without
   checking its type. If `.github/agents/demo.agent.md` is an existing
   directory, `init --on-conflict overwrite` treats it as an Agent conflict,
   deletes the directory and all its contents, writes the Agent file, and
   reports success. An isolated CLI probe confirmed that an unmanaged
   `notes.txt` inside that directory disappeared. Reject a directory or other
   unexpected non-file destination with a clear error rather than recursively
   removing it; add a regression asserting its contents survive.

3. **[01-CR-003] Invalid Agent metadata can leave a failed init partially applied.**
   `src/blueprints/lifecycle.ts:314-320` applies the Skill plan before the
   Agent plan, but `src/install.ts:113-114` validates rendered metadata only
   while applying each file. With an existing Skill and Agent, a valid updated
   Skill and an Agent with an invalid rendered version, `init --on-conflict
   overwrite` returned an error after replacing the Skill; the Agent remained
   unchanged and no `spindle.json` was written. Thus a failed initialization
   leaves mixed content and cannot subsequently be reconciled via `update`.
   Render and validate all selected entries before starting replacements, or
   otherwise make the operation preserve prior content on such preflight
   failures. Add a cross-kind CLI test that checks both existing files and the
   absent Config after an invalid Agent.

4. **[01-CR-004] Conditional frontmatter is parsed before it can be rendered.**
   `src/version.ts:70-81`, called by `src/blueprints/versioned.ts:18-21`,
   parses raw YAML to decide whether a version is templated. Its fallback
   recognizes template markers only on the `version:` value itself. A valid
   Agent with `{% if ... %}` / `{% else %}` surrounding complete `version:`
   lines installs successfully, but a subsequent `update` aborts with a YAML
   parse error instead of comparing the rendered version. This also affects
   other conditional frontmatter that makes the raw YAML invalid. Detect and
   render template-dependent frontmatter before parsing it, while preserving
   the existing lazy no-op behavior for genuinely static Skill versions. Add
   CLI coverage for conditionals around whole frontmatter fields.

### Minor

None.

## Recommendations

- Optional: let `tests/helpers.ts:8-11` use a configurable external temporary
  directory so reviewers and CI can run the CLI suite against a read-only
  checkout without first copying it.
- Optional: add a compiled or packaged CLI smoke test to routine verification;
  the current production-collection tests exercise the TypeScript entry point.

## Checks

- **Snapshot and coverage:** inspected the specification, design, ticket and
  comments, repository instructions, implementation report, the tracked diff,
  all four untracked implementation/test files, and surrounding lifecycle,
  CLI, versioning, and test code. Base and HEAD were both
  `79d44ff5497ae5f96bca06b5495be4a60dc75f69`; the index was unchanged.
  The implementation-file fingerprint matched
  `74456b08ad8b50ed3ef41048505e00d46e59cbd94ea77c4921b992d599ebb089`
  before and after the checks. Tracker and review reports were excluded from
  that fingerprint. No prior findings or rulings were supplied.
- **Reviewer-run, checkout:** `just tool::git --no-pager diff --check
  79d44ff5497ae5f96bca06b5495be4a60dc75f69 --` exited 0. Baseline inspection
  confirmed 31 tracked `.github/skills` directories and the pre-existing
  assertion expecting only `author-blueprint`.
- **Reviewer-run, isolated copy:** the test harness writes below its working
  directory, so an external `/tmp/spindle-review-PcDe2a` copy was used; its
  implementation fingerprint matched the reviewed snapshot.
  `just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/*.test.ts`
  passed **115 tests, 0 failures**. The excluded inventory assertion was not
  rerun. `just test::types` and `just lint::check src tests` exited 0.
  Changed-file `just format::check` exited 0 for all 20 implementation files,
  using the copied project configuration.
- **Reviewer-run, isolated build:** `just tool::pnpm --dir
  /tmp/spindle-review-PcDe2a run build` exited 0. A separate
  `just test::test built-smoke.test.mjs` passed: the built CLI installed
  31 Skills and `shared-r`, then reported the Agent up to date.
- **Reviewer-run, isolated defect probes:** `just test::test
  reviewer-probes.test.mjs` exited 1 with four failing assertions, reproducing
  the four Important issues above. The probe and build smoke files exist only
  in the external temporary copy.
- The first isolated unscoped lint/format attempts ran before the root dotfile
  configurations had been copied; the lint invocation scanned dependencies and
  produced many warnings. Those attempts are not used as clean-check evidence;
  the configured scoped checks above were rerun. The controller reported a
  passing unscoped lint check and pre-existing repository-wide formatting
  failures; repository-wide formatting was not independently rerun.
- VS Code Agent discovery/loading with the added `version` field was not
  checked here. The supplied plan schedules that required feature-level smoke
  check for ticket 03.

## Declined to judge

- Instruction registration and Instruction CLI behavior are part of ticket
  02, not this initial ticket; no Instruction content is expected to ship.
- Migration of the remaining `sdd-*` and `shared-*` Agents, their installed
  Skill links, and the IDE loading smoke check belong to ticket 03 and must be
  covered before aggregate acceptance.
- Automatic adoption of unversioned Agents is explicitly excluded by the
  specification; preserving them with a warning is the required behavior.
  Shipping the local-only `ask.agent.md` and `testing.instructions.md` is also
  explicitly out of scope.

## Assessment

**Ready to merge? With fixes.** Correct the four Important findings and add the
corresponding CLI regressions, then rerun the relevant checks on the controller's
current snapshot. The controller retains the acceptance decision; the deferred
ticket 02/03 work and VS Code loading check still require aggregate coverage.
