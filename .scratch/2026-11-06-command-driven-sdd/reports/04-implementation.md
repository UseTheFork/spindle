# Ticket 04 implementation report

**Status:** DONE
**Checkout:** `/home/sincore/source/spindle`
**Starting revision:** `cf65376bd338741aa4a533e8b8e2cd9b37ccdb4c`
**Final revision:** `cf65376bd338741aa4a533e8b8e2cd9b37ccdb4c` (no commit)

## Snapshot and worktree

The final combined test command passed on the above `HEAD` with these exact
file contents:

| File | SHA-256 |
| --- | --- |
| `src/commands/sdd/sdd-command.ts` | `c46246062f9552cb08c7b6909024fa6016a63b93226c53b37284b650bad83168` |
| `tests/sdd-workflow.test.ts` | `1d24594221b88cfd02c95c7204b1197cc9cf40b2d4f2685a49bf90357f70319a` |
| `tests/sdd-create-status.test.ts` | `21925ad3e12785530a672f29fd137eac79d4fb417ccd89fa70ad8b29fb00a5c4` |
| `docs/agents/issue-tracker.md` | `0970038f231dbf4cdb14938fdb4b5ad2c6228ec1e518855a010ca60e65d660a9` |
| Controller-owned issue 04 | `ac8b3867677228ecffc8cfb49d69a987881880b65e26ea7ea3445698f87d6a87` |

The report was written after the final tests and is not part of that tested
snapshot. At hand-back, the worktree contains the controller-owned modification
to `issues/04-record-checks-against-current-content.md` (preserved unchanged),
my changes to the four listed source/test/guidance files, and this new untracked
report. No other changes were present. Nothing was staged or committed.

## Criterion-to-change/test summary

1. **Declare/add/remove checks:** `checks require` stores attributed requirement
   history, treats repeated additions idempotently, and requires
   `--remove --details <rationale>` to remove one command. A changed check set
   changes the requirements identity; accepted/integrated issues are reopened
   to `reviewing`, with the invalidation persisted. Covered by the
   “checks require…” and “check removal…” CLI tests.
2. **Snapshots and direct recording:** claim, implement, submit, resume,
   `checks require`, `checks record`, status, and next expose content identities.
   `checks record` writes a structured result directly to the ledger; no
   evidence-file or snapshot-management command was introduced.
3. **Results and coverage gates:** only `passed`, `failed`, and `unavailable`
   are accepted; failed/unavailable results need details. Current missing,
   stale, failed, and unavailable coverage appears in next/status; it blocks
   review/integration recommendations and keeps dependent issues unready.
4. **Git-derived code identity:** sorted changed paths come from diffing the
   claim baseline against the working tree and index, plus Git's non-ignored
   untracked paths. The identity incorporates index entries/content and
   working-tree mode/content; it does not hash the checkout or use HEAD alone.
   Tests cover untracked, staged-only, staged-plus-unstaged, committed, and
   executable-mode changes.
5. **Content vs provenance:** the combined identity hashes code and
   requirements identities; `headSha` is separately returned and recorded as
   provenance. An empty metadata-only commit changes `headSha` without
   invalidating identical content coverage.
6. **Exclusions and requirements:** `.scratch` is excluded from code identity.
   Requirements identity includes the feature spec, issue Requirements and
   Acceptance Criteria, explicit `Requirements decision` comment paragraphs,
   and check-declaration history. Ordinary comments do not change it.
   Tests cover ledger/report/audit exclusions, issue/spec requirement edits,
   and ordinary versus requirement-decision comments.
7. **Persistence and freshness:** registration validates the caller-supplied
   SHA-256 identity, recomputes inputs before writing, and rejects stale or
   malformed snapshots without persisting. Results retain history; repeating
   an identical latest record is idempotent. Status/next report unmet checks.
8. **Public behavior coverage:** tests use separate public CLI invocations and
   cover check addition/removal, dirty/untracked/staged content, requirements,
   metadata-only commits, audit/report exclusions, malformed/stale snapshots,
   result validation, persistence, gates, dependencies, and non-execution.
9. **Guidance and external execution:** `docs/agents/issue-tracker.md` documents
   the commands, identity inputs/exclusions, and attestation limits. A sentinel
   test confirms the CLI stores but never executes the declared command.

## Identity algorithm and assumptions

