# Ticket 01 Code-Slop Review

## Findings

### Important

None.

### Minor

1. **The safety helper retains unused defaults and an unnecessary path-mapping callback** — `src/install.ts:50-60`, `src/blueprints/lifecycle.ts:205-210`.
   - **Evidence:** Every repository call supplies the destination directory. Each call with Blueprint names also supplies a mapper; the only call using the default mapper passes an empty list. During application, the target is resolved once for installation and again inside the safety helper.
   - **Impact:** A generic safety check retains a dead Skill-specific default and accepts names plus a callback even though it only needs concrete paths. That obscures the relationship between the path checked and the path written.
   - **Simplification:** Pass the already resolved target paths to `assertSafeInstallPaths` and make the destination explicit. Retain the `.github`, destination, Config, and target checks at every existing preflight and recheck point; do not remove the prompt-time or per-install safety checks.

2. **The reconciliation plan carries parallel names and file maps** — `src/blueprints/lifecycle.ts:62-73`, `src/blueprints/lifecycle.ts:253-276`.
   - **Evidence:** Collection builds a `Map` of files, derives a separate name array from its keys, and carries both into planning. Planning and application each recover the files with a non-null asserted lookup (`:96` and `:218`).
   - **Impact:** The association between a Blueprint and its planned files is an implicit invariant across multiple phases, adding state and lookups to an already multi-phase lifecycle.
   - **Simplification:** Carry ordered `{ name, files }` records from collection into each planned Blueprint and use the attached files during application. Preserve discovery order, empty Skill plans, omitted single-file plans, cross-kind preflight, and lazy Variable resolution.

3. **Rendered version validation is duplicated between the two handlers** — `src/blueprints/agents/handler.ts:16-23`, `src/blueprints/skills/handler.ts:14-22`.
   - **Evidence:** Both blocks ignore non-entry files, parse frontmatter with `gray-matter`, require a string accepted by `parseSemver`, and emit the same error apart from the kind and entry filename.
   - **Impact:** The same rendered-version policy must be maintained in two places even though versioned update planning is shared.
   - **Simplification:** Put the common validation in the existing versioned logic and parameterize it by kind and entry filename. Keep the per-kind handlers, the exact kind-specific errors, and the Skill behavior of ignoring supporting files.

4. **Agent CLI tests repeat fixture lifetime management throughout the file** — `tests/agents.test.ts:21-24`, `tests/agents.test.ts:62-70`.
   - **Evidence:** The new 1,134-line file has 24 separate Blueprint-root allocation/cleanup blocks and 26 project cleanup blocks; the same basic `demo` Agent source directory is also created 14 times. Existing `tests/update.test.ts:50-82` already uses a scoped fixture helper.
   - **Impact:** Repeated setup and `try/finally` cleanup make the distinct conflict, version, overlay, and prompt assertions harder to find and make fixture-lifecycle changes repetitive.
   - **Simplification:** Add a small test-local callback helper that creates separate project and Blueprint roots and cleans both in `finally`; optionally share the straightforward Agent-entry writer. Keep each case's source contents, CLI calls, assertions, loop isolation, and race hooks explicit.

## Checks and Snapshot

- **Workspace:** `/home/sincore/source/spindle`; base and HEAD both `79d44ff5497ae5f96bca06b5495be4a60dc75f69`. No staged changes were present.
- **Covered change:** the tracked diff against that base plus the untracked Agent handler, `shared-r` Blueprint, shared versioned planner, and Agent CLI tests. The ticket's review-state comments and separate review reports were outside the implementation fingerprint; no other review report or controller ruling was supplied for this assignment.
- **Implementation fingerprint:** `74456b08ad8b50ed3ef41048505e00d46e59cbd94ea77c4921b992d599ebb089`, recomputed before and after the checks from the following ordered paths:

  ```text
  .github/agents/shared-r.agent.md
  .github/skills/author-blueprint/SKILL.md
  GLOSSARY.md
  docs/adr/0002-single-file-blueprints.md
  src/blueprints/agents/handler.ts
  src/blueprints/agents/shared-r/AGENT.md
  src/blueprints/lifecycle.ts
  src/blueprints/registry.ts
  src/blueprints/skills/handler.ts
  src/blueprints/types.ts
  src/blueprints/versioned.ts
  src/index.ts
  src/install.ts
  src/prompts.ts
  src/update.ts
  src/version.ts
  tests/agents.test.ts
  tests/helpers.ts
  tests/reconciliation.test.ts
  tests/stubs.test.ts
  ```

