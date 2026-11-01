# Ticket 01 implementation report

**Status:** DONE_WITH_CONCERNS  
**Checkout:** `/home/sincore/source/spindle`  
**Assignment:** initial implementation; round, findings, prior attempts, and rulings: NONE  
**Starting and final revision:** `79d44ff5497ae5f96bca06b5495be4a60dc75f69`  
**Commit:** not authorized; none created or staged.

## Snapshot

At dispatch the only dirty file was the controller's ticket 01 status/comments; there were no pre-existing untracked files. That tracker change remains intact and was not edited by this worker. The final tested snapshot was the revision above plus that existing tracker change and the implementation files below. The report was written after the tests and is excluded from the fingerprint.

The SHA-256 of the output of `sha256sum` over the following paths, **in this order**, is `f6e0cea2de5eb415445e089a1b00e5d112b67461be743a2c1641d2a6da9cc976`:

```text
.github/agents/shared-r.agent.md
.github/skills/author-blueprint/SKILL.md
.scratch/2026-11-01-agent-instruction-blueprints/issues/01-agent-blueprint-lifecycle.md
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

The Agent handler, Agent Blueprint, shared versioned planner, and `tests/agents.test.ts` are new untracked files; the remaining implementation files are modified tracked files. The assigned report is also newly created. No other tracker or shipped Skill content was changed.

## Criteria, changes, and evidence

| Criterion                                                 | Change and focused evidence                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct Agent install and kind-aware outcome               | Registered an Agent handler with `AGENT.md` → `.github/agents/<name>.agent.md`; outcomes carry `kind`. The real-CLI test installs a rendered Agent and same-named Skill and checks both files and counts.                                                                                       |
| Exact entry file, selected overlays, duplicate protection | Preflight plans all kinds before applying changes; a nonempty single-file plan must contain only `AGENT.md`. CLI tests cover selected overlay install/update, unexpected files, shared/overlay and two-overlay collisions, and preservation of existing Agent and Skill files on failure.       |
| Omission and empty kinds                                  | Missing/empty collections are skipped; an Agent with no selected entry is omitted, while no discovered Blueprints produces a clear error. CLI tests cover an Agent-only collection, unselected overlays, and all kinds empty/missing.                                                           |
| Actual destination conflicts and symlinks                 | Safety and conflict checks use the mapped Agent file, are repeated after prompts and before applying, and single-file creation is exclusive. CLI tests cover init/update, existing and dangling symlinks, prompt-time symlink/file changes, and skip/overwrite policies.                        |
| Rendered SemVer, updates, and unversioned warnings        | Shared versioned planning compares shipped and installed versions; unknown or malformed installed metadata is preserved with a kind-aware warning. Tests cover older/equal/newer, missing/invalid versions, invalid shipped metadata, templated versions, and large numeric SemVer identifiers. |
| Skill lifecycle preserved                                 | The Skill handler now uses the shared version planner. Existing Skill CLI/reconciliation tests cover templated and static versions, warnings, Stack overlays, conflict policies, cancellation, and binary assets.                                                                               |
| Kind-aware selection, prompts, outcomes, summaries, help  | Both commands use per-kind results and generic help; interactive CLI tests cover Agent conflict, new/outdated decisions, and independently selecting same-named Skills and Agents.                                                                                                              |
| Production `shared-r`                                     | Added the `1.0.0` Blueprint and matching repo-local copy. CLI tests parse the installed frontmatter and verify the copy; production tests install and compare all shipped Skills and Agents across all seven supported Stack combinations.                                                      |
| Documentation                                             | Updated the local Agent authoring guidance, Agent/Instruction glossary entries, and ADR 0002. Instruction registration/content and other Agent migrations remain assigned to later tickets.                                                                                                     |

## RED-to-GREEN evidence

Behavior changes were implemented in focused vertical slices at the confirmed real CLI seam, not via a new test-only production API. Each of the following focused tests was first run with `just test::test --test-name-pattern '<test name>' tests/agents.test.ts`, observed to fail for the stated behavior, and then rerun GREEN after implementation:

- Agent init initially reported only the Skill; equal-version Agents were overwritten during update.
- Unexpected Agent outputs were accepted; an Agent conflict was reported only after a Skill had already been installed.
- Agent conflict/new/outdated prompts said “Skill”; help described only Skills.
- Invalid rendered Agent metadata removed the existing file; a non-text entry bypassed validation.
- Production `shared-r` was absent.
- An unselected Agent overlay was incorrectly checked as an active symlink destination; the empty selected-plan summary had no count.
- A symlink or regular file introduced during an interactive prompt was overwritten.
- Malformed installed frontmatter aborted instead of warning; block-templated versions were parsed before rendering; large numeric SemVer identifiers lost precision.

Additional CLI regression tests were added after these slices for related paths already implemented; no failures were manufactured. Existing reconciliation assertions were updated only to include the required kind and kind-aware warnings.

## Fresh checks

Working directory for all checks: `/home/sincore/source/spindle`.

```text
just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/agents.test.ts tests/init.test.ts tests/update.test.ts tests/existing-repo.test.ts tests/reconciliation.test.ts tests/install.test.ts tests/stubs.test.ts tests/variables.test.ts
```

Result: **exit 0; 98 passed, 0 failed**. The named pre-existing local-Skill inventory assertion was explicitly excluded; Node's reporter does not count filtered-out tests as skipped.

```text
just test::test --test-name-pattern 'init installs every production Blueprint and supporting file|production init installs the versioned shared-r Agent matching the local copy|update refuses an Agent destination changed to a symlink while prompting|update preserves an Agent file created while its new-install prompt is open' --test-skip-pattern 'only author-blueprint remains a local skill' tests/stubs.test.ts tests/agents.test.ts
```

Result: **exit 0; 10 passed, 0 failed**, including all seven Stack combinations.

## Self-review and pending controller work

- Self-review caught and corrected the production test's initial assumption that `shared-r` would remain the only shipped Agent, so the later Agent migration can extend the collection.
- No unresolved implementation finding was identified in the assigned scope.
- **VS Code Agent discovery/loading with the added `version` field has not been exercised.** The installed Markdown/frontmatter and CLI output were verified, but a VS Code executable alone does not demonstrate Agent loading; the controller should perform the spec's manual IDE smoke check before acceptance.
- The known baseline test `only author-blueprint remains a local skill` was not run; the controller reported that 31 tracked Skill directories make it fail. No Skills were removed.
- Formatting, lint, type checks, and ticket-wide regression checks remain with the controller. The controller reported pre-existing repository-wide formatting failures; these and its earlier passing lint/types results were not re-run or independently verified here.
- No Instruction handler/content, other Agent copies, tracker states, or unrelated baseline issues were changed.

## Hand-back

The Agent vertical slice and shared single-file/version lifecycle are ready for controller review and mechanical checks, subject to the IDE smoke-check concern above. No ticket acceptance, tracker transition, staging, or commit was performed.

---

# Ticket 01 corrective round 2 of 5

**Status:** DONE_WITH_CONCERNS  
**Checkout:** `/home/sincore/source/spindle`  
**Starting and final revision:** `79d44ff5497ae5f96bca06b5495be4a60dc75f69`  
**Dependencies:** none. Round 1 stopped at its assignment gate without changing files.  
**Commit:** not authorized; nothing was staged or committed.

## Snapshot and scope

The starting worktree contained the reviewed uncommitted ticket 01 implementation, the controller's tracker-state changes, and the four existing reports. The index was clean. The supplied reviewed tree `2704056fc6dbf45951882747cf27a8284cfbeea5` exists, and the ordered implementation-file fingerprint matched the supplied `74456b08ad8b50ed3ef41048505e00d46e59cbd94ea77c4921b992d599ebb089` before editing. Existing changes and report history were retained.

Round 2 changed `GLOSSARY.md`, `src/install.ts`, `src/version.ts`, `src/blueprints/lifecycle.ts`, `src/blueprints/agents/handler.ts`, `src/blueprints/skills/handler.ts`, `src/blueprints/versioned.ts`, `tests/agents.test.ts`, `tests/update.test.ts`, `tests/install.test.ts`, and `tests/stubs.test.ts`. It added the focused CLI filesystem injectors `tests/fail-agent-write.mjs` and `tests/race-agent-create.mjs`, and appended this section to the assigned report. The previously untracked Agent handler, versioned planner, and Agent test remain untracked. No tracker state, review report, other Agent, or shipped Skill content was edited.

Final tracked modifications, including the preserved starting work, are:

```text
.github/agents/shared-r.agent.md
.github/skills/author-blueprint/SKILL.md
.scratch/2026-11-01-agent-instruction-blueprints/issues/01-agent-blueprint-lifecycle.md
GLOSSARY.md
docs/adr/0002-single-file-blueprints.md
src/blueprints/lifecycle.ts
src/blueprints/registry.ts
src/blueprints/skills/handler.ts
src/blueprints/types.ts
src/index.ts
src/install.ts
src/prompts.ts
src/update.ts
src/version.ts
tests/helpers.ts
tests/install.test.ts
tests/reconciliation.test.ts
tests/stubs.test.ts
tests/update.test.ts
```

Final untracked files are the four existing reports under `.scratch/2026-11-01-agent-instruction-blueprints/reports/`, `src/blueprints/agents/handler.ts`, `src/blueprints/agents/shared-r/AGENT.md`, `src/blueprints/versioned.ts`, `tests/agents.test.ts`, and the two new test injectors named above. The index remains clean.

The exact code and test snapshot used by the final checks is HEAD plus the worktree content above. The SHA-256 of `sha256sum` output for the following paths, **in this order**, is `570a6bc77c7d73877926edb7408c93bc2eebd52c751e46a75ab7c46c451fb25f`. Tracker and report files are excluded; only this report was appended after the final tests.

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
tests/fail-agent-write.mjs
tests/helpers.ts
tests/install.test.ts
tests/race-agent-create.mjs
tests/reconciliation.test.ts
tests/stubs.test.ts
tests/update.test.ts
```

