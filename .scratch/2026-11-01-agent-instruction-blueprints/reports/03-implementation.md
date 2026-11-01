# Ticket 03 implementation report

## Current implementation (ROUND: NONE)

**Status:** DONE_WITH_CONCERNS

The ten requested Agents now ship as versioned Blueprints; all seven supported nonempty Stack selections pass the existing production CLI tests. VS Code loading remains a manual verification gap, not an observed loading failure. Controller acceptance and mechanical gates remain pending.

### Snapshot and ownership

- Checkout: `/home/sincore/source/spindle`.
- Starting and final HEAD: `559c0b4a63a16bfec2ac03d27777ebea5857c85e`; no commits, index changes, resets, stashes, or tracker transitions.
- Starting dirty/untracked changes: controller-owned ticket `issues/03-migrate-shipped-agents.md`; existing `tests/stubs.test.ts` edits explicitly authorized for integration; this untracked report. All were preserved. Prior gate history is retained below.
- Final dirty tracked files: the ten `.github/agents/` copies listed below, `tests/stubs.test.ts`, and the unchanged controller-owned ticket edit. Final untracked files: the ten new source directories listed below and this report.
- Exact tested code/doc/test snapshot: HEAD plus the 21 paths below, fingerprint `d80c2fb1b45b8ccbb78b0d0ce0efdf2296ca224a97ddb0b54f6858fdfd7bdfee`. No code/doc/test edits followed the final GREEN run. Report-only edits followed verification.
- Fingerprint method: sort the 21 checkout-relative paths lexicographically; compute each file's SHA-256; concatenate standard `sha256sum` lines (`<hash>  <path>\n`); SHA-256 that byte stream. Excludes `.scratch` controller state and this evolving report.

### Criteria, changes, and evidence

| Criterion | Change and evidence |
| --- | --- |
| Migrate all ten Agents | Added the ten `AGENT.md` sources below. Existing all-Stack CLI loop requires the exact eleven-Agent production list, including ticket 01's unchanged `shared-r`. |
| Version and preserved metadata/body | Every installed Agent must parse as YAML, retain its matching name, have a nonempty body and SemVer version, and equal version `1.0.0`. Tracked-copy diff contains only versions, Skill-link rewrites, and YAML quoting for `shared-explore`; its description and hint text are unchanged. Existing tools, models, invocation flags, agent lists, and body text are preserved. |
| Installed Skill references | Rewrote eleven links from `../../src/blueprints/skills/` to `../skills/`, including `int-subagent-driven-dev/tdd-evidence.md`. Existing all-Stack loop resolves each relative Markdown link and checks that its installed target is a file. |
| Literal Nunjucks | Read-only scan found no `{{`, `{%`, or `{#` in the ten source files; no raw blocks needed. All sources render successfully through the real CLI. |
| Tracked copies equal CLI output | Generalized the existing tracked-copy equality assertion to every installed Agent. Byte-for-byte equality passes for eleven Agents in every supported Stack selection; the ten new source/copy pairs also have identical SHA-256 hashes. |
| Keep ask local; ship no Instructions | Exact installed Agent filenames exclude `ask`. Added an assertion that production init creates no `.github/instructions` directory. No local ask/Instruction files or production Instruction content changed. |
| Minimal integration coverage | Preserved and built on the authorized dirty test changes. Reused the existing seven init runs per test invocation; no new tests, per-Agent matrices, or standalone init runs. |
| VS Code loading | Not verified interactively. `code` exists at `/etc/profiles/per-user/sincore/bin/code` and a display is configured, but this worker has no UI interaction tool or VS Code IPC hook to observe Agent discovery/loading. CLI YAML validation is not VS Code loading evidence. Controller must reload the workspace and confirm discovery, including non-user-invocable subagents, with `version: 1.0.0`; revisit versioning if loading fails. |

### Changed paths

Added sources and modified corresponding tracked copies for each name in this table:

| New source | Updated copy |
| --- | --- |
| `src/blueprints/agents/sdd-code-reviewer/AGENT.md` | `.github/agents/sdd-code-reviewer.agent.md` |
| `src/blueprints/agents/sdd-code-slop-reviewer/AGENT.md` | `.github/agents/sdd-code-slop-reviewer.agent.md` |
| `src/blueprints/agents/sdd-implementer/AGENT.md` | `.github/agents/sdd-implementer.agent.md` |
| `src/blueprints/agents/sdd-orchestrator/AGENT.md` | `.github/agents/sdd-orchestrator.agent.md` |
| `src/blueprints/agents/sdd-re-review/AGENT.md` | `.github/agents/sdd-re-review.agent.md` |
| `src/blueprints/agents/sdd-task-reviewer/AGENT.md` | `.github/agents/sdd-task-reviewer.agent.md` |
| `src/blueprints/agents/shared-explore/AGENT.md` | `.github/agents/shared-explore.agent.md` |
| `src/blueprints/agents/shared-orchestrator/AGENT.md` | `.github/agents/shared-orchestrator.agent.md` |
| `src/blueprints/agents/shared-rw/AGENT.md` | `.github/agents/shared-rw.agent.md` |
| `src/blueprints/agents/shared-rwx/AGENT.md` | `.github/agents/shared-rwx.agent.md` |

Also changed: `tests/stubs.test.ts` and `.scratch/2026-11-01-agent-instruction-blueprints/reports/03-implementation.md`. Did not edit the ticket, spec, design, authoring guide, helpers, or agent lifecycle tests.

### Fresh checks and TDD

Working directory for every test invocation: `/home/sincore/source/spindle`.

Command used for RED and all three GREEN attempts:

```text
just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/stubs.test.ts
```

