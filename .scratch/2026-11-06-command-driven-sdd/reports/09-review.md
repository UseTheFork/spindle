# Issue 09 review — Integrate through caller-owned commits

## Scope and snapshot

- **Phase/scope:** Initial comprehensive Spec/Quality review of issue 09.
- **Workspace:** `/home/sincore/source/spindle`.
- **Supplied base and HEAD:** `036c497929ec17e7a155b2dbc87e61041dc7fb78`.
- **Reviewed identity:** supplied HEAD plus the seven frozen implementation paths and their supplied SHA-256 values. I independently checked all seven hashes; they match the issue's freeze comment. The controller-owned issue edit and implementation report are excluded from product identity.
- **Change:** complete working-tree diff for the seven frozen product files, including untracked file inventory. No binary changes. The implementation report and issue edit were read as handoff/context, not treated as product changes.
- **Canonical requirements and decisions:** issue 09 and its freeze comment; feature `spec.md` (especially “Evidence and Git integration” and testing decisions); feature `design.md` (storage/ownership, command surface, workflow fidelity/evidence); `GLOSSARY.md`; repository `docs/agents/domain.md`, `docs/agents/issue-tracker.md`, and `docs/agents/tooling.md`; ADR-0003 and ADR-0004; and the supplied implementation report. Issue 08’s accepted scope ruling confirms issue 09 owns caller-commit integration. No repository `AGENTS.md` was present.
- **Dependencies/history:** issue 09 declares issue 06 as a dependency; the supplied controller input says issues 06, 07, and 08 are integrated. No prior issue-09 findings or rulings were supplied (`NONE`).

## Evidence and limitations

- **Controller-supplied same-snapshot evidence** (not run by me): format check on all seven product files, targeted lint, type-check, build, and diff check passed; focused SDD/catalog/install tests passed **117/117**; packaged CLI tests passed **5/5**. The full repository suite was not run.
- **Implementation report attribution:** reports public CLI coverage and RED/GREEN evidence for hand-back, stale accepted-check evidence, and the uncommitted-delivery claim diagnostic. It discloses that caller-commit success/mismatch and readiness tests were added after implementation and have GREEN but no historical RED. I did not independently verify historical RED logs. Current GREEN coverage is relevant; missing historical RED alone is not a defect under the TDD review standard.
- **Personally inspected:** all seven frozen hashes, complete diff, relevant surrounding command and identity code, public CLI tests, integration help/guidance, issue/spec/design, and applicable repository decisions. I ran no project checks.
- **Coverage gaps:** public CLI tests exercise real caller-created commits, successful confirmation, a blob mismatch, stale evidence, hand-back, idempotency, and dependent readiness. They do not cover arbitrary unrelated files inside the feature workspace, staged index content differing from accepted worktree content, or mode/path mismatch cases. Full-suite status remains unavailable.

## Spec

**Verdict: FAIL**

| Issue 09 criterion | Assessment |
|---|---|
| Accepted work, current evidence, frozen inventory, and safe hand-back | Implemented and exercised for the normal accepted-file flow. However, the safe-pending-change gate treats every changed path below the feature `.scratch` directory as an acceptable delivery record; see `I09-R1`. |
| Reject changed accepted content, blockers, stale evidence, and unsafe unrelated changes without modifying user work | Most checks and state-preservation behavior are present and tested. A divergent staged index version of an accepted file can evade the confirmation gate; see `I09-R2`. |
| Verify caller-created commit against accepted content, baseline, paths, and modes | Code requires the commit at HEAD, a direct child of the recorded baseline, an exact baseline-to-commit path set, and matching tree content/modes. Public tests use real commits and check blob mismatch; path/mode/ancestry failure cases are not separately covered. |
| No Git mutation; Git-derived inventory rather than an ownership registry or filename-intent inference | The CLI reads Git and updates only workflow documents/ledger; no stage/commit/stash/discard/push/publish/close action was found. The returned accepted inventory comes from the frozen review. |
| Preserve evidence as accepted dirty content becomes committed | The normal exact-content transition is explicitly supported by stored content digest and integration-preservation logic and has public coverage. The staged-index divergence gap in `I09-R2` means evidence is not always rejected when a Git content layer has changed. |
| Return delivery-record changes, idempotency, and no confirmation loop | Confirmation returns changed feature-workspace paths and same-commit confirmation is idempotent. Scope of the returned paths is too broad (`I09-R1`). |
| Dependent readiness and later clean baseline | Public CLI test confirms the prerequisite's delivery records must be committed before claim, then the dependent claim records the post-commit HEAD. |
| Public tests, guidance/help, and Just validation | Public tests use caller-created commits. Command help, integration reference, SDD skill, orchestrator guidance, issue-tracker and tooling docs explain prepare/confirm and caller-committed records. Controller reports the required Just-based verification passed. Guidance's promise that `deliveryRecords` are workflow documents/reports/ledger changes conflicts with the broad implementation behavior in `I09-R1`. |