## Finding-to-change and covering evidence

All new behavioral regressions use the confirmed real CLI seam. Behavioral changes started with observed failures; the shared-validator and production-oracle changes reused passing tests.

| Finding                 | Correction and fresh coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **01-CR-001 / T01-I04** | Single-file replacements write the complete validated content to an exclusive sibling staging directory, recheck the destination, and rename only after the write succeeds. Partial-write `ENOSPC` injection failed against the reviewed behavior for both init and update, then passed with the original Agent and Config preserved and staging cleaned. Existing symlink cases and new write-time exclusive-create race checks also pass.                                                                                               |
| **01-CR-002**           | Single-file destinations are checked with `lstat` before update planning, rechecked after prompts, and checked again at replacement. Directories, sockets, and other non-regular files are rejected. Directory/socket CLI tests first showed successful destructive overwrites; the passing tests preserve directory contents, sockets, and, in mixed-kind init/update, the existing Skill.                                                                                                                                               |
| **01-CR-003 / T01-I03** | When any replacement is selected, all selected files across kinds are rendered and validated before the first replacement; the prepared text is reused. RED tests showed an invalid Skill deleting its original, invalid Agent metadata replacing a Skill, and an Agent rendering failure replacing a Skill. All now preserve existing content and Config state; an additional passing case covers a newly selected invalid Agent. New-only operations retain the prior sequential Skill failure behavior when no replacement is planned. |
| **01-CR-004 / T01-I01** | Version detection handles multiline and inline conditionals around whole frontmatter fields for Skills and Agents. Independent CLI cases for both branches and kinds were RED on raw YAML and are now GREEN. Static versions still avoid rendering unrelated templated metadata on no-op updates, including conditional/raw metadata and quoted or spaced YAML keys; quoted templated version keys are also covered.                                                                                                                      |
| **T01-I02**             | Installed malformed Skill YAML again propagates its parse error before other replacements, while malformed Agent YAML still yields the intended warning. The Skill CLI regression first exited successfully and replaced another Skill; it now fails safely, and the Agent warning and ordinary missing/non-SemVer cases remain passing.                                                                                                                                                                                                  |
| **T01-I05**             | Agent and Instruction glossary definitions now describe domain concepts without installation paths or a version requirement. ADR 0002 retains the lifecycle mapping and version details; unversioned Agents are not excluded by the glossary.                                                                                                                                                                                                                                                                                             |
| **T01-M01**             | Production Agent checks use independent literal frontmatter/content assertions rather than the production renderer as their oracle. The three Stack IDs are independently specified, retaining all seven combinations; all seven passed before and after the assertion change. Skill collection comparisons remain unchanged.                                                                                                                                                                                                             |
| **01-SL-003**           | The two handlers now share rendered SemVer validation, parameterized by kind and entry filename. Four passing tests were run before and after the refactor, including exact kind-specific errors, ignored Skill supporting-file metadata, and binary/supporting-file preservation.                                                                                                                                                                                                                                                        |

The controller's parked findings 01-SL-001, 01-SL-002, and 01-SL-004 were not taken as refactoring assignments.

## Fresh checks and self-review

