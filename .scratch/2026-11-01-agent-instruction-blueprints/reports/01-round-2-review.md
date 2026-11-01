## Finding Verdicts

**[01-CR-001] ADDRESSED — Failed Agent replacement.** `src/install.ts:162-173` writes to an exclusive staging file and renames only after the write and a destination recheck succeed; new files still use exclusive creation at `src/install.ts:178-179`. The CLI regressions at `tests/agents.test.ts:1137-1221` inject partial writes and creation races for both commands, and the existing symlink coverage remains at `tests/agents.test.ts:859-905`. The controller reports these tests GREEN in the final 137-test suite.

**[01-CR-002] ADDRESSED — Directory deletion.** `src/install.ts:102-115` rejects symlinks and non-regular destinations, and `src/blueprints/lifecycle.ts:294-297,327-329` checks them before application. `tests/agents.test.ts:1223-1323` covers directories, sockets, and mixed-kind init/update while preserving their contents and existing Skills. The controller reports the final suite GREEN.

**[01-CR-003] ADDRESSED — Cross-kind validation failure.** When a replacement is selected, `src/blueprints/lifecycle.ts:340-367` prepares every selected file across kinds before applying any plan; `src/install.ts:127-150` renders and validates during preparation. The CLI cases at `tests/agents.test.ts:1325-1413,1445-1488` check preservation of existing files and Config state for invalid metadata and rendering failures. The controller reports the final suite GREEN.

**[01-CR-004] NOT ADDRESSED — Conditional frontmatter.** The added direct conditional-field cases are covered, but `src/version.ts:82-102,131-143` can discard a conditional YAML anchor needed by `version: *v`, then parse the incomplete projection instead of rendering. A reviewer-run in-memory diagnostic validated the rendered Agent at version `2.0.0`, but update planning threw `unidentified alias "v"`. `tests/agents.test.ts:1489-1556` covers direct conditional version fields, not this dependency; the controller-reported final suite is GREEN but does not resolve the defect. See also R2-01.

**[T01-I01] NOT ADDRESSED — Valid conditional frontmatter on both kinds.** The same shared version planner at `src/blueprints/versioned.ts:36-42` is used by Agents and Skills, so the conditional-anchor failure in 01-CR-004 affects both. The new CLI tests cover multiline and inline literal version fields for both kinds, and `tests/update.test.ts:320-440` covers several lazy static cases; the controller reports them GREEN in the final suite, but they do not cover the demonstrated alias case.

**[T01-I02] ADDRESSED — Malformed installed Skill metadata.** `src/blueprints/skills/handler.ts:13-15` requests parse errors, while the Agent handler requests warnings (`src/blueprints/agents/handler.ts:15-17`); `src/version.ts:61-78` propagates malformed metadata when requested. The CLI regressions at `tests/update.test.ts:466-501` and `tests/agents.test.ts:609-641` cover Skill failure/preservation and Agent warning/preservation respectively. The controller reports the final suite GREEN.

**[T01-I03] ADDRESSED — Failed Agent validation overwrites a Skill.** The cross-kind preparation before application at `src/blueprints/lifecycle.ts:340-367` covers the specified replacement scenario. `tests/agents.test.ts:1325-1413` checks the existing Skill, its supporting file, the Agent, and absent Config for invalid rendered metadata; the controller reports the final suite GREEN.

**[T01-I04] ADDRESSED — Failed Agent write destroys the old file.** The staging/write/rename sequence at `src/install.ts:162-173` keeps the original until the staged write completes, and the new-file path remains exclusive at `src/install.ts:178-179`. `tests/agents.test.ts:1137-1221` exercises partial-write failure and write-time creation races through both CLI commands; existing symlink cases are at `tests/agents.test.ts:859-905`. The controller reports the final suite GREEN.

**[T01-I05] ADDRESSED — Glossary definitions.** `GLOSSARY.md:15-19` defines Agent and Instruction without paths or a version requirement; `docs/adr/0002-single-file-blueprints.md:3-7` retains the installation and versioning details. This documentation correction needs no behavioral test; the definitions and ADR were inspected directly.

**[T01-M01] ADDRESSED — Independent production Agent assertions.** `tests/stubs.test.ts:116-145` uses literal frontmatter and content assertions and compares the installed `shared-r` with its local copy rather than using the production renderer as the Agent oracle. All seven currently supported Stack combinations remain represented at `tests/stubs.test.ts:13,72-75`. The controller reports the final suite GREEN; the test's future Stack-enumeration limitation is R2-02.

**[01-SL-003] ADDRESSED — Shared rendered-version validation.** `src/blueprints/versioned.ts:13-25` centralizes the policy and preserves entry-file filtering and kind-specific errors; both handlers call it at `src/blueprints/skills/handler.ts:11-12` and `src/blueprints/agents/handler.ts:13-14`. `tests/agents.test.ts:1325-1373,1415-1443` covers exact errors and ignored Skill supporting-file metadata. The implementer reports relevant tests before and after the pure refactor, and the controller reports the final suite GREEN.

## New Breakage in the Fix Diff

