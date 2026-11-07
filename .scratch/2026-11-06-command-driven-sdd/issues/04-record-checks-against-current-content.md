# 04: Record checks against current content

Reporter: User
Category: enhancement

**What to build:** A controller declares verification requirements and records
externally executed results against CLI-supplied content identities, so that
only checks covering current code and requirements can satisfy delivery gates.

**Blocked by:** 03: Claim, dispatch, and resume implementation.

**Status:** ready-for-agent
**Execution:** integrated

- [X] `checks require` declares commands before implementation and permits later additions. Removing a requirement requires recorded rationale and invalidates affected gate decisions through a minimal explicit named-option contract.
- [X] Workflow actions compute and return snapshot identities. `checks record` records one command/result/author against a supplied snapshot directly in the ledger, without an intermediate evidence file or separate snapshot-management command.
- [X] Results use `passed | failed | unavailable`; failed/unavailable requires details. Missing, stale, failed, or unavailable required coverage cannot satisfy a gate.
- [X] Git-derived identity accounts for committed, staged, unstaged, and untracked changes against the claim baseline. Neither HEAD alone nor hashing the entire checkout is used.
- [X] Code coverage depends on content while SHAs provide provenance. Metadata-only commits preserve coverage for identical content; external content changes invalidate affected evidence.
- [X] Generated ledger/report/audit content is excluded from code identity. Applicable spec/issue requirements are identified separately and their changes invalidate relevant evidence; ordinary comments are excluded unless they carry an applicable requirements decision.
- [X] Evidence registration revalidates current inputs, persists structured results and history, and exposes unmet checks in next/status. Repeated identical records are idempotent.
- [X] Public CLI tests measure dirty/untracked identity changes, requirement changes, audit exclusions, metadata-only commits, stale/malformed snapshots, result validation, check addition/removal, and persistence across invocations.
- [X] Documentation explains identity/attestation limits and external check execution. Targeted Just-based checks pass without the CLI executing declared commands.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
**2026-11-07T19:10:50Z - @Copilot**
Claimed issue 04 from clean baseline `cf65376bd338741aa4a533e8b8e2cd9b37ccdb4c`; issue 03 is integrated. Controller author is `Copilot`.

**2026-11-07T19:11:07Z - @Copilot**
Implementation dispatched; durable handoff destination is `../reports/04-implementation.md`. The controller retains integration and commit ownership.

**2026-11-07T20:21:28Z - @Copilot**
Frozen for initial Spec/Quality review at base/HEAD `cf65376bd338741aa4a533e8b8e2cd9b37ccdb4c`. Final SHA-256: `src/commands/sdd/sdd-command.ts` `8a59f89f371c6b24939b260159e95afd2081a87710b2ef70e5356245a7422ee7`; `tests/sdd-workflow.test.ts` `1fb5f060efb7e3934b467b44facd2be8d7168e578c03e1189c541b7e68789397`; `tests/sdd-create-status.test.ts` `21925ad3e12785530a672f29fd137eac79d4fb417ccd89fa70ad8b29fb00a5c4`; `tests/packaged-cli.test.ts` `b833a623da78c12f4e43c0a1ad7c43ccb42e19915a7d0bda74440f96b4cf5777`; `docs/agents/issue-tracker.md` `0970038f231dbf4cdb14938fdb4b5ad2c6228ec1e518855a010ca60e65d660a9`. Other unchanged input hashes and check evidence are in `../reports/04-implementation.md`. Formatting, targeted lint, type-check, build, 72-test ticket regression command, fresh packaged tests (5), and diff check passed. The full project test suite was not run.

**2026-11-07T20:29:02Z - @Copilot**
Initial review `../reports/04-review.md` returned Spec/Quality FAIL with blocking Important findings `04-REV-01` (submodule content omitted from code identity) and `04-REV-02` (ambiguous hash record framing). First corrective attempt is authorized to encode identity unambiguously, safely account for submodules or explicitly reject unsupported changed/dirty submodule content, and add public CLI regressions for both findings. Prior attempts: none. Prior rulings: none. Progress decision: continue; both are concrete correctness defects with defined testable corrections.