## Quality

**Verdict: FAIL**

Strengths: the implementation keeps commits caller-owned; validates accepted inventory and report/check freshness; verifies an existing commit's baseline-relative path set and tree bytes/modes; persists integration only after confirmation; and provides public end-to-end coverage for the ordinary commit flow, a blob mismatch, idempotency, and dependent readiness. The focused current test and build evidence is fresh for the matching frozen file hashes.

The two blocking findings below permit unsafe pending Git state to be passed through integration. Public tests do not currently cover either case. The partially post-implementation RED history is transparently disclosed and is not independently a defect.

## Findings

### I09-R1 — Arbitrary feature-workspace changes are accepted as delivery records

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:4822-4854` (`#assertSafeIntegrationChanges`, `#deliveryRecordPaths`).
- **Defect:** `#assertSafeIntegrationChanges` exempts every changed path under `.scratch/<feature>/`, and `#deliveryRecordPaths` returns every such path (except the transient lock) as a delivery record. Thus an unrelated user file such as `.scratch/0001-feature/notes.txt` is neither rejected as unsafe nor distinguished from workflow documents, reports, and ledger changes.
- **Impact:** `integrate` silently broadens the caller hand-back and can direct the caller to commit unrelated user data as a delivery record. This contradicts the explicit unsafe-unrelated-change rejection and the guidance that delivery records are workflow documents/reports/ledger changes.
- **Required correction:** Restrict the allowed hand-back to feature-workspace state actually generated/owned by this workflow and reject other pending paths, while preserving the no-Git-mutation rule. Add a public CLI test with an unrelated pending file inside the feature workspace and verify nonzero exit plus unchanged user data and workflow state.

### I09-R2 — Confirmation ignores divergent staged content for accepted paths

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:4089-4104` and `:4157-4217`.
- **Defect:** Confirmation computes the current `identity`, but only compares its requirements snapshot to accepted requirements. It checks inventory by path and checks `#worktreeContentDigest`, which reads working-tree bytes/mode but not the index. The subsequent acceptance-blocker check uses a synthetic `acceptedIdentity`, and commit-tree verification checks the supplied commit, not whether the current index still represents the accepted content. Consequently, after creating the correct caller commit, a caller can stage different bytes for an accepted path and restore the worktree to the accepted bytes; the path inventory and worktree digest still match, so `integrate --commit` can record `integrated` while a divergent staged version remains.
- **Impact:** Integration confirmation can overlook changed staged content even though the feature's content identity explicitly includes index entries. It can report accepted evidence as preserved while the current index contains non-accepted content.
- **Required correction:** At confirmation, verify staged/index content and Git mode for accepted paths against the accepted content/commit, and reject any divergent staged state rather than relying only on path membership and working-tree bytes. Add a public CLI regression using a real caller commit, then stage divergent accepted-file content and restore the worktree; confirmation must fail without changing the staged or working-tree content or execution state.

## Observations and remaining context

- The direct-child-of-baseline requirement is stricter than the explicit user-facing guidance, which says to commit accepted files and confirm that commit. The tests do not exercise intervening commits. Clarify/document the intended ancestry constraint or cover a supported history shape; I have not classified this as a separate blocking finding because the current single-commit caller flow is demonstrated.
- Caller-supplied checks include packaged CLI tests (5/5); the implementation report's statement that those tests were not run is attributable to the implementer, not contradictory evidence about the controller run.
- No other review findings. No acceptance or integration decision is made here.
