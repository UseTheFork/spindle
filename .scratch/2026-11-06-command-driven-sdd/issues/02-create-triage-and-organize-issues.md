# 02: Create, triage, and organize issues

Reporter: User
Category: enhancement

**What to build:** A maintainer can create attributed Markdown issues, edit their
descriptive metadata, triage them, and inspect a dependency-aware ready queue
while requirements remain directly editable Markdown.

**Blocked by:** 01: Create and inspect feature workspaces.

**Status:** ready-for-agent
**Execution:** integrated

- [X] `issue create` allocates `I-0001`-style IDs independently per feature, requires title/free-form reporter/category/author, and never overwrites an issue. Generated YAML front matter defaults triage to `needs-triage` and `blocked_by` to empty; execution starts as `unstarted` in the ledger only.
- [X] `issue update` changes descriptive metadata and dependencies without changing execution or bypassing triage. Requirements and acceptance criteria remain directly editable Markdown.
- [X] `triage` accepts category `bug | enhancement` and status `needs-triage | needs-info | ready-for-agent | ready-for-human | wontfix`, requires details and author, and records its rationale.
- [X] Front-matter `blocked_by` is the only editable dependency authority. Updates and queue evaluation reject missing references and cycles, including externally edited invalid dependencies.
- [X] `ready --spec` lists only unclaimed triage-eligible issues whose dependencies are integrated; unmet dependencies remain visible rather than silently ignored.
- [X] `issue comment` and decision history preserve existing body/comments and append explicitly attributed UTC entries under Comments. No author or reporter is inferred.
- [X] Commands use named options, explicit spec and issue selection, consistent summary/details vocabulary, and explicit nonzero diagnostics. YAML is the sole supported generated-issue metadata format; historical files are not migrated.
- [X] Competing issue allocations/updates are serialized. Interrupted ledger/Markdown writes are detected and recover without duplicate audit entries, lost requirements, or reset progress; execution is not mirrored into Markdown.
- [X] Public CLI tests cover defaults, per-feature IDs, invalid enums, missing attribution, metadata preservation, dependency cycles/references, ready eligibility, concurrent writes, and deterministic multi-file interruption recovery.
- [X] Related issue-management guidance and applicable Just-based checks accompany the behavior.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
**2026-11-07T16:50:00Z - @Copilot**
Claimed against clean baseline `dd35373c14158ddbee742976be151a81aff61f27`; dependency issue 01 is integrated.

**2026-11-07T16:50:20Z - @Copilot**
Implementation dispatched for issue 02. Assignment report destination: `../reports/02-implementation.md`.

**2026-11-07T16:55:00Z - @Copilot**
Controller removed a behavior-irrelevant triage projection from dependency validation after `just test::types` showed a type mismatch; dependency validation consumes the unchanged issue graph and triage metadata remains written from validated inputs.

**2026-11-07T17:00:00Z - @Copilot**
Frozen for initial Spec/Quality review at base `dd35373c14158ddbee742976be151a81aff61f27`. SHA-256: `src/commands/sdd/sdd-command.ts` `204b7f189ca3742384408eb8ef4f979246110ce8d5b2faccb4fcac8bac2b39e4`; `tests/sdd-issues.test.ts` `ddc2099fead5b0a2a851e7123f19a485c2fec2ec74f97975118809cf5097175e`; `docs/agents/issue-tracker.md` `9dd964dadb13ec7576ef342c67cfe6de1727b2885d788480540c65be611157a4`; `docs/agents/tooling.md` `568818cddf56133eb01cf6ae4d3159e56e14bc7ae5de8dbe068df5700ea94156`. `just test::test tests/sdd-issues.test.ts tests/sdd-create-status.test.ts` passed 28 tests; packaged CLI tests passed 5; formatting, targeted lint, `just test::types`, `just build`, and `just tool::git diff --check` passed.