- **Evidence inspected:** the spec, design, ticket and comments, implementation report, ADRs, repository tooling instructions, exact tracked diff, untracked implementation and tests, and existing Skill update/fixture conventions. Other changed documentation and CLI files were read for context; the aggregate review owns the remaining scope.
- **Fresh checks in the shared checkout:** `just test::types` and `just lint::check` exited 0; `just tool::git --no-pager diff --check 79d44ff5497ae5f96bca06b5495be4a60dc75f69 --` exited 0. `just format::check` on the 16 reviewed implementation and test files exited 0.
- **Fresh isolated test check:** In a disposable copy with the same fingerprint, `just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/*.test.ts` exited 0: 115 passed, 0 failed. The name filter excludes that one test rather than counting it as skipped. The test harness writes under `.scratch`, so it was not run in the shared checkout. The Just recipe unexpectedly caused pnpm to populate the temporary copy from its local cache (107 packages reused, 0 downloaded); the copy was removed and the reviewed implementation fingerprint remained unchanged.
- **Controller evidence and limits:** The controller reported the same 115-test result, passing changed-file formatting, lint, types, and diff checks; repository-wide formatting had 39 pre-existing failures. The excluded local-Skill inventory assertion was not run on the baseline here, but `just tool::git ls-tree -d --name-only 79d44ff5497ae5f96bca06b5495be4a60dc75f69:.github/skills` independently listed 31 baseline directories. VS Code Agent loading was not exercised and remains scheduled for ticket 03.
- The proposed simplifications were not implemented or run; the tests above cover the current snapshot only. If the controller adopts them, rerun the Agent and Skill CLI/regression checks, especially the collision and prompt-time symlink cases.

## Assessment

**Code slop found? Yes.** Four minor, concrete simplifications concern the safety API, parallel plan state, repeated version validation, and repeated test-fixture management. The proposed changes retain the required safety checks and observable behavior; acceptance remains with the controller.

### Checklist

| Category | Result |
| --- | --- |
| Comments | CLEAN: narration, empty docblocks, placeholders, and closing-brace labels. |
| Naming | CLEAN: generic placeholders, run-on names, suffix abuse, and type-in-name patterns. |
| Over-engineering | CLEAN: one-implementation interfaces, single-method classes, pure delegate wrappers, and dependency creep. SUSPICIOUS: the safety helper's unused defaults and mapper. The two handlers and shared version planner are required by the design. |
| Defensive code | CLEAN: no material generic-catch or impossible-null pattern introduced; the selected-path and prompt-time checks have concrete coverage. External-call timeout/rate-limit heuristics are not applicable to this scope. |
| Tests | CLEAN: mock-everything, exception-only, and snapshot tests. SUSPICIOUS: `tests/stubs.test.ts:118-123` uses the production renderer for its collection-wide expected value; the focused Agent tests independently assert concrete rendered output, so no additional material simplification is proposed for that smoke check. |
| Style | CLEAN: unsafe type escapes and debug artifacts. SUSPICIOUS: repeated fixture boilerplate. Formatting uniformity and absence of historical `HACK` markers are not evidence of a maintainability issue in this focused diff. |

### Code Slop Ledger

| File | Verdict | Top findings | Suggested action |
| --- | --- | --- | --- |
| `src/blueprints/lifecycle.ts` | SUSPICIOUS | Parallel names and file map | Carry files with each planned Blueprint. |
| `src/install.ts` | SUSPICIOUS | Unused safety defaults and path callback | Pass explicit resolved targets; keep all rechecks. |
| `src/blueprints/agents/handler.ts` | SUSPICIOUS | Duplicated version validator | Share rendered-version validation. |
| `src/blueprints/skills/handler.ts` | SUSPICIOUS | Paired existing validator | Use the same validation policy without changing Skill behavior. |
| `src/blueprints/versioned.ts` | CLEAN | Shared planner has two real callers | None. |
| `src/version.ts` | CLEAN | Templating and SemVer handling support required behavior | None. |
| `src/blueprints/types.ts` | CLEAN | Contract supports multiple kinds | None. |
| `src/blueprints/registry.ts` | CLEAN | Static registry | None. |
| `src/index.ts` | CLEAN | Kind-aware initialization context | None. |
| `src/update.ts` | CLEAN | Kind-aware update context | None. |
| `src/prompts.ts` | CLEAN | Kind-aware prompt context | None. |
| `tests/agents.test.ts` | INFLATED | Repeated independent fixture setup and cleanup | Use a small scoped fixture helper; retain the cases. |
| `tests/helpers.ts` | CLEAN | Prompt hook supports the race cases | None. |
| `tests/reconciliation.test.ts` | CLEAN | Existing Skill behavior retained in assertions | None. |
| `tests/stubs.test.ts` | SUSPICIOUS | Production rendering smoke uses the renderer as its oracle | Retain the separate concrete-output Agent assertions. |

Ledger summary: CLEAN 9; SUSPICIOUS 5; INFLATED 1; CRITICAL 0. These labels describe the inspected scope, not an acceptance decision.
