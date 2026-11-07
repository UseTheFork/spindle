# Issue 02 — Round 1 Corrective Spec and Quality Review

## 1. Scope and snapshot

- **Phase:** Corrective issue review, round 1.
- **Scope:** Fixes for `02-S-001`, `02-S-002`, and `02-Q-001`, plus
  fix-induced regressions in the touched audit, `ready`, and recovery paths.
  This report updates only affected portions of the initial review; it does
  not replace that review's coverage of unaffected issue 02 behavior.
- **Base:** `dd35373c14158ddbee742976be151a81aff61f27`.
- **Fixed identity:** Base plus the frozen issue 02 worktree. I verified the
  supplied SHA-256 values for:
  - `src/commands/sdd/sdd-command.ts` —
    `1350729d7b18165f70d8f664bed846c9d6500f27028aab4d3789998f8bc1f46f`
  - `tests/sdd-issues.test.ts` —
    `52aab0b35f645c58717aec7063aa7fcbd3c54bdba954ca58bcc6842e45271669`
  - `tests/sdd-create-status.test.ts` —
    `db3bbc0153b6989af9302e4e40fc9be53dcd184e4e2b1fb5293919292f931490`
  - `docs/agents/issue-tracker.md` —
    `9dd964dadb13ec7576ef342c67cfe6de1727b2885d788480540c65be611157a4`
  - `docs/agents/tooling.md` —
    `568818cddf56133eb01cf6ae4d3159e56e14bc7ae5de8dbe068df5700ea94156`
- **Requirements/history:** Ticket 02 and its comments; `spec.md` and
  `design.md`, especially issue comment placement, read-only queries,
  dependency-aware readiness, and interrupted-write recovery; applicable
  tracker/tooling and testing instructions; `GLOSSARY.md`; ADRs 0003/0004;
  implementation report `reports/02-implementation.md`; and initial review
  `reports/02-review.md`. Initial verdicts were Spec **FAIL**, Quality
  **FAIL**. There were no prior controller rulings or corrective attempts.
- The tracked `just tool::git diff` is against HEAD and includes the initial
  issue implementation, not a separately supplied round-only patch. I
  inspected the current affected source paths and the complete untracked issue
  test file against the prior review's precise findings. This limits
  line-by-line attribution to the round-only diff, but the fixed identity and
  behavior under review are resolved.

## 2. Evidence and limitations

**Controller-supplied evidence** for the fixed source/test hashes above:

- `just format::format src/commands/sdd/sdd-command.ts tests/sdd-issues.test.ts`
  — passed.
- `just test::test tests/sdd-issues.test.ts tests/sdd-create-status.test.ts`
  — passed, 31 tests, 0 failures.
- Targeted `just lint::check` including source, issue tests, create/status
  tests, and both guidance files — passed.
- `just test::types` — passed; `just build` — passed before packaged testing.
- `just test::test tests/packaged-cli.test.ts` — passed, 5 tests, 0 failures.
- `just tool::git diff --check` — passed.

The implementation report also supplies RED/GREEN evidence for all three
corrections. I did not run these tests or checks. I inspected the current
`ready`, `#assertReadyReadable`, `#appendAudit`, and `#recoverWrites`
implementations, the relevant surrounding code, and all of
`tests/sdd-issues.test.ts`. The tests add public CLI assertions for insertion
before a following section, normal and pending-journal `ready` non-mutation,
and preserving all targets and the journal on a later recovery conflict.

The supplied checks cover this fixed identity, but the `ready` tests do not
exercise concurrent triage operations interleaving with its per-file reads.
The implementation's stated limitation (a complete mutation can begin and
finish between the two guards) is therefore not verified as safe for the
returned queue; see `02-S-003`.

## 3. Spec

**Verdict: FAIL.**

- **Comments/history (`02-S-001`):** `#appendAudit` now locates the existing
  Comments section and inserts before the next level-one or level-two heading,
  preserving subsequent section content. The new public CLI test adds a
  following `## Follow-up` section and checks the new attributed entry remains
  in Comments while the later section is unchanged. The reported requirement
  is met.
- **Read-only `ready` (`02-S-002`):** `ready` no longer acquires/removes a
  write lock or invokes recovery. It checks for a pending journal or issue
  lock before and after reading, and returns a diagnostic without changing
  workspace state when either is present. The normal and pending-journal tests
  compare workspace contents/mtime and Git status. This addresses the
  mutation defect. However, the two guards do not guarantee a coherent queue
  when multiple serialized issue mutations complete between reads; the new
  finding below blocks the readiness contract.
- **Recovery (`02-Q-001`):** `#recoverWrites` now validates every journal
  entry, target safety, and current before/after content before applying any
  pending write. The deterministic conflict test verifies the earlier issue,
  conflicting ledger, and journal all remain byte-for-byte unchanged. The
  original partial-publication defect is addressed.