All commands ran in `/home/sincore/source/spindle` through `just test::test`.

```text
just test::test tests/agents.test.ts tests/update.test.ts tests/install.test.ts tests/reconciliation.test.ts
```

Final result: **exit 0; 82 passed, 0 failed**. An earlier run of this relevant set failed one existing new-Skill installation-failure test: preflighting even when no replacement was planned changed prior Skill behavior. The implementation was corrected to preflight all selected files whenever a replacement is planned while retaining sequential new-only behavior; the command above is the fresh passing rerun.

```text
just test::test --test-name-pattern 'init renders nested Markdown|init combines shared files|init rejects a shared file colliding|init skip policy|init overwrite policy|init refuses a symlinked|--on-conflict overwrite re-renders|--on-conflict skip leaves existing skills|flags supply variables and defaults|non-interactive init uses product Variable defaults' tests/init.test.ts tests/existing-repo.test.ts tests/variables.test.ts
```

Result: **exit 0; 12 passed, 0 failed**.

```text
just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/stubs.test.ts
```

Result: **exit 0; 8 passed, 0 failed**, including all seven production Stack selections. The known pre-existing inventory assertion was explicitly excluded; Node does not count name-filtered tests as skipped.

Focused RED runs also demonstrated the partial-write failures (2 tests), destructive directory/socket handling (2), mixed-kind metadata/render failures (3), conditional versions and static conditional metadata (5), malformed installed Skill YAML (1), cross-kind directory preflight (2), and quoted/raw metadata edge cases (3). Their corresponding focused GREEN reruns and the final commands above passed.

Self-review additionally caught `gray-matter` caching a partially parsed result for identical malformed raw template sources; version reads now bypass that cache, with repeated-source lazy-update coverage. Failure-injection tests exercise actual CLI processes, including a file appearing at the exclusive-write boundary. No unresolved finding was identified within the assigned corrections.

## Remaining concerns and hand-back

- The local-Skill inventory assertion and repository-wide formatting failures remain documented baseline exceptions; neither was fixed or claimed GREEN here.
- Formatting, lint, type checks, diff whitespace checks, and ticket-wide regression gates were not run by this worker and remain with the controller. Pending controller checks are not implementer failures or evidence of acceptance.
- VS Code Agent discovery/loading with the added frontmatter version remains the scheduled ticket 03 smoke check.
- Staging protects the Agent being replaced from a failed write; it is not a transaction rolling back unrelated Blueprints after arbitrary later filesystem failures. The assigned mixed-kind guarantee covers render/metadata preflight failures before replacements.

Hand-back: the accepted round 2 findings have focused covering evidence on the fingerprint above; controller review and its pending gates remain. No ticket acceptance or tracker transition was performed.

---

# Ticket 01 corrective round 3 of 5

**Status:** DONE_WITH_CONCERNS  
**Checkout:** `/home/sincore/source/spindle`  
**Starting and final revision:** `79d44ff5497ae5f96bca06b5495be4a60dc75f69`  
**Dependencies:** none. Round 1 stopped at the assignment gate without edits; round 2 is the supplied starting implementation.  
**Findings:** 01-CR-004, T01-I01, R2-01, R2-02, all accepted by the controller. The controller ruled arbitrary later-I/O cross-kind rollback nonblocking and out of scope.  
**Commit:** not authorized; nothing was staged or committed.

## Snapshot and preserved work

The supplied fixed tree `67d78c0cca7fc8493c6c25de8db79ac376b576b1` exists. Before editing, the ordered code/test fingerprint matched the supplied `396fd04f453a7bc7ae3343431813d48bf1d7941176bf9cf38623b8c8caef5761`; the index was clean. The final tested snapshot is the same HEAD and reviewed worktree plus the round 3 changes listed below. The SHA-256 of `sha256sum` output for the **same 24 code/test paths, in the same order listed in the round 2 snapshot above**, is:

```text
dc262ee99e3d3a2a6e8a7a2d7e9a432b8782550148d366257503914ad792523b
```

Tracker and report files are excluded from that fingerprint; this report was appended after the final tests. The reviewed 64,993-byte `tests/agents.test.ts` prefix was checked byte-for-byte against the fixed tree, as were the other reviewed implementation files outside the round 3 changes.

The final tracked modifications, including the preserved pre-existing work, are:

```text
.github/agents/shared-r.agent.md
.github/skills/author-blueprint/SKILL.md
.scratch/2026-11-01-agent-instruction-blueprints/issues/01-agent-blueprint-lifecycle.md
GLOSSARY.md
docs/adr/0002-single-file-blueprints.md
src/blueprints/lifecycle.ts
src/blueprints/registry.ts
src/blueprints/skills/handler.ts
src/blueprints/types.ts
src/index.ts
src/install.ts
src/prompts.ts
src/update.ts
src/version.ts
tests/helpers.ts
tests/install.test.ts
tests/reconciliation.test.ts
tests/stubs.test.ts
tests/update.test.ts
```

The existing untracked files remain the five reports `01-code-review.md`, `01-code-slop-review.md`, `01-implementation.md`, `01-round-2-review.md`, and `01-task-review.md` under this feature's reports directory; `src/blueprints/agents/handler.ts`, `src/blueprints/agents/shared-r/AGENT.md`, `src/blueprints/versioned.ts`, `tests/agents.test.ts`, `tests/fail-agent-write.mjs`, and `tests/race-agent-create.mjs`. The index remains clean. Round 3 changed only `src/version.ts`, appended CLI tests to `tests/agents.test.ts`, changed Stack selection in `tests/stubs.test.ts`, and appended this report section. No ticket state, review report, or other implementation file was edited.

## Findings, corrections, and covering evidence

All behavior changes use the confirmed real CLI seam and began with observed failures. The Stack enumeration is a test-only refactor that reused passing production CLI tests.

| Finding | Correction and fresh evidence |
| --- | --- |
| **01-CR-004** | Detect template-controlled version fields before relying on raw YAML, including directives in YAML comments. For both kinds, CLI tests first showed a raw `2.0.0` being reported current even when rendering removed the version; the final focused and relevant suites pass, including the prior inline and multiline whole-field regressions. |
| **T01-I01** | The shared source-version path now examines both explicit version fields and YAML merge sources before deciding whether to render. Agent and Skill CLI cases cover conditional declarations, templated anchor values, direct fields, merge aliases, and flow mappings. Static literals and aliases with unrelated template text, comments, quoted/block scalar examples, shadowed anchors, and nested metadata remain lazy in the covering cases. Existing malformed-installed-Skill errors and Agent warnings pass in the final suite. |
| **R2-01** | A conditional declaration of the referenced anchor, including a tagged or template-generated anchor name, triggers rendered comparison. With Python selected, the CLI replaces an installed `1.0.0` with rendered `2.0.0` rather than reporting it up to date; with the fallback selected, equal installed content remains unchanged. Conditional-only aliases no longer fail from an incomplete projection. The same cases exercise both kinds. |
| **R2-02** | Production CLI selections are generated from `supportedStacks`, including every nonempty combination. Existing independently specified Agent output assertions are unchanged. The seven current combinations passed before the test-only change and in the final suite; a future supported Stack is included in the generated selections rather than silently omitted by a fixed list. |

