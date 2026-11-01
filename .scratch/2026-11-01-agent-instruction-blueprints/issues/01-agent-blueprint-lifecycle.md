# 01: Installing and Updating an Agent Blueprint

Category: enhancement
Status: ready-for-agent
Execution: integrated
Reporter: unknown

**What to build:** Make a versioned Agent Blueprint install and update end to end through Spindle's existing CLI, while preserving the Skill workflow. Ship `shared-r` as the first Agent vertical slice and establish the shared single-file lifecycle behavior needed by later Agents and Instructions.

**Blocked by:** None (can start immediately).

- [ ] `init` installs the Agent entry file directly into the Agents directory using its Agent filename, and its user-facing result identifies the Agent kind.
- [ ] Agent Blueprints support the declared `AGENT.md` entry file and selected Stack overlays; reject unexpected planned files and duplicate outputs before changing installed content.
- [ ] An Agent with no entry file for the selected Stacks is omitted. Missing or empty kinds are skipped when other kinds have Blueprints; fail clearly if every registered kind is empty.
- [ ] The actual Agent destination is checked for conflicts and symlinks. Existing conflict policies apply to single-file destinations.
- [ ] Agent frontmatter requires a rendered SemVer version. `update` detects newer versions, leaves equal or newer installed versions unchanged, and skips installed files with missing or invalid versions with a warning.
- [ ] Generalized version handling preserves current Skill update behavior, including templated versions and warnings.
- [ ] Source versions are read statically only when the frontmatter has no Nunjucks syntax. Otherwise the frontmatter is rendered with the resolved update context, with no partial template or YAML dependency analysis.
- [ ] New-Blueprint selection, conflict/outdated prompts, outcomes, summaries, and CLI help identify kinds and work for both Skills and Agents.
- [ ] Ship `shared-r` with version `1.0.0`; its installed content is valid Agent Markdown.
- [ ] Preserve the behavior that installed unversioned Agent files are skipped with a warning rather than automatically adopted or overwritten.
- [ ] Update the local authoring guide with Agent Blueprint authoring rules; define Agent and Instruction in the glossary and record the single-file lifecycle choice in ADR 0002.
- [ ] CLI integration tests cover Agent installation, update/version cases, conflicts, overlay behavior, kind-aware output, and preservation of existing Skill behavior.

## Comments

**2026-11-01T12:42:49Z - @copilot**
Execution: claimed; checkout `/home/sincore/source/spindle`, base `79d44ff5497ae5f96bca06b5495be4a60dc75f69`, no pre-existing worktree changes. The selected CLI/lifecycle baseline passed 55 tests; the unfiltered local-Skill inventory assertion and repository-wide formatting have pre-existing failures. Types and lint passed.

**2026-11-01T12:43:38Z - @copilot**
Execution: implementing; snapshot `79d44ff` plus this tracker change; dispatching the ticket 01 implementation with the confirmed CLI test seam.

**2026-11-01T13:12:29Z - @copilot**
Execution: in-code-review; base `79d44ff`, checked code fingerprint `74456b08ad8b50ed3ef41048505e00d46e59cbd94ea77c4921b992d599ebb089`. Changed-file formatting, lint, types, and 115 CLI/regression tests passed; the pre-existing local-Skill inventory assertion was excluded. VS Code loading remains scheduled for ticket 03.

**2026-11-01T13:12:29Z - @copilot**
Execution: in-review; the same code snapshot is frozen for parallel code, code-slop, and task reviews.

**2026-11-01T13:43:46Z - @copilot**
Execution: changes-requested; reviewed code tree `2704056fc6dbf45951882747cf27a8284cfbeea5`, fingerprint `74456b08ad8b50ed3ef41048505e00d46e59cbd94ea77c4921b992d599ebb089`. Round 1 of 5 is reserved. Accepted blocking findings: 01-CR-001/T01-I04 (failed replacement loses content), 01-CR-002 (recursive deletion of a directory target), 01-CR-003/T01-I03 (cross-kind partial initialization), 01-CR-004/T01-I01 (conditional frontmatter), T01-I02 (changed Skill parse-error behavior), and T01-I05 (glossary definitions). Adopt T01-M01 (independent production assertions) and 01-SL-003 (shared version validation). Park 01-SL-001, 01-SL-002, and 01-SL-004 as nonblocking: broader safety/planning or fixture refactors are not needed to correct the blocking behavior and can be reassessed in aggregate review. Reports: [code review](../reports/01-code-review.md), [code-slop review](../reports/01-code-slop-review.md), and [task review](../reports/01-task-review.md).

**2026-11-01T13:43:46Z - @copilot**
Execution: implementing; corrective round 1 of 5 against reviewed tree `2704056fc6dbf45951882747cf27a8284cfbeea5`.

**2026-11-01T13:45:21Z - @copilot**
Execution: changes-requested; round 1 stopped at the assignment gate with `NEEDS_CONTEXT` for the absolute design pointer and confirmation that comments are in the ticket. No implementation files changed; fingerprint remains `74456b08ad8b50ed3ef41048505e00d46e59cbd94ea77c4921b992d599ebb089`.

**2026-11-01T13:45:21Z - @copilot**
Execution: implementing; corrective round 2 of 5 addresses the same accepted findings with explicit canonical source pointers.

