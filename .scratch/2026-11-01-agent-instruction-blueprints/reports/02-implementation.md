# Ticket 02 Implementation Report: Enabling Instruction Blueprints

Status: **DONE**

## Checkout and snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `9e3ba0a`. The worktree was clean except for the controller's edit to `issues/02-instruction-blueprint-lifecycle.md`.
- Final revision: `9e3ba0a`. Nothing was committed, because commits were not authorized.
- Dirty/untracked after the work:
  - Modified: `.github/skills/author-blueprint/SKILL.md`, `src/blueprints/registry.ts`, `src/index.ts`, `tests/agents.test.ts`
  - Modified by the controller and left untouched: `.scratch/.../issues/02-instruction-blueprint-lifecycle.md`
  - Untracked: `src/blueprints/instructions/handler.ts`, `tests/instructions.test.ts`, and this report
- Tested snapshot: the worktree above, after `just format::format`, matching the fingerprint below.

### Code fingerprint

`sha256sum` over the sorted changed and untracked code, test, and doc paths:

```
c1674db156524e80507245f04224a717c32e69f812c92801331fba6070f3ad25  .github/skills/author-blueprint/SKILL.md
e975d621a35cd1202d84a10c0000c1650ecd67403171974c068195fa9b91feab  src/blueprints/instructions/handler.ts
305ac6724bcfb7c3c2243ed1ef28891eaa64456a361cc76eebba85550d3f3110  src/blueprints/registry.ts
5ba5627768249d22d4093aa79242dd51547cf30e225f87f3cbdd753dde9f26cb  src/index.ts
2e7e5c3fa0be331467f817531bd9e2890154270a97790ebf49f5dca299d593a3  tests/agents.test.ts
ccaed15bff87f27af3c343692c40dac77a727bb896fcf8480fc47d5f49f0abec  tests/instructions.test.ts
```

sha256 of that listing: `8e53fb9681b451485fd49a5f9f60ede432db7ebb918a1ef80fa7ecb83dac5f20`

## Changes

- `src/blueprints/instructions/handler.ts` (new): the `Instruction` handler. Its source is `<blueprintsRoot>/instructions`, its destination `.github/instructions`, its entry file `INSTRUCTION.md`, and its target `<name>.instructions.md`. It uses the shared `validateVersionedMetadata` and `planVersionedUpdate`, with `"warning"` for malformed installed metadata, as the Agent handler does.
- `src/blueprints/registry.ts`: registers `instructionHandler` after Skills and Agents.
- `src/index.ts`: `init`/`update` help now says "Blueprints (Skills, Agents, and Instructions)".
- `tests/agents.test.ts`: the two help-text kind-list regexes now expect the new wording. Nothing else changed.
- `tests/instructions.test.ts` (new): three compact real-CLI tests.
- `.github/skills/author-blueprint/SKILL.md`: documents the Instruction source path, the install target, the frontmatter (`description`, `applyTo`, SemVer `version`), and the exactly-one-entry/overlay-only rules for Instructions.
- No changes were needed in `lifecycle.ts`, `versioned.ts`, `version.ts`, `types.ts`, `install.ts`, `update.ts`, or `prompts.ts`. Ticket 01 already made them kind-generic: single-file `entryFile`/`targetPath`, skipping of empty kinds, per-kind summaries, kind-named prompts and errors, and the rule of reading the version statically unless the frontmatter is templated.
- `GLOSSARY.md` and ADR 0002 already define Instruction and its `INSTRUCTION.md` → `.github/instructions/<name>.instructions.md` mapping, so they are unchanged.
- No production Instruction content was added. `src/blueprints/instructions/` contains only `handler.ts`, so the collection has no Blueprint directories.

## Criterion mapping

| Criterion | Change | Test |
| --- | --- | --- |
| Register an Instruction handler that maps `INSTRUCTION.md` to one file with the expected name | handler.ts, registry.ts | `init and update install selected Instructions as single versioned files` checks that `.github/instructions` contains exactly `local/py/style.instructions.md` with the rendered content |
| Shared Stack selection, rendering, conflict, symlink safety, and version update | Shared lifecycle via handler fields | Test 1: a Nunjucks stack conditional and Variable, a selected overlay-only `py` that is installed, an unselected `ts` that is omitted, and a version bump 1.0.0→2.0.0 applied by `update`. Test 2 (`Instruction conflicts and invalid versions preserve the installed file`): a non-interactive conflict error naming `Instruction 'style'`, plus `--on-conflict skip` in test 1 and `overwrite` in test 2. Symlink safety uses the same `targetPath` and `assertSingleFileDestination` path as Agents; no new Instruction-specific test was added, per the maintainer's direction to keep tests minimal. |
| Valid rendered SemVer for shipped Instructions; installed missing/invalid versions warn and are skipped | `validateVersionedMetadata` and `planVersionedUpdate(..., "warning")` | Test 2: shipped `version: v1` fails with `Invalid Instruction metadata in 'INSTRUCTION.md'` and preserves the existing file. Test 1: an unversioned installed `local` gives the warning `Instruction 'local'.*no version` and is preserved. |
| A missing or empty Instruction collection doesn't block Agent/Skill init/update; a fixture covers install and update via the CLI | Existing empty-kind skipping | Test 3 (`production init and update ship no Instructions...`) runs production `init` and `update` successfully. Test 1 is the fixture install and update. |
| No production Instruction content; summaries don't report an empty kind | No content added | Test 3: the summary matches `skill(s), N agent(s)`, contains no `instruction` text, and `.github/instructions` is not created. |
| Authoring guide documents Instruction layout and metadata | SKILL.md | Docs only, no test. |
| CLI integration tests for install, update, conflict, Stack selection, and the empty production kind | tests/instructions.test.ts | All three tests listed above. |

TDD evidence: I wrote the tests first. RED run (`just test::test tests/instructions.test.ts`): tests 1 and 2 failed with `No Blueprints are available to install.` because the kind wasn't registered. Test 3 passed before the change; it is a regression guard for the empty production kind, which is the intended starting state. After implementation, test 2 failed because of its own ordering: the non-interactive conflict is reported before metadata validation. I fixed the test by passing `--on-conflict overwrite` to the invalid-version run, which also proves preservation under overwrite. On the rerun, all 3 passed.

## Fresh check results (from `/home/sincore/source/spindle`)

- `just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/*.test.ts` → exit 0; tests 246, pass 246, fail 0, cancelled 0, skipped 0
- `just test::types` → exit 0
- `just lint::check` (oxlint) → exit 0
- `just format::check` on the 6 changed files → it first reported issues in `src/blueprints/instructions/handler.ts` and `tests/instructions.test.ts`. I ran `just format::format` on those two, and the recheck said "All matched files use the correct format." (exit 0).
- `just tool::git diff --check` → exit 0, no output. The untracked files were checked separately for trailing whitespace and have none.

## Self-review and concerns

- The help-text wording changed, which required a minimal regex update in two existing assertions in `tests/agents.test.ts`. That is in scope as a kind-list assertion.
- Instruction frontmatter validation requires only `version`. The guide recommends `description`/`applyTo`, but the handler does not enforce them, matching how Agents handle `name`/`description`.
- No dedicated Instruction symlink test was added. Coverage relies on the shared single-file path that the Agent tests already exercise.

## Checks not run / pending with controller

All scheduled checks were run. Ticket-wide acceptance and any further regression review are left to the controller.

## Hand-back

DONE. The Instruction kind is registered through a new handler that mirrors Agents. The help text and authoring guide are updated, and there are 3 new CLI tests. All scheduled checks pass and nothing was committed.