- The other acceptance criteria and unaffected initial-review coverage are
  not re-reviewed here; consult `reports/02-review.md`. This scoped report
  does not supersede that review's finding history or establish coverage of
  unrelated behavior.

## 4. Quality

**Verdict: FAIL.**

The three fixes are localized and public CLI tests assert observable document,
filesystem, and diagnostic behavior. Recovery preflight is correctly
separated from publication, and the audit test checks both placement and
preservation rather than only the returned command result. The ready guard
preserves read-only behavior for observed locks/journals, but its successful
result can combine different issue states into a queue that was never valid.
This is a demonstrated correctness gap, not a concern about style or
implementation preference. No separate material unnecessary complexity was
identified in this scoped change.

## 5. Findings

### 02-S-001 — Audit entries can be appended outside `## Comments`

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts`, `#appendAudit`
  (current lines 757–768); public coverage in
  `tests/sdd-issues.test.ts`, “issue comment appends explicit UTC attribution
  without inferring reporter.”
- **Disposition:** **ADDRESSED**
- **Evidence/impact:** The helper inserts within the Comments section before
  the next same-or-higher-level heading. The public CLI test verifies
  attribution, existing history, the later section's exact content, and
  placement. Current focused GREEN evidence covers the test file on the fixed
  snapshot.
- **Required correction:** None; the supplied correction and verification
  address the finding.

### 02-S-002 — `ready` mutates the workspace

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts`, `ready` and
  `#assertReadyReadable` (current lines 598–638).
- **Disposition:** **ADDRESSED**
- **Evidence/impact:** `ready` performs read-only checks for a lock and recovery
  journal around its reads; it neither creates/removes a lock nor calls
  recovery. Public tests verify normal and pending-journal calls leave
  workspace files/directories and Git status unchanged. A pending journal is
  explicitly rejected with a diagnostic directing the caller to a mutating
  issue command. The accepted read-only contract does not require `ready` to
  recover a pending journal.
- **Required correction:** None for the original mutation defect. The
  separate coherence issue is recorded as `02-S-003`.

### 02-Q-001 — Recovery applies earlier writes before checking later conflicts

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts`, `#recoverWrites`
  (current lines 849–899); public conflict test in
  `tests/sdd-issues.test.ts`.
- **Disposition:** **ADDRESSED**
- **Evidence/impact:** Recovery accumulates pending targets only after
  validating the full journal and all current contents; publication begins
  after preflight completes. The deterministic later-ledger-conflict test
  asserts neither target changes and the journal is preserved. The fresh
  focused test evidence covers this test on the fixed snapshot.
- **Required correction:** None; the supplied correction and verification
  address the finding.

### 02-S-003 — `ready` can return a queue assembled from incompatible issue states

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts`, `ready` reads the ledger and
  then calls `#readIssues` at lines 603–626; `#readIssues` reads issue files
  sequentially at lines 658–680; the two guards are at lines 630–638.
- **Defect:** The before/after lock and journal checks only detect a mutation
  that overlaps one of those checks. `ready` does not hold a read-consistency
  mechanism while reading issue files. Two supported triage mutations are
  serialized with each other, but can both acquire, write, and release the
  lock between `ready`'s reads. For example, with two dependency-free,
  unstarted issues, start with issue A `ready-for-agent` and issue B
  `needs-info`. If `ready` reads A first, then A is triaged to `needs-info`
  and B to `ready-for-agent`, and then `ready` reads B, it can return both A
  and B as ready. At no point were both eligible. The final guard sees no
  active lock or journal and permits this successful, mixed-state result.
- **Impact:** A controller can be told that an issue is eligible when it was
  not eligible in any coherent queue state, violating the dependency-aware
  queue contract and potentially dispatching work based on a false readiness
  result. The documented single-mutation limitation does not cover this
  sequence of serialized operations.
- **Required correction:** Preserve the read-only contract while ensuring
  `ready` returns a coherent view of issue/ledger state or fails/retries when
  that view cannot be established. Add public CLI concurrency coverage for
  interleaved serialized triage operations that would otherwise produce a
  mixed queue.

## 6. Observations and remaining context

- All three supplied findings are accounted for and are **ADDRESSED** on the
  fixed snapshot.
- `02-S-003` is a new blocking finding specific to the disclosed concurrent
  `ready` limitation. Its race is established by the current sequential
  per-file reads and the gap between the two guards; no dedicated
  concurrency test for that case is included in the supplied test suite.
- Initial issue 02 review history remains `Spec FAIL` / `Quality FAIL`; its
  unaffected coverage is preserved in `reports/02-review.md`. This scoped
  corrective report does not redo that coverage or make an acceptance or
  integration ruling.
