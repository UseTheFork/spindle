# 01: Create and inspect feature workspaces

Reporter: User
Category: enhancement

**What to build:** A maintainer can create a uniquely numbered feature workspace
with its initial spec and durable ledger, then inspect its recorded policy and
progress through the public CLI without modifying it.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent
**Execution:** integrated

- [X] `sdd create` requires named title/author inputs and creates the initial spec, issue/report directories, and exactly one versioned `sdd.json` ledger without overwriting existing content.
- [X] Feature names use a zero-padded repository-wide numeric ID and descriptive slug, without dates. Allocation chooses above the highest matching directory, ignores unrelated/historical dated entries, and uses a temporary lock covering scan and creation.
- [X] Concurrent creation produces distinct IDs; no permanent allocator, cross-worktree allocator, deletion registry, or migration is introduced. Worktrees retain existing feature identities.
- [X] Creation records the built-in policy version and actual issue/delivery review requirements with one comprehensive default reviewer. `--require-retrospective` records true; omission records false. Reloading does not silently replace stored policy with current defaults.
- [X] `status --spec` returns structured feature state without mutation. There is no implicit active feature, selectable review profile, or separate initialization command.
- [X] Commands follow application-owned service/root patterns, keep mutable operation data local, and validate schema/version/path inputs explicitly. New commands reject legacy workspace layouts rather than silently migrating them.
- [X] Ledger mutation validates first, uses short-lived locks and atomic replacement, and preserves meaningful history. Failed creation or interrupted writes have explicit recoverable outcomes.
- [X] Public CLI tests assert exact result shapes, help, named-option validation, explicit spec selection across features, creation defaults, concurrent allocation, applicable containment/symlink/ignored-target safety, and read-only inspection.
- [X] Related CLI guidance describes the delivered behavior; validation uses project Just recipes. No agents, checks, or Git mutations are executed automatically.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
**2026-11-07T15:45:10Z - @Copilot**
Claimed against baseline `3c0ff211946361acf29db516c4eb47dcf68be901`; issue 01 has no dependencies.

**2026-11-07T15:45:30Z - @Copilot**
Implementation dispatched for issue 01; the acceptance scope and baseline are recorded above.

**2026-11-07T15:48:00Z - @Copilot**
Frozen for initial Spec/Quality review at base `3c0ff211946361acf29db516c4eb47dcf68be901`. Content SHA-256: `src/commands/sdd/sdd-command.ts` `debac2da3d99e97d00bbc56666cb2d0a4a061583631db367482a1d57584d2b32`; `src/cli.ts` `500ceb0eb697173c5fd7c481cebcbeda6a7a2978277ce0681bece24c35116bea`; `tests/sdd-create-status.test.ts` `89a3de302ccdb3531aa9d6b7540536506c41001810d181550994851c9c4dd179`; `docs/agents/tooling.md` `c29926a5de7bf1826103d230741d83e0e0c513c9cfe672a237ace6d9da220c5c`; `docs/blueprints.md` `dca76fa062e912cbb72aaa2b2e14ac4679991d5eca6b4b1a8c42844ef2cc8754`. Removed the legacy resolver and its test from this snapshot. `just test::test tests/sdd-create-status.test.ts tests/packaged-cli.test.ts` passed 18 tests; targeted lint, `just test::types`, `just build`, and `just tool::git diff --check` passed.

**2026-11-07T15:50:00Z - @Copilot**
Initial review `reports/01-review.md` returned Spec/Quality FAIL with blocking findings `01-S-001` and `01-Q-001`. Controller confirmed malformed nested ledger entries are accepted and reproduced the packaged CLI failure after build: `just test::test tests/packaged-cli.test.ts` failed 2/5 tests because obsolete tests still invoke `sdd workspace`. First corrective attempt is justified to validate nested ledger records and replace obsolete packaged resolver assertions with packaged create/status coverage.

**2026-11-07T15:50:20Z - @Copilot**
Round 1 corrective implementation dispatched for `01-S-001` and `01-Q-001`; retain the existing issue requirements and assignment history.

**2026-11-07T15:53:00Z - @Copilot**
Round 1 fix frozen for scoped review. SHA-256: `src/commands/sdd/sdd-command.ts` `b7723e821d661cae1acaa4dd98d15b72be8f084b5dacaecd2d58e3195e778ccf`; `tests/sdd-create-status.test.ts` `db3bbc0153b6989af9302e4e40fc9be53dcd184e4e2b1fb5293919292f931490`; `tests/packaged-cli.test.ts` `d0abeb8576465389c58f79ca8f88643579ed3a45a82123d19872263000f747f3`; rebuilt package from this source. `just build` and `just test::test tests/sdd-create-status.test.ts tests/packaged-cli.test.ts` passed (19 tests); lint, types, and diff check passed. The review scope is the fixes for `01-S-001` and `01-Q-001`; all other issue 01 paths remain as in the initial review snapshot.

**2026-11-07T15:55:00Z - @Copilot**
Accepted issue 01 after initial Spec/Quality review and round 1 scoped re-review; findings `01-S-001` and `01-Q-001` are addressed with no new findings. Evidence: `../reports/01-review.md` and `../reports/01-round-1-review.md`. Final checked source/test hashes match the round 1 review snapshot. Controller checks passed: build; focused SDD and packaged CLI tests (19/19); targeted lint; types; diff check. This records acceptance only; integration and commit are pending authorization.

**2026-11-07T16:45:00Z - @Copilot**
Integrated issue 01 in commit after the user authorized commits moving forward; reviewed snapshot and verification evidence are recorded above.