## RED-to-GREEN evidence

Working directory for every command: `/home/sincore/source/spindle`. The following focused RED checks used `just test::test --test-name-pattern '<pattern>' tests/agents.test.ts`; each exited 1 for the described behavior before its correction:

| Pattern or focused behavior | Observed RED |
| --- | --- |
| `update renders conditional YAML anchors for (Skill\|Agent) versions` | 6 failures: conditional-only anchors produced an unidentified alias for both kinds; fallback and inline-fallback cases silently retained `1.0.0` instead of `2.0.0`. |
| `update renders templated YAML anchor values for (Skill\|Agent) versions` | The initial 4 inline/expression cases reported invalid shipped versions for both kinds. A later attempted multiline fixture was found to resolve to a mapping rather than a SemVer string; it was corrected to a valid folded scalar and is passing coverage, not claimed as a behavioral RED. |
| Tagged fallback anchors and quoted unrelated metadata | 4 failures: tagged selected anchors missed the update, and quoted anchor-like examples caused over-eager rendering. |
| Dynamic anchor names, merge aliases, and comment-controlled version fields | 2 failures per focused check, one for each kind: respectively missed updates, false overwrites, and false up-to-date results. |
| Static shadowed anchors, block-scalar examples, static merge aliases, nested flow metadata, and explicit flow-version precedence | 2 failures per focused check, one for each kind, due to unnecessary rendering of unrelated missing Variables. |
| Conditional and static YAML flow mappings | 4 failures: the conditional case overwrote equal content and the static case unnecessarily rendered, for each kind. |

The first baseline attempt also exposed a test-placement/setup error: the newly written cases were accidentally nested in a filtered existing test, leaving an unused temporary `just` stub. The placement was corrected and only that test-created temporary stub was removed. The corrected baseline passed 9 tests, including both static-kind checks and all seven production Stack combinations. Neither the setup failure nor the invalid multiline fixture was treated as a product RED.

Fresh GREEN checks on the final code snapshot:

```text
just test::test --test-name-pattern 'YAML anchor|templated anchors|shadowed conditional anchors|YAML merge aliases|comment-controlled version fields|YAML flow|flow versions override' tests/agents.test.ts
```

Result: **exit 0; 36 passed, 0 failed**.

```text
just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/agents.test.ts tests/update.test.ts tests/install.test.ts tests/reconciliation.test.ts tests/stubs.test.ts
```

Result: **exit 0; 126 passed, 0 failed**. This includes all seven current production Stack combinations and prior Agent/Skill safety, version, warning, and reconciliation cases. The named pre-existing local-Skill inventory assertion was explicitly excluded; Node's reporter does not count filtered-out tests as skipped.

The test-only Stack enumeration was also checked immediately after the change with `just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/stubs.test.ts`: **exit 0; 8 passed, 0 failed**.

## Self-review, concerns, and pending controller checks

- Self-review found and corrected the setup and fixture issues above, conditional anchor values/names, YAML merge and flow cases, false positives from quoted/block-scalar examples, and top-level flow-version precedence. The final relevant tests were rerun after these corrections.
- The version-dependency check is a targeted lexical analysis of YAML and Nunjucks, not an exhaustive proof for every possible combination of those languages. The controller should scrutinize unusual valid frontmatter beyond the covered examples during re-review.
- The known local-Skill inventory assertion remains excluded, and the controller documented repository-wide formatting failures at baseline. Neither is claimed GREEN here.
- Formatting, lint, type checks, and ticket-wide regression gates were not run by this worker and remain with the controller. Pending controller checks are not implementer failures or evidence of ticket acceptance.
- VS Code Agent discovery/loading with the added frontmatter version remains the scheduled ticket 03 smoke check. No cross-kind transaction was added for arbitrary later I/O failures, per the controller's ruling.

Hand-back: the four assigned findings have focused evidence on the fingerprint above; controller re-review and its pending gates remain. No ticket transition, staging, or commit was performed.

---

# Ticket 01 corrective round 4 of 5

**Status:** BLOCKED  
**Checkout:** `/home/sincore/source/spindle`  
**Starting and final revision:** `79d44ff5497ae5f96bca06b5495be4a60dc75f69`  
**Dependencies:** none. Round 1 stopped at the assignment gate; round 2 fixed other findings; round 3 fixed R2-02 but left or introduced the assigned version-classification defects.  
**Assigned findings:** 01-CR-004, T01-I01, R2-01, R3-01, and R3-02, all accepted by the controller. R2-02 and the other accepted round 2 findings remain preserved in the relevant passing tests. Parked 01-SL-001/002/004 and arbitrary later-I/O cross-kind rollback remain nonblocking and out of scope.  
**Commit:** not authorized; nothing was staged or committed.

## Blocking limitation

The original round 3 reviewer counterexamples now pass, but **the required general static-version lazy no-op is not fully met**. The retained real-CLI tests `static merged Skill versions stay lazy with many unrelated random choices` and its Agent counterpart fail on this valid metadata:

```yaml
---
defaults: &defaults
  version: 1.0.0
  label: "{{ 'abcdefghijklmnopqrstuvwxyzABCDEFG' | random }}"
  description: "{{ variables.not_supplied }}"
<<: *defaults
---
```

With installed version `1.0.0`, every possible label is one alphanumeric character inside the unrelated quoted property, so the version remains `1.0.0`. Instead of reporting up to date, the CLI exits 1 with `attempted to output null or undefined value`. Both tests first verify that the installed entry and Config remain unchanged; the Skill test also verifies that the local supporting file remains unchanged.

The probe in `src/render.ts` conservatively rejects more than 32 alternatives, and `src/version.ts` also bounds total probe runs at 64. Consequently it falls back to full rendering and encounters the unrelated missing Variable. Increasing the thresholds would move, not remove, this counterexample. A sound dependency strategy that keeps such static versions lazy without enumerating arbitrary alternatives is still needed. Other unsupported or uncertain constructs also conservatively fall back to full rendering and may have the same limitation; they were not exhaustively characterized. The broad required semantics are therefore **not claimed complete or accepted**, despite the passing original fixtures.