`codeSnapshot` SHA-256 hashes only paths Git identifies as changed from the
claim baseline (working-tree diff and cached diff) or as non-ignored untracked.
For each sorted path it includes the path, Git index stage entries and blob
content when present, and working-tree state, mode, and bytes (or symlink
target/deletion marker). All `.scratch` paths are excluded from this code set.
`requirementsSnapshot` SHA-256 covers the feature spec text, applicable issue
requirement sections/decision paragraphs, and check requirement history.
`snapshot` is SHA-256 over the pair of component hashes. Current `HEAD` SHA is
provenance only; Git's normal ignore rules exclude ignored untracked files.

This identifies selected local content, not test-runner environment, command
execution, or verdict truth. The controller still executes commands externally
and attests to results. Existing version-1 ledgers remain readable: check state
is optional and no schema-version migration is needed.

## TDD evidence and checks

Behavior changes used public CLI tests. Observed REDs included the missing
`checks`/`record` commands, absent snapshot output, staged-only content omitted
from identity, missing gate invalidation, failed coverage still exposing
`integrate`, and staged/worktree file modes hashing identically. Each was
implemented and subsequently passed. The first record-test attempt instead
hit a dirty-ledger fixture setup error; the fixture was corrected to commit
the declaration before claim, then the intended missing-command RED was
verified. Some requirement/comment identity assertions were added after the
shared identity implementation and passed on their first run; no working code
was removed to manufacture RED.

Fresh final command, run from the checkout root:

```text
just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts
```

Result: **72 passed, 0 failed**.

The earlier related-regression invocation first exposed an outdated exact
status-response assertion; `tests/sdd-create-status.test.ts` now expects the
new empty `snapshots` list, and the final combined command passes.

## Self-review and pending checks

No known blocking implementation issue remains. Check evidence is an explicit
controller attestation, not cryptographic proof of execution. This slice
updates existing reviewing/integration recommendations and dependency checks;
it does not add later review/acceptance commands.

Formatting, lint, type checking, build, the full project test suite, and
ticket-wide regression/acceptance checks were **not run**; they remain with the
controller as assigned. Their absence is not a claim of failure or acceptance.
The controller retains integration and commit ownership.

## Controller verification

The controller formatted the implementation, tests, and issue-tracker
guidance, then ran targeted lint and type checking; all passed. A fresh
`just build` passed. The first packaged CLI run after the build exposed a stale
exact status response expectation for the new empty `snapshots` field; the
controller updated `tests/packaged-cli.test.ts`, and the final regression
command passed.

- `just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts` — passed, 72 tests, 0 failures.
- `just test::test tests/packaged-cli.test.ts` — passed, 5 tests, 0 failures on the freshly built bundle.
- `just tool::git diff --check` — passed.

The final production source hash is
`8a59f89f371c6b24939b260159e95afd2081a87710b2ef70e5356245a7422ee7`. The full
project suite was not run. The issue-04 implementation, test, and guidance
hashes are recorded in the controller's tracker freeze entry.

## Corrective round 1 — 04-REV-01 and 04-REV-02

**Status:** DONE_WITH_CONCERNS (implementation and focused checks complete;
submodule test-first evidence is incomplete as noted below; no acceptance
claim).
**Checkout:** `/home/sincore/source/spindle`
**Starting and final revision:** `cf65376bd338741aa4a533e8b8e2cd9b37ccdb4c`
(unchanged; no commit).

### Snapshot and preserved worktree

The assigned frozen source hashes were verified before editing:

- `src/commands/sdd/sdd-command.ts` — prior
  `8a59f89f371c6b24939b260159e95afd2081a87710b2ef70e5356245a7422ee7`;
  implementer pre-format `497744316d54cc551f3b32d09bca69ec2855432243a8725b7ef538e0dbb57ab0`;
  controller final formatted `7d8cab79467c1eff51837b98eab5e67615bc4ea6efbafc9988ad0801164be235`.
- `tests/sdd-workflow.test.ts` — prior
  `1fb5f060efb7e3934b467b44facd2be8d7168e578c03e1189c541b7e68789397`;
  implementer pre-format `7ecf3fc3f0232a58c6b1cd6cc4c5cdb21f117c30d2c0e73094fc822cd8097c24`;
  controller final formatted `538afe14ff1be420741b36425eae8a280a648523847d95ed37a72829f020b92f`.
- `docs/agents/issue-tracker.md` final
  `665b2ebdb076cdfc225ab9416dbfd6885cd66f953efab3b4284505d31bb63a24`.

