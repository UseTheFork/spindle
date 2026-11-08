# 09: Integrate through caller-owned commits

Reporter: User
Category: enhancement

**What to build:** A controller receives a safe accepted-file hand-back, makes a
commit externally, and asks the CLI to verify that existing commit before
integration is recorded and dependent issues become ready.

**Blocked by:** 06: Register findings and enforce explicit rulings.

**Status:** ready-for-agent
**Execution:** accepted

- [X] `integrate` requires accepted work with current evidence and validates the frozen controller-confirmed Git inventory. It returns exact accepted files and delivery records requiring a caller-owned commit.
- [X] Changed accepted content, unresolved blockers, stale evidence, or unsafe unrelated pending changes produce explicit nonzero errors without altering user work or silently broadening scope.
- [X] `integrate --commit <sha>` verifies an existing caller-created commit's delivered content against accepted content and baseline/provenance, rejects mismatches, and only then records execution `integrated`.
- [X] The CLI does not stage, commit, stash, discard, push, publish, or close issues. Inventory comes from Git rather than a separate ownership registry or inferred filename intent.
- [X] Verification supports the original dirty-content review becoming committed without losing valid identical-content evidence. Generated audit/report changes remain outside code identity.
- [X] Integration confirmation returns resulting delivery-record changes for the caller to commit before the next claim, without an endless confirmation loop. Repeated confirmation is idempotent.
- [X] Integrated prerequisites become ready-queue eligible. A subsequent claim still rejects uncommitted delivery records and records its own clean baseline only after the caller commits them.
- [X] Public CLI tests use real caller-created commits to verify hand-back, mismatch/unsafe-change failures, no Git mutations by commands, repeat confirmation, evidence preservation, and dependent-issue readiness.
- [X] Related integration/help guidance explains prepare-and-confirm and record commits; Just-based validation covers the completed hand-back behavior.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments

**2026-11-08T09:26:37Z - @Copilot**
Claimed issue 09 from clean baseline `036c497929ec17e7a155b2dbc87e61041dc7fb78`; issue 06 is integrated, satisfying the declared dependency. Controller author is `Copilot`. Implementation is limited to issue 09 integration behavior; worker commits are not authorized. Durable implementation handoff: `../reports/09-implementation.md`.

**2026-11-08T10:26:43Z - @Copilot**
Frozen for comprehensive issue-09 Spec/Quality review at base/HEAD `036c497929ec17e7a155b2dbc87e61041dc7fb78`. Exact implementation file SHA-256 values: `docs/agents/issue-tracker.md` `5d562c1f5b32882bcc1b537ffc107126ac7d93f4c193ede8160fcccaa3656d64`; `docs/agents/tooling.md` `98f9f5635bc4cd89c40c34a14c6953ccc4b9563428c5bbf4207d398348767387`; `src/blueprints/agents/sdd-orchestrator.agent.md` `4fd9ab0fa15833ba3b31df21bf53cd96f4a176a38b46fc7c9925b5722e4ee311`; `src/blueprints/skills/int-subagent-driven-dev/SKILL.md` `bb5a7231ef251eb5c198f37174cfeb77a0d1205718d9e2f90652bb6be7826895`; `src/blueprints/skills/int-subagent-driven-dev/references/integration.md` `e56da0d53dede898fd8526a24b951392cf5790f33ac33447cf9868d41da3df2e`; `src/commands/sdd/sdd-command.ts` `2f0c0fa516e7a341bfa68be1f4399ca85b5a1b87a4d7792bc9a6843a325309c6`; `tests/sdd-workflow.test.ts` `cab9ccee91c4cf30e9ccb28c40f7645ffe3f6da06966923e228f37080616c332`. Controller-owned issue tracking/report paths are excluded from product identity. Controller checks passed: format, targeted lint, type-check, build, diff check; focused SDD/catalog/install regressions 117/117; packaged CLI tests 5/5. Full suite not run. Implementer reports TDD RED/GREEN for core hand-back and stale-check/claim diagnostic cases, but GREEN-only historical evidence for caller-commit success/mismatch and dependency readiness cases. Review that limitation honestly without manufacturing tests. Review report destination: `../reports/09-review.md`.

**2026-11-08T10:32:58Z - @Copilot**
Initial review `../reports/09-review.md` returned Spec/Quality FAIL with two blocking Important findings: `I09-R1` arbitrary pending files under the feature workspace are broadly treated as delivery records; `I09-R2` divergent staged/index content for an accepted file can evade caller-commit confirmation when the worktree is restored to accepted bytes. One corrective attempt is authorized to restrict allowed feature-workspace pending changes to known workflow-owned record paths and reject unrelated `.scratch/<feature>/` changes; and to compare staged accepted-file content/mode against the accepted content/commit before marking integrated. Add public CLI regressions for an unrelated feature-workspace file (nonzero, no user/workflow mutation) and a real caller commit followed by divergent staged bytes with restored worktree (nonzero, preserve staged/worktree state and accepted execution). Prior attempts: none. Prior progress: core integration flow and 117-test suite pass; independent review identified two concrete authorization gaps. Proceed; both have direct tests.

**2026-11-08T11:31:52Z - @Copilot**
Corrective attempt 1 is frozen for scoped Spec/Quality re-review of `I09-R1` and `I09-R2`. Prior attempt: none; demonstrated progress: both blocking findings have direct public CLI regressions, and the implementer reports both passed. The corrected product snapshot is HEAD `036c497929ec17e7a155b2dbc87e61041dc7fb78` plus the original issue-09 product changes and corrective edits; controller issue/report files are excluded from product identity. Corrective source/test SHA-256: `src/commands/sdd/sdd-command.ts` `c2db9b6a1ed67a8a4c7143ed3bc9d0e5b41bc15117c6661b8de37c81c08c6c59`; `tests/sdd-workflow.test.ts` `88f6ef61942010c16ccdea3184e90dd8ee5bdb254e41c55b085cc492accb04e6`. Other original issue-09 product file hashes remain as recorded above. Controller checks on this snapshot: `just format::check` (all seven product files), `just lint::check` (command and test), `just test::types`, `just build`, `just tool::git diff --check`, and `just test::test tests/sdd-workflow.test.ts tests/sdd-issues.test.ts tests/sdd-create-status.test.ts tests/catalog.test.ts tests/install.test.ts` passed (**119/119**, 0 skipped); `just test::test tests/packaged-cli.test.ts` passed (**5/5**). Full repository suite not run. Review destination: `../reports/09-round-1-review.md`. Nonblocking context for the reviewer: the initial report noted direct-child-of-baseline ancestry is stricter than user-facing guidance, and the corrective report notes no isolated mode-only regression; neither was an assigned finding.

**2026-11-08T11:36:00Z - @Copilot**
Controller ruling: scoped corrective review returned Spec/Quality PASS, addressed `I09-R1` and `I09-R2`, and no new findings. Initial comprehensive review covers the original issue-09 scope; current controller-verified focused, packaged CLI, format, lint, type, build, and diff checks cover the corrected snapshot. The full repository suite was not run. Issue 09 is accepted. Nonblocking follow-up parked: clarify/document the direct-child-of-baseline commit constraint and test the intended supported history shape in a separate follow-up; this is not an acceptance blocker because the delivered commit is still checked against the recorded baseline and exact accepted paths/content.