## Snapshot and preserved work

The supplied reviewed tree `93e5d18fcf6ee5c3c5651bcce19b1bab0c8b003c` exists, the starting ordered 24-path fingerprint matched `2a9266ef1ce23119487be119dd820c50cf332ce0e58cb5c5ca4ca995fdbf9dae`, and the index was clean. The final tested snapshot is the same HEAD plus the existing dirty/untracked implementation, tracker history, and reports and the round 4 changes below. The SHA-256 of `sha256sum` output over the **same ordered 24 code/test paths listed in the round 2 snapshot above** is:

```text
fead10fe143c788cbd2b5794a38bbf8259860a74b8ebd5579dac9d8b91d0511d
```

`src/render.ts` is an additional round 4 code change not present in the earlier 24-path list; its SHA-256 is `757ae2fcbed2670934b67d32b7064c4b56e7e10011c06c6e6e4b5fd7a7bbdfb8`. Tracker and report files are excluded from these fingerprints; this report was appended after the final checks. Nineteen reviewed code/test paths outside the round 4 edits were compared with the supplied tree and were unchanged.

Round 4 changed only `src/version.ts`, `src/render.ts`, `src/blueprints/types.ts`, `src/blueprints/versioned.ts`, `src/blueprints/lifecycle.ts`, `tests/agents.test.ts`, and this append-only report. The test file retains the two failing regressions above. No ticket state, review report, manifest, or unrelated file was edited.

The final tracked modifications, including pre-existing work, are:

```text
.github/agents/shared-r.agent.md
.github/skills/author-blueprint/SKILL.md
.scratch/2026-11-01-agent-instruction-blueprints/issues/01-agent-blueprint-lifecycle.md
GLOSSARY.md
docs/adr/0002-single-file-blueprints.md
src/blueprints/lifecycle.ts
src/blueprints/registry.ts
src/blueprints/skills/handler.ts
src/blueprints/types.ts
src/index.ts
src/install.ts
src/prompts.ts
src/render.ts
src/update.ts
src/version.ts
tests/helpers.ts
tests/install.test.ts
tests/reconciliation.test.ts
tests/stubs.test.ts
tests/update.test.ts
```

The pre-existing untracked files remain the six feature reports `01-code-review.md`, `01-code-slop-review.md`, `01-implementation.md`, `01-round-2-review.md`, `01-round-3-review.md`, and `01-task-review.md`; `src/blueprints/agents/handler.ts`, `src/blueprints/agents/shared-r/AGENT.md`, `src/blueprints/versioned.ts`, `tests/agents.test.ts`, `tests/fail-agent-write.mjs`, and `tests/race-agent-create.mjs`. The index remains clean.

## Findings and covering evidence

Behavior changes used the confirmed public CLI seam and began with observed failing tests; this was not a pure refactor. The controller remains responsible for finding verdicts and acceptance.

| Finding | Change and fresh evidence |
| --- | --- |
| **01-CR-004** | Nunjucks/YAML probing follows the selected conditional metadata and generated anchor names. The reviewer’s partially generated `&v{{ 2 }}` case initially missed the update for both kinds; both cases pass in the final focused check. |
| **T01-I01** | The shared Skill/Agent planner uses the same parsed dependency probe, with conservative fallback to a normal render for uncertainty. Prior conditional, direct/flow metadata, merge-precedence, and static-lazy tests are among the 186 final passing cases. The general lazy limitation above remains open. |
| **R2-01** | The partial-anchor reviewer fixture and additional generated names, aliases, loops, macros, whitespace control, and selected Stack/Variable branches pass for both kinds. The original silent missed update was observed RED before correction. |
| **R3-01** | The reviewer’s transitive merge aliases are covered in both comparison directions and both kinds. Four initial CLI failures became passing cases; equal-version Skill entries and supporting files, Agent entries, and Config are preserved. |
| **R3-02** | The exact merged-anchor/missing-Variable fixture initially failed for both kinds and now passes. Guards, local bindings, filters, deterministic methods, isolated Stack mutations, small random alternatives, and unrelated failing conditions/macros have additional passing coverage. **The 33-choice counterexample above remains failing**, so the broader static-laziness criterion is blocked. |

The old lexical projection was replaced with a Nunjucks-parser/lexer-based probe and gray-matter’s YAML parser, including YAML merge precedence and transitive aliases. Guarded outputs and guarded macro bodies preserve template scope when unrelated expressions fail. The preview uses cloned Stack/Variable data and known Config/defaults; uncertain dependencies use normal rendering rather than a guessed up-to-date result. Bounded random and conditional alternatives are explored only within the stated limits.

When a full render is needed, the compared rendered entry is retained and validated before installation, with source-byte change detection. Selected updates also capture entries before any supporting file is prepared, preventing a supporting template from silently changing the version subsequently installed. Focused RED-to-GREEN CLI cases covered captured nondeterministic versions, comparison-context mutation, same-Skill and cross-kind supporting-file mutation, guard/macro scope, unrelated missing filters/conditions, and small finite random choices.

## Fresh checks

Working directory for every command: `/home/sincore/source/spindle`.

```text
just test::test --test-name-pattern 'partially generated anchor names|transitive merge aliases|static merged .* versions ignore unrelated missing Variables inside the anchor' tests/agents.test.ts
```

**Exit 0: 8 passed, 0 failed.** This is fresh evidence for the original round 3 counterexamples for both kinds.

```text
just test::test --test-name-pattern 'static merged .* versions stay lazy with many unrelated random choices' tests/agents.test.ts
```

**Exit 1: 0 passed, 2 failed.** The Skill and Agent installed-file/Config preservation assertions pass first, but each CLI returns an error instead of the required lazy no-op.

```text
just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/agents.test.ts tests/update.test.ts tests/install.test.ts tests/reconciliation.test.ts tests/stubs.test.ts
```

**Exit 1: 186 passed, 2 failed.** The failures are exactly the two retained many-choice regressions. The named pre-existing local-Skill inventory assertion was explicitly excluded; Node’s reporter does not count name-filtered tests as skipped. All seven current production Stack selections, prior static/conditional regressions, and the original reviewer fixtures are among the 186 passing cases.

Focused REDs followed by GREEN reruns also covered: generated partial anchors (2 failures), transitive aliases in both directions (4), the original static merge case (2), pure context methods (2), bounded unrelated randomness (2), Nunjucks loop scope after a missing output (2), a failing unrelated macro (2), a failing unrelated condition (2), captured nondeterministic versions (2), a supporting template changing the Skill’s installed version (1), and isolated Stack mutations (2). The many-choice RED above remains unresolved and is not represented as GREEN.