**2026-11-07T20:29:21Z - @Copilot**
Round 1 corrective implementation dispatched for `04-REV-01` and `04-REV-02`; preserve the initial implementation/report and append attempt evidence to `../reports/04-implementation.md`. Scoped review destination: `../reports/04-round-1-review.md`.

**2026-11-07T20:52:03Z - @Copilot**
Round 1 fix frozen for scoped review at base/HEAD `cf65376bd338741aa4a533e8b8e2cd9b37ccdb4c`. Final formatted hashes: `src/commands/sdd/sdd-command.ts` `7d8cab79467c1eff51837b98eab5e67615bc4ea6efbafc9988ad0801164be235`; `tests/sdd-workflow.test.ts` `538afe14ff1be420741b36425eae8a280a648523847d95ed37a72829f020b92f`; `docs/agents/issue-tracker.md` `665b2ebdb076cdfc225ab9416dbfd6885cd66f953efab3b4284505d31bb63a24`. Related unchanged test hashes and controller checks are recorded in `../reports/04-implementation.md`. Formatting, targeted lint, types, build, 74-test focused regression suite, fresh packaged tests (5), and diff check passed. Full project suite not run. Review scope: `04-REV-01`, `04-REV-02`, and regressions.

**2026-11-07T20:52:30Z - @Copilot**
Round 1 scoped review `../reports/04-round-1-review.md` marks `04-REV-01` addressed for indexed Gitlinks and `04-REV-02` addressed, but adds blocking Important `04-R1-REV-03`: nested untracked repositories are reduced to a generic non-file marker, so content changes can share an identity. It also says missing/uninitialized known Gitlink handling is unverified. Round 1 is attempt 1; progress: both original findings closed with passing focused coverage, while review isolated an adjacent unsupported-path case. Controller authorizes round 2 to reject nested repository/worktree paths and establish fail-closed missing/uninitialized Gitlink behavior with public CLI tests. Prior attempts: round 1 only. Prior rulings: `04-REV-01` and `04-REV-02` addressed for supplied cases; `04-R1-REV-03` unresolved.

**2026-11-07T20:57:30Z - @Copilot**
Round 2 corrective implementation dispatched for `04-R1-REV-03` and missing/uninitialized Gitlink coverage; preserve both prior findings' fixes and all review history. Append fresh attempt evidence to `../reports/04-implementation.md`; scoped re-review destination is `../reports/04-round-2-review.md`.

**2026-11-07T21:14:21Z - @Copilot**
Round 2 fix frozen for scoped review at base/HEAD `cf65376bd338741aa4a533e8b8e2cd9b37ccdb4c`. Final formatted hashes: `src/commands/sdd/sdd-command.ts` `56066c294f33235ddbffe00b622bc0159a91cbb18e9c4cf218d1eb11707398a5`; `tests/sdd-workflow.test.ts` `2f97511b6e3f0122a76c5b9c3384ef6d6ef052f62efacb77cd3ccfcb89317438`; `docs/agents/issue-tracker.md` `0a0df88a65568750f1524135ec091e1ff6c513a74193979b83f1c8a132ba2c8b`. Other regression identities are in `../reports/04-implementation.md`. Formatting, targeted lint, types, build, 76-test focused regression suite, fresh packaged tests (5), and diff check passed. Full project suite not run. Review scope: `04-R1-REV-03`, missing/uninitialized Gitlink fail-closed behavior, and regressions.

**2026-11-07T21:19:19Z - @Copilot**
Round 2 review `../reports/04-round-2-review.md` returns Spec PASS and Quality PASS; `04-R1-REV-03` and missing/uninitialized known Gitlink handling are ADDRESSED, with no new findings. Together, initial `../reports/04-review.md`, round 1 `../reports/04-round-1-review.md`, and round 2 cover all issue 04 criteria and close all blockers. Controller accepts issue 04. Nonblocking limitations: unsupported changed directories/submodule states fail closed rather than receiving identities; some file/symlink-at-Gitlink and command-failure branches lack separate fixtures; full project suite was not run. No ticket after issue 04 is started.

**2026-11-07T21:19:40Z - @Copilot**
Controller-owned integration authorized by the user. Commit the complete issue 04 implementation, guidance, tests, and review history; stop after the commit and clean-worktree verification without claiming or starting issue 05.