**2026-11-07T16:50:00Z - @Copilot**
Initial review `reports/02-review.md` returned Spec/Quality FAIL with blocking findings `02-S-001`, `02-S-002`, and `02-Q-001`. Findings concern insertion into `## Comments`, read-only `ready` mutating via lock/recovery, and recovery writing earlier journal items before detecting later conflicts. The first corrective attempt is authorized with these objectives and required public CLI tests; no prior corrections or progress decisions exist.

**2026-11-07T16:50:20Z - @Copilot**
Round 1 corrective implementation dispatched for `02-S-001`, `02-S-002`, and `02-Q-001`; append fresh implementation evidence to `../reports/02-implementation.md`.

**2026-11-07T16:55:00Z - @Copilot**
Round 1 fixes frozen for scoped review. SHA-256: `src/commands/sdd/sdd-command.ts` `1350729d7b18165f70d8f664bed846c9d6500f27028aab4d3789998f8bc1f46f`; `tests/sdd-issues.test.ts` `52aab0b35f645c58717aec7063aa7fcbd3c54bdba954ca58bcc6842e45271669`; prior create/status test `db3bbc0153b6989af9302e4e40fc9be53dcd184e4e2b1fb5293919292f931490`; tracker/tooling docs unchanged from initial review. `just test::test tests/sdd-issues.test.ts tests/sdd-create-status.test.ts` passed 31 tests; packaged CLI tests passed 5; formatting, lint, types, build, and diff check passed. The implementer notes `ready` is not linearizable if an entire concurrent mutation begins and finishes between its two read guards; that limitation is supplied for review and is not claimed as resolved.

**2026-11-07T16:57:00Z - @Copilot**
Round 1 review reports `02-S-001`, `02-S-002`, and `02-Q-001` addressed, but adds blocking Important finding `02-S-003`: serialized triage operations can complete between ready's reads, producing a queue combination that never existed. Progress is verified by closure of all three prior findings; round 2 will ensure coherent readiness or fail/retry safely and add CLI concurrency coverage.

**2026-11-07T16:57:20Z - @Copilot**
Round 2 corrective implementation dispatched for `02-S-003`; preserve the round 1 fixes and history.

**2026-11-07T17:00:00Z - @Copilot**
Round 2 fix frozen for scoped review at base `dd35373c14158ddbee742976be151a81aff61f27`; HEAD remains that base with issue 02 changes uncommitted. SHA-256: `src/commands/sdd/sdd-command.ts` `8706f084860cd2759fb61c9fb6d9d30129bef0a8d32374e97464f068aaeefd3a`; `tests/sdd-issues.test.ts` `3a1033302afb8e04728fa89e3538eb5c8208d8d11c6ab0a23df9e297c6c82bd0`; unchanged issue 01 tests `db3bbc0153b6989af9302e4e40fc9be53dcd184e4e2b1fb5293919292f931490`; `docs/agents/issue-tracker.md` `9dd964dadb13ec7576ef342c67cfe6de1727b2885d788480540c65be611157a4`; `docs/agents/tooling.md` `568818cddf56133eb01cf6ae4d3159e56e14bc7ae5de8dbe068df5700ea94156`. `just test::test tests/sdd-issues.test.ts tests/sdd-create-status.test.ts` passed 32 tests; packaged CLI tests passed 5; formatting, lint, types, build, and diff check passed. All round 1 findings remain addressed; current review scope is `02-S-003` and regressions.

**2026-11-07T17:10:00Z - @Copilot**
Round 2 review at `../reports/02-round-2-review.md` returns Spec PASS and Quality PASS for the selected correction; `02-S-003` is ADDRESSED and no new blockers were found. Together with the initial review at `../reports/02-review.md` and round 1 review at `../reports/02-round-1-review.md`, all ticket criteria and blockers are covered. Controller accepts issue 02. Parked nonblocking test-hardening recommendation: make/assert the CLI regression test's issue A-before-B read ordering; the current frozen Linux test run reproduced the race, so this is not an acceptance blocker. Follow up if the test matrix includes filesystems with differing enumeration order.

**2026-11-07T17:10:20Z - @Copilot**
Controller-owned integration authorized by the user. Commit all issue 02 changes and durable reports; the recorded successful commit and clean worktree complete integration.