## Self-review and pending controller checks

- The bounded fallback is a concrete remaining requirement failure, not merely a pending controller gate. A different dependency approach or an explicit controller ruling on the limitation is required before completion; no scope expansion or controller decision was assumed.
- Probe behavior depends on Nunjucks parser/lexer internals and a synthetic guard extension; it is not an exhaustive proof for arbitrary Nunjucks/YAML programs. The controller should review correctness and resource bounds, including context mutation and the retained entry-render behavior.
- Formatting, lint, type checks, and ticket-wide regression checks were not run by this worker and remain with the controller. Their pending status is not itself an implementer failure or evidence of acceptance.
- The excluded local-Skill inventory assertion and previously documented global formatting failures remain baseline exceptions. VS Code Agent discovery/loading is still scheduled for ticket 03.

Hand-back: the direct reviewer fixtures pass and the partial correction is preserved, but two required CLI no-op regressions fail on the fingerprint above. No ticket transition, staging, commit, or acceptance was performed.

---

# Ticket 01 corrective round 5 of 5

**Status:** BLOCKED  
**Checkout:** `/home/sincore/source/spindle`  
**Starting and final revision:** `79d44ff5497ae5f96bca06b5495be4a60dc75f69`  
**Dependencies:** none. Round 1 stopped at the assignment gate; rounds 2–3 are preserved; round 4 stopped with the two retained 33-choice failures.  
**Assigned findings:** 01-CR-004, T01-I01, R2-01, R3-01, R3-02, and the two retained random-label failures. The controller accepted those findings; R2-02 and other round 2 findings remain preserved. Parked 01-SL-001/002/004 and arbitrary later-I/O cross-kind rollback remain out of scope.  
**Commit:** not authorized; nothing was staged or committed.

## Blocking limitation

The two retained 33-character random-label tests now pass for Skills and Agents, as do the original reviewer fixtures. However, the broader static-version lazy no-op is still not established. The newly retained real-CLI tests `static merged Skill versions stay lazy with independent optional random fields` and its Agent counterpart fail on a merged static `1.0.0` whose six unrelated labels each have an independent, optional random branch and whose unrelated description reads `variables.not_supplied`. For example, each optional branch has this form, with distinct `label0` through `label5`:

```yaml
{% if ['a', 'b'] | random == 'a' %}
  label0: chosen
{% endif %}
```

All possible rendered versions are `1.0.0`, but exploring the independent structural alternatives exceeds the existing 64-run bound. The probe falls back to a normal render, and the CLI exits 1 with `attempted to output null or undefined value` rather than reporting up to date. Both failing tests first verify that the installed entry and Config remain unchanged; the Skill test also verifies its local supporting file remains unchanged.

These branches add or remove YAML keys, so replacing them with an arbitrary scalar or simply raising the bound is not a sound correction. A structure-aware dependency abstraction that can prove the optional keys cannot affect versions, merge precedence, aliases, or anchors is still needed. The focused `update renders optional random ... fields that can change the version` checks pass for both kinds: the conservative fallback renders and installs a genuinely changed version rather than silently reporting up to date. Other expressions and structural alternatives outside the bounded-safe abstraction can likewise fall back to full rendering. No general completion or ticket-acceptance claim is made.

## Snapshot and preserved work

The supplied HEAD, clean index, dirty/untracked inventory, blocked tree `dbf9dac882c5f404e70f5fca5281486dc8290725`, and ordered starting fingerprint `8136f85dd942233e9fd4a70c2a887dc07257f5e6f04c99556278076d1d2ec541` were confirmed before editing. Round 5 changed only `src/version.ts`, added CLI tests to the existing `tests/agents.test.ts`, and appended this report. All pre-existing Agent tests, including both round 4 failures, were verified unchanged; all other code/test paths were verified against the supplied blocked tree. Existing tracker history and review reports were not edited.