The final regression inputs also included unchanged
`tests/sdd-create-status.test.ts`
(`21925ad3e12785530a672f29fd137eac79d4fb417ccd89fa70ad8b29fb00a5c4`),
`tests/sdd-issues.test.ts`
(`3a1033302afb8e04728fa89e3538eb5c8208d8d11c6ab0a23df9e297c6c82bd0`),
`tests/stubs.test.ts`
(`5cb625569507c8397f26df652486c64cf6a9b927506c721ba5e45853e054ae7e`),
and `tests/packaged-cli.test.ts`
(`b833a623da78c12f4e43c0a1ad7c43ccb42e19915a7d0bda74440f96b4cf5777`).
The controller-owned issue file was preserved unchanged during this round
(final hash `27894edd98f1ea755fa766162c509b9a005c972e77b76e810b9b9acf438660f6`).
The implementation report was appended after testing and is not part of the
tested source/test snapshot.

At hand-back, the dirty inventory remains the assigned one: modified
`.scratch/2026-11-06-command-driven-sdd/issues/04-record-checks-against-current-content.md`
(controller-owned, untouched), `docs/agents/issue-tracker.md`,
`src/commands/sdd/sdd-command.ts`, `tests/packaged-cli.test.ts`,
`tests/sdd-create-status.test.ts`, and `tests/sdd-workflow.test.ts`;
untracked `.scratch/2026-11-06-command-driven-sdd/reports/04-implementation.md`
and `reports/04-review.md`. No files were staged or committed.

### Finding-to-change/test summary

- **04-REV-02 — ambiguous code hash serialization:** Each code snapshot now
  begins with `spindle-code-snapshot-v2` and serializes typed fields as a
  big-endian 32-bit tag length, tag bytes, big-endian 64-bit value length, and
  value bytes. Per-path record markers, paths, index stage/content state,
  worktree mode/type, and file bytes or symlink targets use this framing.
  Existing requirements identity, provenance, `.scratch` exclusion, and
  content semantics are retained. The public CLI regression compares the
  one-untracked-file payload containing a second record's old framing with the
  corresponding two-file state and asserts distinct `codeSnapshot` values.
- **04-REV-01 — submodule content omitted:** Identity computation now fails
  closed when a Gitlink path changed from the claim baseline or when a
  submodule worktree differs from its indexed revision or has tracked,
  untracked, or otherwise unsupported worktree state. It does not derive a
  Gitlink-only identity. `checks record` is covered rejecting a dirty tracked
  submodule against the claim snapshot, with the ledger records still empty;
  public `resume` coverage also rejects untracked submodule files and a changed
  submodule revision. This policy and its limits are documented in
  `docs/agents/issue-tracker.md`. Submodule changes are unsupported rather
  than recursively represented.

### TDD and verification evidence

- **RED — 04-REV-02:** Before production edits,
  `just test::test tests/sdd-workflow.test.ts` failed the new public CLI
  collision assertion as expected: distinct one-file/two-file states both
  returned code identity
  `d98d6e74bc9a529bf4518a21c61d6fcbf74f272d61ae91646df725a6adc563f4`.
- **GREEN — 04-REV-02:** The same focused command passed 28/28 after the
  versioned length-framed serialization change; the adversarial states then
  returned distinct identities.
- **04-REV-01 TDD caveat:** The submodule safeguard was implemented in the
  same production edit as serialization before the submodule regression was
  written. Its first run therefore passed 29/29; this is characterization and
  not a valid pre-fix RED. I did not revert working code to manufacture a RED.
  A subsequent focused run passed 29/29, including changed revision, dirty
  tracked content, untracked content, and non-persistence assertions.
- **Fresh final focused regression**, run after all implementation and guidance
  edits: `just test::test tests/sdd-workflow.test.ts
  tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts
  tests/packaged-cli.test.ts` — **74 passed, 0 failed**.
- The final tested Git revision was `cf65376bd338741aa4a533e8b8e2cd9b37ccdb4c`;
  final source/test hashes are listed above. The full suite, build, formatting,
  lint, type checks, and ticket-wide regression/acceptance checks were not run
  by this worker. They remain with the controller and are not implementer
  failures or acceptance evidence.

### Self-review and hand-back

The serialization parser has explicit tags and byte lengths; the public
collision regression observed RED before the serialization fix. The deliberate
submodule policy prevents stale coverage by refusing unrepresentable submodule
states, but the missing pre-fix RED for that finding is a process concern.
No other blocking self-review issue was found. The controller owns formatting,
lint, types, build, ticket-wide checks, scoped review, integration, and commit.
The assigned scoped review destination is
`/home/sincore/source/spindle/.scratch/2026-11-06-command-driven-sdd/reports/04-round-1-review.md`.
No issue 05 or subsequent ticket was started.

### Controller verification — corrective round 1

The controller formatted the implementation, tests, and guidance, then ran:

- Targeted `just lint::check` over the changed implementation, related tests,
  and guidance — passed.