**2026-11-01T14:09:22Z - @copilot**
Execution: in-review; round 2 fixed tree `67d78c0cca7fc8493c6c25de8db79ac376b576b1`, code fingerprint `396fd04f453a7bc7ae3343431813d48bf1d7941176bf9cf38623b8c8caef5761`. Changed-file formatting, lint, types, and 137 tests passed; the pre-existing inventory assertion remains excluded. Scoped re-review is pending.

**2026-11-01T14:20:16Z - @copilot**
Execution: changes-requested; [round 2 re-review](../reports/01-round-2-review.md) addressed all assigned findings except 01-CR-004/T01-I01. Accept R2-01 (conditional YAML aliases can suppress an update) and R2-02 (future Stack coverage). Round 3 of 5 is reserved. The broader whole-operation rollback observation is nonblocking: the design preserves the existing sequential lifecycle and requires preflight-failure preservation and safe individual Agent replacement, not a new cross-kind transaction for arbitrary later I/O failures.

**2026-11-01T14:20:16Z - @copilot**
Execution: implementing; corrective round 3 of 5 against reviewed tree `67d78c0cca7fc8493c6c25de8db79ac376b576b1`.

**2026-11-01T14:52:12Z - @copilot**
Execution: in-review; round 3 code tree `93e5d18fcf6ee5c3c5651bcce19b1bab0c8b003c`, fingerprint `2a9266ef1ce23119487be119dd820c50cf332ce0e58cb5c5ca4ca995fdbf9dae`. After targeted automatic lint fixes and formatting, 173 tests passed with the baseline inventory assertion excluded; types, lint, changed-file formatting, and diff whitespace checks passed. Scoped re-review pending.

**2026-11-01T15:03:07Z - @copilot**
Execution: changes-requested; [round 3 re-review](../reports/01-round-3-review.md) addressed R2-02 but left 01-CR-004, T01-I01, and R2-01 open. Accept R3-01 (transitive aliases can replace equal-version content) and R3-02 (unrelated merged metadata breaks static-version laziness). Round 4 of 5 is reserved; the previous rollback and parked-finding rulings remain unchanged.

**2026-11-01T15:03:07Z - @copilot**
Execution: implementing; corrective round 4 of 5 against reviewed tree `93e5d18fcf6ee5c3c5651bcce19b1bab0c8b003c`.

**2026-11-01T15:59:25Z - @copilot**
Execution: changes-requested; round 4 is blocked before re-review. Its direct review fixtures pass, but two retained CLI tests expose static merged versions unnecessarily rendering when unrelated random metadata has more than 32 alternatives. Relevant suite: 186 passed, 2 failed; the baseline inventory assertion was excluded. Code tree `dbf9dac882c5f404e70f5fca5281486dc8290725`, fingerprint including `src/render.ts` `8136f85dd942233e9fd4a70c2a887dc07257f5e6f04c99556278076d1d2ec541`. Type and lint checks pass. Round 5 of 5 is reserved.

**2026-11-01T15:59:25Z - @copilot**
Execution: implementing; final corrective round 5 of 5 against blocked tree `dbf9dac882c5f404e70f5fca5281486dc8290725`.

**2026-11-01T16:29:39Z - @copilot**
Execution: blocked; all 5 corrective dispatches are used and the final fix cannot advance to re-review. After controller formatting, code tree `fe847c3cf38ec6eb282022bb4bd89b054c0c07f9`, fingerprint `cb130f42fa1dceb57d602543b36ba0500bdf38a8f5a752df0504e1b8ef7053e8`: 289 tests passed and 2 failed with the baseline inventory assertion excluded; types, lint, changed-file formatting, and diff whitespace checks passed. Both failures involve static merged Skill/Agent versions with six unrelated optional random fields. The final implementation report records the counterexample; 01-CR-004, T01-I01, R2-01, R3-01, and R3-02 lack a passing current scoped re-review. Maintainer triage is needed for a sound dependency strategy or a change to the requirement. Tickets 02 and 03, aggregate review, and retrospective remain pending; no commit was made.

**2026-11-01T21:27:16Z - @copilot**
Execution: implementing; the maintainer resolved the blocker as a requirement decision (strategy A). Read source versions statically only when the frontmatter has no Nunjucks syntax; otherwise render the frontmatter with the resolved update context. Remove the partial Nunjucks/YAML dependency analysis. 01-CR-004, T01-I01, R2-01, R3-01, and R3-02 are re-scoped to this rule. The two optional-random laziness tests must be rewritten to the new contract. The maintainer authorized one additional corrective round, 6, beyond the original budget, plus a scoped re-review against fingerprint `cb130f42fa1dceb57d602543b36ba0500bdf38a8f5a752df0504e1b8ef7053e8`.

**2026-11-01T21:43:10Z - @copilot**
Execution: in-review; round 6 code fingerprint `4a3c43bd8bca1830ed55074026c68de45bb16bf94b935f768d5c4d61f1c0813b`. The controller re-ran 243 tests, all passing with the baseline inventory assertion excluded; types, lint, changed-file formatting, and diff whitespace also passed. The probe was removed under strategy A. The authorized scoped re-review is pending.

**2026-11-01T22:40:00Z - @copilot**
Execution: integrated; the maintainer accepted round 6 as-is, cancelled the pending scoped re-review, and authorized closure. Verified snapshot: fingerprint `4a3c43bd8bca1830ed55074026c68de45bb16bf94b935f768d5c4d61f1c0813b`. 243 tests passed with the baseline local-Skill inventory assertion excluded; types, lint, changed-file formatting, and diff whitespace also passed. No round 6 review report exists by maintainer decision. Closed and committed.
