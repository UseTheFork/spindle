# Ticket 04 — Initial Spec/Quality Review

## 1. Scope and snapshot

- **Scope/phase:** Initial review of issue 04, “Record checks against current content.”
- **Snapshot:** Base and `HEAD` are `cf65376bd338741aa4a533e8b8e2cd9b37ccdb4c`; reviewed content is that base plus the frozen issue 04 worktree changes. The tracker’s execution/freeze comments are controller-owned inputs.
- **Verified frozen-file SHA-256 values:**
  - `src/commands/sdd/sdd-command.ts`: `8a59f89f371c6b24939b260159e95afd2081a87710b2ef70e5356245a7422ee7`
  - `tests/sdd-workflow.test.ts`: `1fb5f060efb7e3934b467b44facd2be8d7168e578c03e1189c541b7e68789397`
  - `tests/sdd-create-status.test.ts`: `21925ad3e12785530a672f29fd137eac79d4fb417ccd89fa70ad8b29fb00a5c4`
  - `tests/packaged-cli.test.ts`: `b833a623da78c12f4e43c0a1ad7c43ccb42e19915a7d0bda74440f96b4cf5777`
  - `docs/agents/issue-tracker.md`: `0970038f231dbf4cdb14938fdb4b5ad2c6228ec1e518855a010ca60e65d660a9`
- **Requirements:** `.scratch/2026-11-06-command-driven-sdd/issues/04-record-checks-against-current-content.md`, `spec.md`, and `design.md`; applicable instructions are `.github/instructions/testing.instructions.md` and `.github/instructions/code-commenting.instructions.md`; project guidance is `docs/agents/issue-tracker.md` and `docs/agents/tooling.md`.
- **Change reviewed:** Complete supplied tracked diff across the six changed files, plus the supplied implementation report and relevant surrounding claim, implement, submit, resume, ready, status/next, ledger-validation, and recovery code. The untracked implementation report is in `.scratch/.../reports/04-implementation.md`.

The source and all listed changed test/guidance hashes match the frozen tracker identity. The implementation report’s initial hash table contains superseded source/test values; its later controller-verification section and the freeze entry provide the final identity used here.

## 2. Evidence and limitations

Controller-supplied checks on the frozen snapshot (not run by me):

- Formatting, targeted lint, `just test::types`, and fresh `just build` passed.
- `just test::test tests/sdd-workflow.test.ts tests/sdd-create-status.test.ts tests/sdd-issues.test.ts tests/stubs.test.ts tests/packaged-cli.test.ts` passed: 72 tests.
- Fresh packaged CLI tests passed: 5 tests.
- `just tool::git diff --check` passed.

Evidence and results are recorded in `.scratch/2026-11-06-command-driven-sdd/reports/04-implementation.md` and the frozen issue comment. The full project test suite was not run. I did not run project checks, modify implementation/tests, or start a TDD cycle.

## 3. Spec

**Verdict: FAIL**