- `just test::types` — passed.
- `just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts` — passed, 74 tests, 0 failures.
- `just build` — passed.
- `just test::test tests/packaged-cli.test.ts` — passed, 5 tests, 0 failures on the fresh bundle.
- `just tool::git diff --check` — passed.

Final formatted corrective hashes:

- `src/commands/sdd/sdd-command.ts` —
  `7d8cab79467c1eff51837b98eab5e67615bc4ea6efbafc9988ad0801164be235`
- `tests/sdd-workflow.test.ts` —
  `538afe14ff1be420741b36425eae8a280a648523847d95ed37a72829f020b92f`
- `docs/agents/issue-tracker.md` —
  `665b2ebdb076cdfc225ab9416dbfd6885cd66f953efab3b4284505d31bb63a24`

The full project suite was not run. Ticket 05 and later were not started.

### Controller verification — corrective round 2

The controller formatted the round 2 source, tests, and guidance and verified:

- Targeted `just lint::check` — passed.
- `just test::types` — passed.
- `just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts` — passed, 76 tests, 0 failures.
- `just build` — passed.
- `just test::test tests/packaged-cli.test.ts` — passed, 5 tests, 0 failures on the freshly built bundle.
- `just tool::git diff --check` — passed.

Final formatted round 2 SHA-256:

- `src/commands/sdd/sdd-command.ts` —
  `56066c294f33235ddbffe00b622bc0159a91cbb18e9c4cf218d1eb11707398a5`
- `tests/sdd-workflow.test.ts` —
  `2f97511b6e3f0122a76c5b9c3384ef6d6ef052f62efacb77cd3ccfcb89317438`
- `docs/agents/issue-tracker.md` —
  `0a0df88a65568750f1524135ec091e1ff6c513a74193979b83f1c8a132ba2c8b`

The full project test suite was not run. The controller has not started ticket
05 per the user's pause request.

## Corrective round 2 — 04-R1-REV-03 and missing/uninitialized Gitlinks

**Status:** DONE_WITH_CONCERNS (assigned corrections implemented and fresh
focused/regression tests passed; the missing-Gitlink fixture was already
fail-closed before the explicit diagnostic refinement, so there is no
behavioral pre-fix RED for that case; no acceptance claim).
**Checkout:** `/home/sincore/source/spindle`
**Starting and final revision:** `cf65376bd338741aa4a533e8b8e2cd9b37ccdb4c`
(unchanged; no commit).

### Snapshot and preserved worktree

Before editing, I verified the assigned round-1 frozen hashes:

- `src/commands/sdd/sdd-command.ts` —
  `7d8cab79467c1eff51837b98eab5e67615bc4ea6efbafc9988ad0801164be235`
- `tests/sdd-workflow.test.ts` —
  `538afe14ff1be420741b36425eae8a280a648523847d95ed37a72829f020b92f`
- `docs/agents/issue-tracker.md` —
  `665b2ebdb076cdfc225ab9416dbfd6885cd66f953efab3b4284505d31bb63a24`

Final tested content hashes:

- `src/commands/sdd/sdd-command.ts` —
  implementer pre-format `56066c294f33235ddbffe00b622bc0159a91cbb18e9c4cf218d1eb11707398a5`;
  controller final formatted `56066c294f33235ddbffe00b622bc0159a91cbb18e9c4cf218d1eb11707398a5`
- `tests/sdd-workflow.test.ts` —
  implementer pre-format `65347b9159199b283606aec5da973ae9876e6783e93865722a7712dfe40e7919`;
  controller final formatted `2f97511b6e3f0122a76c5b9c3384ef6d6ef052f62efacb77cd3ccfcb89317438`
- `docs/agents/issue-tracker.md` —
  implementer pre-format `0a0df88a65568750f1524135ec091e1ff6c513a74193979b83f1c8a132ba2c8b`;
  controller final formatted `0a0df88a65568750f1524135ec091e1ff6c513a74193979b83f1c8a132ba2c8b`
- Unchanged related regression inputs:
  `tests/sdd-create-status.test.ts`
  `21925ad3e12785530a672f29fd137eac79d4fb417ccd89fa70ad8b29fb00a5c4`;
  `tests/sdd-issues.test.ts`
  `3a1033302afb8e04728fa89e3538eb5c8208d8d11c6ab0a23df9e297c6c82bd0`;
  `tests/stubs.test.ts`
  `5cb625569507c8397f26df652486c64cf6a9b927506c721ba5e45853e054ae7e`;
  `tests/packaged-cli.test.ts`
  `b833a623da78c12f4e43c0a1ad7c43ccb42e19915a7d0bda74440f96b4cf5777`.