**[R2-01] Important — Projection can silently suppress a newer update.** `src/version.ts:101-102,126-140` removes conditional anchor declarations and treats the remaining alias as static. For example:

```yaml
---
fallback: &v 1.0.0
{% if "python" in stacks %}
selected: &v 2.0.0
{% endif %}
version: *v
---
```

For the Python Stack, the rendered metadata resolves `version` to `2.0.0`; against an installed `1.0.0` Agent, the reviewer-run in-memory planning check instead returned `{"status":"up-to-date"}`. This is a new silent false success: the prior raw-YAML path failed rather than reporting the outdated Agent current. The shared planner exposes the same risk to Skills. Add public-CLI coverage for a version dependent on conditional frontmatter while preserving genuinely static lazy updates.

**[R2-02] Minor — Production Stack coverage can silently become stale.** `tests/stubs.test.ts:13,72-75` replaces enumeration of `supportedStacks` with a separate fixed list. The list currently matches `src/install.ts:19`, but a later supported Stack will no longer be included in the production CLI combinations automatically. Assert the independent list matches the supported set or enumerate that set while retaining independent output expectations.

## Updated Spec and Quality

- **Spec: FAIL.** Conditional, template-dependent version metadata remains incorrectly handled (01-CR-004/T01-I01), including the silent missed-update case R2-01.
- **Quality: FAIL.** The two findings remain open and R2-01 is Important; R2-02 is a Minor coverage regression.
- **Code-review readiness: With fixes.** 01-CR-004 remains open; the controller owns corrective dispatch and acceptance.
- The initial task, code, and code-slop reviews all occurred. No initial task review is pending. The initial task review's unaffected PASS evidence for mapping, overlays and omission, conflict/symlink checks, kind-aware output, and unversioned-Agent warnings remains recorded in `.scratch/2026-11-01-agent-instruction-blueprints/reports/01-task-review.md:3-12`; this scoped review does not replace it. The controller's parked 01-SL-001, 01-SL-002, and 01-SL-004 were not re-adjudicated.
- **Expanded-review request:** Please have the controller adjudicate whether the specification's broader failure-preservation wording requires rollback across kinds after later filesystem errors; if so, arrange a separate expanded review. This is not a request for a corrective dispatch from this reviewer.

## Out-of-Scope Observations

- Whole-operation rollback after an arbitrary later filesystem failure is not provided: plans are applied sequentially at `src/blueprints/lifecycle.ts:366-372`, so an earlier Skill replacement can remain if a later Agent write fails. The implementer explicitly records this pre-existing limitation in `.scratch/2026-11-01-agent-instruction-blueprints/reports/01-implementation.md:218`; no independent mixed-I/O probe was run. It is not a new fix-induced finding and does not itself block this scoped round.

## Verdict

**Findings remain open:** 01-CR-004 and T01-I01 are **NOT ADDRESSED**. R2-01 is new Important breakage; R2-02 is Minor.

## Checks and Snapshot

- **Exact fixed snapshot supplied:** HEAD `79d44ff5497ae5f96bca06b5495be4a60dc75f69`, fixed code tree `67d78c0cca7fc8493c6c25de8db79ac376b576b1`, ordered code fingerprint `396fd04f453a7bc7ae3343431813d48bf1d7941176bf9cf38623b8c8caef5761`. The reviewed fix base was the same HEAD plus tree `2704056fc6dbf45951882747cf27a8284cfbeea5`, fingerprint `74456b08ad8b50ed3ef41048505e00d46e59cbd94ea77c4921b992d599ebb089`. Tracker and reports are excluded.
- Read the supplied complete fix package, including its identities, 13-file stat, and diff; no Git diff or revision commands were rerun. Reviewer-run `sha256sum` over the report's ordered code paths, piped to `sha256sum`, matched the fixed fingerprint both before and after the diagnostic checks. Tree identities are as supplied, not independently recomputed.
- **Controller-reported, not reviewer-rerun:** after formatting on the fixed snapshot, `just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/*.test.ts` exited 0 with **137 passed, 0 failed**. `just test::types`, `just lint::check`, `just tool::git diff --check`, and changed-file `just format::check` were reported exit 0.
- **Implementer-reported:** the corrective report records focused RED/GREEN evidence and GREEN results of 82 relevant tests, 12 additional CLI tests, and 8 production tests at fingerprint `570a6bc77c7d73877926edb7408c93bc2eebd52c751e46a75ab7c46c451fb25f`. Those results alone are not evidence for the later fixed fingerprint; the controller supplied the post-format final-suite result above.
- **Reviewer-run, non-mutating diagnostics:** two `just test::test --import data:text/javascript,... /dev/null` in-memory checks patched only process-local reads and exercised rendered metadata plus `planVersionedUpdate`. Both exited 0 because their assertions confirmed the observed defects: one produced `unidentified alias "v"`; the other validated rendered `2.0.0` against installed `1.0.0` but returned `up-to-date`. These were focused planner diagnostics, not CLI integration tests.
- **Limitations:** no suite was rerun by this reviewer. The known baseline inventory assertion was excluded and repository-wide formatting was reported failing at baseline; neither is claimed GREEN. VS Code Agent loading remains scheduled for ticket 03, outside this round.