1. **Declare/add/remove checks — PASS.** `checks require` adds commands, treats an already active declaration as idempotent, and requires rationale for removal. Removal history is retained; declaration changes alter the requirements identity and reopen accepted/integrated execution.
2. **Workflow identities and direct recording — PASS, with identity defects below.** Claim, implement, submit, resume, status, and next expose identities; `checks record` writes directly to the ledger without executing the command or creating an intermediate evidence file.
3. **Results and coverage gates — PASS for represented inputs.** Only the required result values are accepted; failed/unavailable results require details. Missing, stale, failed, and unavailable required checks block status/next actions.
4. **Git-derived identity — FAIL.** The collector does not include submodule worktree content, and its content stream has ambiguous record boundaries (findings `04-REV-01` and `04-REV-02`). Therefore distinct code inputs can receive the same code identity.
5. **Content versus provenance — PASS for ordinary repository files.** `headSha` is separate provenance; the metadata-only commit test checks stable content identity and changed provenance. Submodule content and ambiguous encoding remain exceptions.
6. **Generated exclusions and requirements identity — PASS for tested ordinary cases.** `.scratch` is excluded from code identity; feature spec, issue requirement/acceptance sections, recognized requirements-decision comments, and check declaration history contribute to requirements identity. Ordinary appended issue comments do not. This does not cure the code-identity defects.
7. **Revalidation, persistence, gates, idempotency — PARTIAL.** Normal-path stale/malformed inputs are rejected, results persist, and next/status report blockers. The flawed code identity can nevertheless make changed inputs appear current. No supplied test covers the identified submodule or serialization cases.
8. **Public CLI coverage — PARTIAL.** The public CLI tests assert snapshots, staged/unstaged/untracked and committed changes, executable modes, metadata-only commits, requirements/comment changes, exclusions, validation, persistence, gates, and non-execution. They do not assert identity changes for submodule content or distinguish adversarially framed file layouts.
9. **Guidance and external execution — PASS.** Guidance states that commands are externally executed and results are controller attestations, not proof of execution or truth. A sentinel test checks that the CLI does not execute the command.

## 4. Quality

**Verdict: FAIL**

The change is reasonably localized to the SDD command and related public CLI tests/guidance. The tests make observable assertions on JSON, exit status, ledger persistence, current blockers, and a non-execution sentinel. Metadata-only commits and check removal receive direct behavioral coverage. However, the core identity implementation has two correctness defects that can leave required evidence valid for different content. Full-suite evidence is unavailable, and the uncovered identity cases are significant.

## 5. Findings

### 04-REV-01 — Submodule worktree content is not represented

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:1794-1808` (`#contentIdentity`)
- **Defect/impact:** For a changed Gitlink path, the collector hashes the parent index entry, then sees the submodule directory as a non-file and adds only `worktree-nonfile`. It never hashes the submodule’s checked-out commit, dirty tracked files, or untracked files. A submodule content change can therefore leave `codeSnapshot` unchanged (or be represented only by the unchanged parent index Gitlink), allowing a prior passing result to appear current for changed code. The current tests exercise symlink/report-path protections but not submodule identity.
- **Required correction:** Include a deterministic representation of each changed submodule’s checked-out revision and relevant worktree/index content (including applicable untracked changes), or reject unsupported dirty submodules so they cannot silently share an identity. Add public CLI tests for changed submodule revision and dirty/untracked submodule content.

### 04-REV-02 — Code hash serialization is ambiguous

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:1782-1808` (`#contentIdentity`)
- **Defect/impact:** File bytes and symlink targets are appended directly to the hash stream without a length or terminal delimiter. The next path record begins immediately after those bytes. Thus two distinct path/content sets can produce exactly the same pre-hash byte stream, without breaking SHA-256: for example, one untracked file `a` whose bytes are `X || encoded-record(b)` serializes identically to two untracked files `a` with bytes `X` and `b` with bytes matching that encoded record (same mode; both have no index entry). This makes a supplied snapshot unable to distinguish those code inputs, so prior passing evidence can be reused across a content change.
- **Required correction:** Encode every record and variable-length field unambiguously (for example, typed records with byte lengths or per-path digests combined using a canonical structured encoding). Add a regression test asserting distinct identities for a single-file payload containing a second record’s framing versus the corresponding two-file state.

## 6. Observations and remaining context

- `#contentIdentity` hashes the entire feature `spec.md` for `requirementsSnapshot`, rather than only applicable requirement material. This is conservative but means edits to unrelated prose/formatting can invalidate check evidence and require redundant reruns.
- Existing public tests cover the specifically listed ordinary cases well, but do not cover the submodule and serialization defects above. A full project suite was not supplied; no claim is made about it.
- The CLI/documentation appropriately describe result records as attestations and do not claim cryptographic proof that commands ran.
- No other prior issue 04 findings or controller rulings were supplied.