The tested snapshot is the above source/test/guidance content plus the unchanged
supporting regression inputs at `HEAD` `cf65376bd338741aa4a533e8b8e2cd9b37ccdb4c`.
The report is under `.scratch` and excluded from code identity. At hand-back,
the worktree inventory is: modified controller-owned issue 04 (untouched);
modified `docs/agents/issue-tracker.md`, `src/commands/sdd/sdd-command.ts`,
`tests/packaged-cli.test.ts`, `tests/sdd-create-status.test.ts`, and
`tests/sdd-workflow.test.ts`; untracked `reports/04-implementation.md`,
`reports/04-review.md`, and `reports/04-round-1-review.md`. The latter
supporting test files and report history predate this round and were preserved.
No other changes were present. Nothing was staged or committed.

### Finding-to-change/test summary

- **04-R1-REV-03 — nested untracked repository/worktree content can share an
  identity:** Changed-path directories are now rejected with an explicit
  nested repository/worktree diagnostic rather than encoded as a generic
  `nonfile` marker. Other unsupported non-file worktree paths also fail
  explicitly. The public CLI regression creates an embedded local Git
  repository under `vendor/dependencies/embedded`, captures the legacy
  identity where available, changes a tracked nested file without changing
  the containing directory, then requires `resume` to fail with a diagnostic.
  It also requires `checks record` to fail and asserts the ledger has no
  recorded results. The fixed implementation rejects identity computation
  before either identity reuse or persistence is possible.
- **Missing/uninitialized known Gitlinks — fail-closed behavior:** Known
  Gitlink worktree presence and directory state are checked before relying on
  the parent repository's changed-path list. A missing path and a failed
  submodule revision lookup both produce the explicit diagnostic
  `its worktree is missing or uninitialized`. The public CLI test creates a
  local Gitlink, claims it, deinitializes/removes the worktree, and confirms
  both `resume` and `checks record` fail with that diagnostic and leave check
  records empty. On the pre-edit implementation, this fixture already failed
  closed through the existing Git path/status or submodule lookup handling;
  its initial RED run passed this test with a broader diagnostic assertion.
  The new assertion for the specific missing/uninitialized diagnostic passes
  after the explicit guard. I did not remove working behavior to manufacture
  a behavioral RED.
- **04-REV-01 — changed/dirty known Gitlinks:** Preserved the round-1
  fail-closed revision/status checks. The existing public CLI regression still
  checks dirty tracked and untracked submodule content, changed checked-out
  revision, and no persistence for dirty `checks record`; the new missing
  Gitlink test extends that guard.
- **04-REV-02 — ambiguous identity framing:** Preserved the versioned,
  length-prefixed identity encoding and the adversarial one-file/two-file
  public CLI regression. That test passed in both fresh test runs below.

### TDD and verification evidence

- **RED — nested repository reuse:** Before production edits,
  `just test::test tests/sdd-workflow.test.ts` exited 1 (30 passed, 1 failed).
  The new test failed because `resume` returned status `0` after the tracked
  content inside the embedded repository changed; the existing directory
  marker allowed the nested-content change to retain an identity.
- **Pre-fix missing-Gitlink evidence:** The same pre-edit run passed the
  missing-Gitlink test (with the then-broader explicit error diagnostic),
  showing this local Git fixture was already rejected by surrounding behavior.
  It did not supply a behavioral RED for that case. The production refinement
  makes missing/uninitialized detection explicit and the final test requires
  its specific diagnostic as well as non-persistence.
- **GREEN — focused:** After the implementation and test edits,
  `just test::test tests/sdd-workflow.test.ts` passed **31/31**.
- **GREEN — final related regression:**
  `just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts
  tests/sdd-issues.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts`
  passed **76/76** after all implementation edits. This is the final tested
  snapshot recorded above.

### Self-review, remaining limits, and hand-back

The guard deliberately treats changed directory/non-file paths as
unrepresentable, rather than trying to hash nested repository contents. This
is a conservative fail-closed policy and may reject unusual changed directory
paths even when they are not repositories. Known missing Gitlinks are rejected
before parent changed-path handling; uninitialized submodule revision lookup
errors are normalized to the explicit missing/uninitialized diagnostic.
No unrelated files, ticket execution/comments, or prior report history were
edited. Existing typed serialization, `.scratch` exclusion, metadata-only
coverage semantics, and supported clean-submodule behavior remain unchanged.

Formatting, lint, type checks, build, and any ticket-wide acceptance checks
were not run by this worker; they remain pending with the controller and are
not implementer failures or acceptance evidence. The full project test suite
was not run. No commit was made. Ticket 05 and later were not started.