The exact final tested snapshot is the revision above plus the dirty/untracked worktree listed below, before this append. The SHA-256 of `sha256sum` output over these **25 paths in this order** is `c5eeadbafa803cafc3b227cd9ce7f755afa53ed9203abadaa1761f98ecd8de84`:

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
src/render.ts
src/update.ts
src/version.ts
tests/agents.test.ts
tests/fail-agent-write.mjs
tests/helpers.ts
tests/install.test.ts
tests/race-agent-create.mjs
tests/reconciliation.test.ts
tests/stubs.test.ts
tests/update.test.ts
```

Individual final hashes: `src/version.ts` `150ef92ba541e3e79ffaa47ab58b19cf643a62ecd458e2ad4c8eff73096dd625`; `tests/agents.test.ts` `71a32c165a1eb46bb3813108a9796858be42770c2cf0710f6dbff86bd4f06049`. Tracker and report files are excluded from the fingerprint; this report was appended after the checks.

The dirty tracked paths, including preserved starting work, are:

```text
.github/agents/shared-r.agent.md
.github/skills/author-blueprint/SKILL.md
.scratch/2026-11-01-agent-instruction-blueprints/issues/01-agent-blueprint-lifecycle.md
GLOSSARY.md
docs/adr/0002-single-file-blueprints.md
src/blueprints/lifecycle.ts
src/blueprints/registry.ts
src/blueprints/skills/handler.ts
src/blueprints/types.ts
src/index.ts
src/install.ts
src/prompts.ts
src/render.ts
src/update.ts
src/version.ts
tests/helpers.ts
tests/install.test.ts
tests/reconciliation.test.ts
tests/stubs.test.ts
tests/update.test.ts
```

The untracked paths remain the six feature reports `01-code-review.md`, `01-code-slop-review.md`, `01-implementation.md`, `01-round-2-review.md`, `01-round-3-review.md`, and `01-task-review.md`; `src/blueprints/agents/handler.ts`, `src/blueprints/agents/shared-r/AGENT.md`, `src/blueprints/versioned.ts`, `tests/agents.test.ts`, `tests/fail-agent-write.mjs`, and `tests/race-agent-create.mjs`. The index remains clean. Before this append, the report was 42,220 bytes with SHA-256 `93e8fa8475c9cb3905a13a6f721183f43346f82953980f5347a36fd8bf942508`.

## Finding-to-change and covering evidence

All behavior changes used the confirmed real CLI seam and began with observed failures; this was not a pure refactor. The evidence below is for the final fingerprint, not a controller finding verdict.

| Finding or criterion | Partial correction and fresh evidence |
| --- | --- |
| **01-CR-004 / T01-I01** | The prior conditional whole-field and generated-anchor regressions pass for both kinds. Pure random conditions can be over-approximated; a narrow join for directly emitted branches avoids a Cartesian product when the only difference is safe alphanumeric text. The optional-structure limitation above leaves general lazy conditional metadata incomplete. |
| **R2-01** | The exact partially generated `&v{{ 2 }}` reviewer case passes for Skills and Agents. Random-generated anchors, keys, and version-affecting branches also pass; condition mutations and errors remain observable. |
| **R3-01** | Transitive merge aliases pass in both comparison directions and both kinds, including preservation of equal-version Skill supporting files and Config. |
| **R3-02** | The exact missing-Variable-in-merged-anchor fixture passes for both kinds, as do the retained 33-choice cases and seven independent random scalar labels. General laziness remains blocked by the six optional structural branches above. |
| **Captured rendering and prior behavior** | Direct and composed random versions, capture/macro-controlled versions, YAML binary-decoded keys, injected YAML structure, whitespace-controlled branches, merge precedence, and context mutation have passing CLI safeguards. The final relevant suite also includes all seven current production Stack selections and prior lifecycle regressions. |

The new abstract scalar domain is restricted to directly emitted, nonempty alphanumeric literal choices and their safe concatenation/case conversion. The YAML listener rejects marker-erasing scalar conversions, while marker-bearing versions, keys, and generated anchors force a normal render. Direct branch joins preserve template tag boundaries and are limited to pure conditions with literal branches whose differing text is nonempty alphanumeric. Captures, macros, side effects, unknown expressions, and structural uncertainty are not assumed safe.

## Fresh checks and RED-to-GREEN evidence

Working directory for every command: `/home/sincore/source/spindle`.

- The retained 33-choice tests and the added seven-independent-label tests first ran **RED: 0 passed, 4 failed**, all on the unrelated missing Variable, then passed after the scalar abstraction.
- The decoded YAML binary key safeguard exposed a false up-to-date result **RED for both kinds**, then passed after detecting marker-erasing scalar conversions. Composed random labels and a single unrelated high-cardinality random condition each had **2 RED failures** followed by GREEN checks.
- Six independent random conditions with literal scalar-only branch differences had **2 RED failures** followed by GREEN checks. A whitespace-control counterexample introduced by branch joining had **2 RED false-no-op failures** and passed after preserving Nunjucks tag boundaries.
- The newly retained six-optional-field tests ran **RED: 0 passed, 2 failed** and remain failing. No passing result is claimed for them.

```text
just test::test --test-name-pattern 'partially generated anchor names|transitive merge aliases|static merged .* versions ignore unrelated missing Variables inside the anchor|static merged .* versions stay lazy with (independent random labels|many unrelated random choices|composed random labels|an unrelated random condition|independent random conditions)|update notices a random .* version key decoded from YAML binary|update preserves whitespace control (before|after) a random .* version branch|update respects random .* dependencies for (Skill|Agent)s|update installs the compared composed random .* version|update (preserves mutations|reports errors) in random .* version conditions|update renders optional random .* fields that can change the version' tests/agents.test.ts
```

**Exit 0: 62 passed, 0 failed.** This focused command includes the original reviewer cases and retained 33-choice tests; it does not select the two failing optional-field no-op tests.

```text
just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/agents.test.ts tests/update.test.ts tests/install.test.ts tests/reconciliation.test.ts tests/stubs.test.ts
```

**Exit 1: 242 passed, 2 failed.** The failures are exactly the optional-field Skill and Agent tests described above. The known pre-existing `only author-blueprint remains a local skill` inventory assertion was explicitly excluded; Node's reporter does not count filtered-out tests as skipped.

## Self-review, unrun checks, and hand-back

- The required static-version laziness remains concretely incomplete; the two failed implementer checks block completion. The partial implementation and all tests are retained for the controller rather than hiding or weakening the counterexample.
- The probe uses Nunjucks parser/lexer and YAML listener internals, and its conservative abstraction is not an exhaustive proof for arbitrary Nunjucks/YAML. The controller should scrutinize the new branch join, scalar conversion tracking, resource bounds, and captured-entry behavior.
- Formatting, lint, type checks, and ticket-wide regression gates were not run by this worker and remain with the controller. Pending controller checks are not themselves implementer failures or evidence of acceptance. The known inventory assertion was excluded, and the controller's earlier global formatting baseline remains documented.
- VS Code Agent discovery/loading with the added frontmatter version remains scheduled for ticket 03.

Hand-back: the original 33-choice failures and reviewer fixtures pass on the fingerprint above, but six optional random fields still force a failing full render for each kind. No tracker transition, staging, commit, or acceptance was performed.

# Ticket 01 corrective round 6 (maintainer-authorized, strategy A)

**Status:** DONE  
**Checkout:** `/home/sincore/source/spindle`  
**Starting and final revision:** `79d44ff5497ae5f96bca06b5495be4a60dc75f69` (HEAD unchanged; index clean)  
**Starting fingerprint:** `cb130f42fa1dceb57d602543b36ba0500bdf38a8f5a752df0504e1b8ef7053e8` (supplied)  
**Authority:** ticket comment 2026-11-01T21:27:16Z and spec Implementation Decisions bullet "Read a source version statically only when its frontmatter contains no Nunjucks syntax…"  
**Findings:** 01-CR-004, T01-I01, R2-01, R3-01, R3-02, re-scoped to the strategy A ruling.  
**Commit:** not authorized; nothing was staged, stashed, reset, or committed.

## Changes

- `src/version.ts`: removed the Nunjucks parser/lexer probe, the random-choice and branch exploration, the YAML anchor/alias/merge dependency analysis, and the preview options (`allowUnrenderedMetadata`, `previewContext`). It is now 95 lines and close to `79d44ff:src/version.ts`. `readBlueprintVersion` parses raw frontmatter with gray-matter, or renders the whole entry with the given context (cloned) and captures it through `onRendered`. The new `blueprintFrontmatterIsTemplated` is the only trigger: it returns true when the frontmatter block (from the opening `---` through the closing `\n---`) contains `{{`, `{%`, or `{#`. If no frontmatter block can be delimited statically, it checks the whole file, because template syntax could generate the frontmatter. BigInt SemVer comparison is kept.
- `src/render.ts`: `renderVersionProbe` and the probe guard types were removed. The file is now byte-identical to base and no longer appears in `git status`.
- `src/blueprints/versioned.ts`: removed the preview-context derivation (and its `loadVariableDefinitions` import). Shared Skill/Agent/Instruction planning now calls `resolveContext()` and renders only when `blueprintFrontmatterIsTemplated(source)`. Captured `renderedEntry`, the installed-version warning/error policy, and the version-changed-while-planning check are unchanged.
- `src/blueprints/types.ts` and `src/blueprints/lifecycle.ts`: removed the `preview` field from `BlueprintUpdateInput` and the code that populated it. Every other lifecycle behavior is unchanged, including safe replacement, symlink checks, preflight, kind-aware output, and captured entry reuse.
- No changes to `skills/handler.ts`, `agents/handler.ts`, `update.ts`, `install.ts`, or the docs. The guide and ADR do not describe the probe or laziness.

## Tests (real-CLI seam)

| Test change | Contract |
| --- | --- |
| Added `update reads static ${kind} frontmatter without rendering the entry` (Skill/Agent): plain and merged static `1.0.0`, with `Unused {{ variables.not_supplied }}` in the body | (a) up to date, installed entry, Skill supporting file, and Config unchanged |
| Added `update renders templated ${kind} frontmatter before reading a literal version` (Skill/Agent): static `1.0.0` with a missing Variable in a sibling field, inside a merged anchor (the R3-02 fixture), alongside an optional random field (replaces the round 5 failing test), and in a YAML comment with `{#` | (b) the frontmatter is rendered, the normal render error (`null or undefined`) is reported, and nothing is changed |
| Added `update keeps an equal templated ${kind} version without replacing it` (Skill/Agent): templated anchor, conditional merged defaults | (b)+(c) renders, equal `1.0.0` is up to date, nothing replaced |
| Removed 25 `static …` test definitions (50 runs) from `tests/agents.test.ts`, including the 33-choice/many-random-choice tests and the "stays lazy"/"remain lazy"/"ignore … missing" cases | Each asserted laziness under templated frontmatter or exercised probe internals, so each contradicts the ruling |
| `tests/update.test.ts`: the base test `static Skill versions ignore unrelated templated metadata during no-op update` was rewritten as `static Skill frontmatter ignores an unrelated templated body during no-op update` (the template moved from `description` to the body); the quoted/spaced-key test was rewritten to static frontmatter; the two "conditional metadata"/"raw text" laziness tests were removed | (a); the pre-existing base test encoded the old requirement that strategy A replaces |

The existing `update renders …` tests (conditional, comment-controlled, tagged, and dynamic-name anchors; templated anchor values; merge/flow/transitive aliases; partially or wholly generated anchors; random version branches; captured install consistency) are kept unchanged and pass. Together they cover (b) and (c) for anchors, aliases, and merges.

RED→GREEN: `just test::test --test-name-pattern 'reads static .* frontmatter without rendering|renders templated .* frontmatter before reading|keeps an equal templated' tests/agents.test.ts`. RED: 4 passed, 2 failed. Both kinds failed on `templated frontmatter before reading a literal version` because the probe stayed lazy and exited 0. The static and equal-version cases already passed as baseline coverage. GREEN after the implementation: 6 passed, 0 failed. Running the full Agent file then showed exactly the 50 removed laziness runs failing. After the removals and rewrites, the update tests that encoded the old laziness were handled as described above.

## Per-finding resolution

- **01-CR-004 / T01-I01:** Any template syntax in frontmatter, including comment directives and conditional or whole fields, now forces a render with the resolved update context. Raw templated YAML is never used to read a version.
- **R2-01:** Partially or wholly generated and conditional anchors are covered by the render rule. The existing `partially generated anchor names` and `wholly generated YAML anchors` tests pass for both kinds.
- **R3-01:** Transitive merge aliases render and compare correctly in both directions, and equal content (including Skill supporting files and Config) is left untouched. The existing tests pass.
- **R3-02:** Re-scoped. A missing Variable inside a templated merged anchor now follows normal render behavior: an error with nothing changed. The new test covers this for both kinds.
- **Round 5 blocker:** Resolved by requirement. The optional-random-field fixture renders and reports the normal error. There is no bounded exploration.

## Fresh checks (working directory `/home/sincore/source/spindle`, final snapshot)

- `just test::test --test-skip-pattern 'only author-blueprint remains a local skill' tests/*.test.ts` → exit 0; **243 tests, 243 passed, 0 failed**, 0 skipped, 0 cancelled. The count is 291 − 2 (replaced) + 6 (new) − 50 (removed laziness runs) − 2 (removed update tests).
- `just test::types` → exit 0.
- `just lint::check` → exit 0 (oxlint, no diagnostics).
- `just format::check src/version.ts src/render.ts src/blueprints/versioned.ts src/blueprints/types.ts src/blueprints/lifecycle.ts tests/agents.test.ts tests/update.test.ts` → it first failed on the two test files. I ran `just format::format tests/agents.test.ts tests/update.test.ts`, and the recheck exited 0. All suites above were rerun after formatting.
- `just tool::git diff --check` → exit 0.
- `grep` for `renderVersionProbe|probeBlueprintVersion|blueprintVersionIsTemplated|allowUnrenderedMetadata|previewContext|nunjucksInternals` in `src` and `tests` → no matches.

## Snapshot

Tested snapshot: HEAD `79d44ff` plus the dirty and untracked worktree. The SHA-256 of `sha256sum` output over the same 25 paths, in the same order as round 5, is `4a3c43bd8bca1830ed55074026c68de45bb16bf94b935f768d5c4d61f1c0813b`. Individual hashes: `src/version.ts` `bd26f48b…f142f6`, `src/blueprints/versioned.ts` `9783dee7…c5b4`, `tests/agents.test.ts` `b532b3f0…df95`, `tests/update.test.ts` `d0d576ad…df11`. `src/render.ts` now matches base. The tracker and spec (controller-owned) were not touched; this report was appended after the checks.

Changed this round: `src/version.ts`, `src/render.ts` (reverted to base), `src/blueprints/versioned.ts`, `src/blueprints/types.ts`, `src/blueprints/lifecycle.ts`, `tests/agents.test.ts`, `tests/update.test.ts`, and this report.

## Self-review and concerns

- Behavior trade-off, by ruling: templated frontmatter now renders the whole entry. A missing Variable anywhere in such an entry fails the update even when the version is a literal. This is the normal render behavior the maintainer accepted.
- A pre-existing base test that encoded the old laziness (`static Skill versions ignore unrelated templated metadata…`) was rewritten rather than kept. The controller should confirm this matches the ruling.
- Pending with the controller: the ticket-wide regression gate, the full-repo formatting baseline, scoped re-review against this fingerprint, and the VS Code Agent loading check scheduled for ticket 03. These pending checks are not implementer failures or evidence of acceptance.