1. **RED, before implementation:** exit 1; 1 pass, 7 fail. Every Stack selection failed at the exact Agent-list assertion: only `shared-r` existed instead of eleven Agents. Behavior changes started with failing tests.
2. **First GREEN attempt:** exit 1; 1 pass, 7 fail. CLI exposed the original `shared-explore` description's unquoted `: ` as invalid YAML. Quoted description and argument hint in both files without changing text values.
3. **Second GREEN attempt:** exit 1; 1 pass, 7 fail. Exact-copy assertion exposed a missing space in the new `sdd-re-review` table. Restored original spacing.
4. **Final GREEN:** exit 0; **8 pass, 0 fail**, no warnings. Includes all seven nonempty selections of `php-laravel`, `python`, and `typescript`, validating all production Skills and Agents.

Read-only self-review: `just tool::git --no-pager diff -- .github/agents tests/stubs.test.ts`, `just tool::git status --short`, and `just tool::git rev-parse HEAD`. SHA-256 inspection confirms all ten source/copy pairs match. No outstanding code defects found in this scoped review. Temporary CLI fixtures were cleaned by the existing tests.

### Pending controller checks and concerns

Not run by this worker because they were approved but not explicitly scheduled:

- Full regression: `just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/*.test.ts`.
- Types: `just test::types`.
- Lint: `just lint::check`.
- Formatting: `just format::check` on changed files; `just format::format` if needed.
- Whitespace: `just tool::git diff --check`.
- Manual VS Code Agent discovery/loading check described above.

The known local-skill baseline assertion was excluded as assigned. Pending controller checks are not implementer failures and do not establish ticket acceptance. No assigned corrective findings; the earlier scope/ownership gate is resolved by the current dispatch.

**Hand-back:** ten Agent Blueprints and matching tracked copies are ready for controller review; focused production CLI coverage is GREEN. Keep the VS Code loading gap explicit until checked.

### Controller verification

At `2026-11-01T23:03:33Z`, full regression passed 246/246 with the known local-Skill inventory assertion excluded. `just test::types`, `just lint::check`, and `just tool::git diff --check` passed. `just format::check` initially flagged both shared-explore files; `just format::format` on those two files fixed the formatting only. Changed-file formatting passed afterward, and the production-focused test command above passed 8/8 on the final snapshot. Final fingerprint over the same sorted 21 paths: `721690c5e5aa5b3b71dedc1a98006ae85ea6fff7286657371d406e2a8feb0051`. No other code changes were made.

### Controller acceptance

At `2026-11-01T23:13:59Z`, the maintainer confirmed "Verified: all migrated Agents load" in VS Code in response to the explicit request covering the migrated Agents, non-user-invocable subagents, and version metadata. This closes the manual gap and review findings 03-CR-01/T03-SQ-01. The controller rechecked the fingerprint unchanged and the whitespace check clean. The original reviewer verdicts are preserved as historical evidence; their sole acceptance gap is now resolved by this human verification.

---

## Historical assignment gate (superseded; preserved verbatim)

**Status:** NEEDS_CONTEXT

**Checkout:** `/home/sincore/source/spindle`. **Starting revision:** `559c0b4`. **Final revision:** `559c0b4`; no commits were made.
**Dirty/untracked at start:** `M .scratch/2026-11-01-agent-instruction-blueprints/issues/03-migrate-shipped-agents.md` (controller edit). The only change since then is this report.
**Tested snapshot:** none. Work paused at step A, before RED.

### Blocking question

The assignment says to extend the existing production/shipped Agent coverage, including R2-02 Stack coverage, rather than duplicate it. That R2-02 coverage is in `tests/stubs.test.ts:78-150`: the `init installs every production Blueprint and supporting file for <stacks>` loop over every non-empty `supportedStacks` selection. For every shipped Agent, it already checks filenames, `name`, SemVer version and non-empty content, plus a `shared-r`-specific tracked-copy assertion. `tests/stubs.test.ts` is **not** in FILE_SCOPE, which allows only `tests/agents.test.ts` and `tests/helpers.ts`.

To meet the ticket's test criterion, the test would need two additions for every shipped Agent and supported Stack selection: an exact rendered-content check against the tracked `.github/agents/<name>.agent.md`, and a check that each relative Markdown link resolves to an installed file. The options are:

1. **Recommended:** add `tests/stubs.test.ts` to FILE_SCOPE. Extend its per-selection Agent loop with a tracked-copy equality check and a relative-link resolution check for every Agent. Generalize the `shared-r` special case only where needed. This adds no new init runs or per-Agent matrices.
2. Keep the current FILE_SCOPE. Generalize the shared-r test in `tests/agents.test.ts` (`production init installs the versioned shared-r Agent matching the local copy`, line 388) to cover all shipped Agents and loop over the supported Stack selections. This duplicates the per-selection init runs and filename/version checks already in `tests/stubs.test.ts`.

### Facts gathered (no edits made)

- The 10 Agents in scope exist at `.github/agents/<name>.agent.md`. None have `version` yet.
- None of them contain `{{`, `{%`, `{#`, `}}` or `%}`. No raw-wrapping appears to be needed; this will be confirmed by the render-and-diff check.
- There are 11 relative links, all of the form `../../src/blueprints/skills/<skill>/...`. Each target is a shipped Skill: `int-verification-before-completion`, `int-code-slop-review`, `int-test-driven-development`, `int-subagent-driven-dev` (including the supporting file `tdd-evidence.md`). No shipped Skill has Stack overlays. No Skill references were found to be unshipped or local-only.
- The Agents referenced in `agents:` frontmatter are `sdd-*`, `shared-explore`, `shared-r`, `shared-rw` and `shared-rwx`. All of them are shipped once this ticket is done; `ask` is not referenced.

### Checks

None run yet. Formatting, lint, type checks and ticket-wide regression checks are pending.
