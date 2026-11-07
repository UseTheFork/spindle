# Issue 02 — Round 2 Corrective Spec and Quality Review

## 1. Scope and snapshot

- **Phase:** Corrective issue review, round 2, attempt 2.
- **Scope:** `02-S-003` and regressions in the `ready` read path, its serialized
  issue mutations, and the added concurrency test. This is a scoped correction
  review, not a replacement for the initial issue review or round 1 review.
- **Base:** `dd35373c14158ddbee742976be151a81aff61f27`.
- **Reviewed identity:** That base plus the frozen issue 02 dirty/untracked
  changes. I verified the supplied SHA-256 identities:
  - `src/commands/sdd/sdd-command.ts` —
    `8706f084860cd2759fb61c9fb6d9d30129bef0a8d32374e97464f068aaeefd3a`
  - `tests/sdd-issues.test.ts` —
    `3a1033302afb8e04728fa89e3538eb5c8208d8d11c6ab0a23df9e297c6c82bd0`
  - unchanged `tests/sdd-create-status.test.ts` —
    `db3bbc0153b6989af9302e4e40fc9be53dcd184e4e2b1fb5293919292f931490`
  - `docs/agents/issue-tracker.md` and `docs/agents/tooling.md` match the
    supplied hashes.
- **Requirements and context:** Ticket 02 and its comments; `spec.md` issue
  readiness and testing decisions; `design.md` issue command contracts and
  persistence/recovery rules; applicable tracker, tooling, and testing
  instructions; `GLOSSARY.md`; and implementation/initial/round 1 reports.
  Ticket 03 and later are out of scope.
- **History:** Initial Spec and Quality verdicts were FAIL with
  `02-S-001`, `02-S-002`, and `02-Q-001`. Round 1 marked those findings
  ADDRESSED and introduced the sole current blocker, `02-S-003`. This review
  preserves those IDs and rulings.

## 2. Evidence and limitations

**Controller-supplied verification** on the frozen identity (not run by me):

- `just test::test tests/sdd-issues.test.ts tests/sdd-create-status.test.ts`
  — passed, 32 tests.
- After a fresh `just build`, `just test::test tests/packaged-cli.test.ts`
  — passed, 5 tests.
- Formatting, targeted lint, `just test::types`, build, and
  `just tool::git diff --check` — passed.
- The full project test suite was not run.

I inspected the current source and the relevant complete `ready`, triage,
issue-write/recovery, and test paths. I did not run project checks. The
implementation report supplies the test-first failure on the pre-fix
implementation (the interleaving returned both A and B), followed by focused
GREEN evidence. I treat that as supplied historical evidence, not as a check I
ran.

## 3. Spec

**Verdict: PASS** for the selected corrective scope.

- **Coherent read-only readiness (`02-S-003`):** `ready` now checks lock and
  journal state, reads the ledger and all issues twice, compares exact ledger
  text and each issue's exact raw content, and retries up to three times when
  they differ. It fails explicitly after exhausted retries. It does not
  acquire a write lock, recover a journal, or write workspace files. A lock or
  pending journal encountered by the guards causes a safe diagnostic instead
  of a successful queue assembled during an observed write.
- **ABA and serialized triage transitions:** Logical status can cycle back
  (for example, `ready-for-agent` → `needs-info` → `ready-for-agent`), but
  supported triage mutations also append attributed audit entries. Thus the
  raw issue file does not return byte-for-byte to its former content; exact
  double collection detects the intermediate transitions even when the status
  value has returned. Repeated and concurrent triage commands use the same
  serialized write lock and append-only audit path. If changing writes keep
  the two collections from matching, `ready` exhausts its bounded retries and
  fails rather than returning an unverified queue.
- **Ledger/Markdown consistency and the collection interval:** Issue creation
  changes both the ledger and Markdown through the journaled atomic-write
  path; triage changes Markdown while leaving ledger execution unchanged.
  Both sources are compared across complete passes. Under the supported
  serialized operations, writes are atomic at each file and do not restore
  prior raw issue contents. If both complete collections match, the
  corresponding observations have an overlapping interval with unchanged
  contents; the successful result is consequently a coherent view, even if a
  later mutation makes it stale before the command returns. Mutations
  overlapping a guard are refused, and a complete mutation between guards
  changes the compared contents and forces retry. A byte-for-byte external
  revert or edits that bypass the serialized command protocol are outside
  this supported model; exact comparison alone would not detect such an ABA.
- **Public CLI coverage:** The added test starts the source CLI through the
  existing public invocation seam, pauses its `ready` child with a test-only
  preload, runs ordinary public `triage` CLI commands for A and B, resumes
  `ready`, and asserts the resulting queue contains only B and that `ready`
  did not alter the settled workspace. The supplied pre-fix RED result shows
  this interleaving exposed the original mixed queue.
- **Prior coverage:** The unaffected initial-review criteria and round 1
  corrections remain covered by `reports/02-review.md` and
  `reports/02-round-1-review.md`; this report does not redo those reviews.

## 4. Quality

**Verdict: PASS** for the selected corrective scope.

The repeated exact-content collection is appropriately paired with bounded
retry/failure behavior and read-only lock/journal guards. It is sufficient
under the repository's atomic-write and serialized-mutation protocol because
the public issue mutations are monotonic in raw content: triage/update/comment
append audit history, and create adds issue/ledger records. I found no
demonstrated way for those supported writes to produce identical double
collections spanning an incoherent state. No material unnecessary complexity
or fix-induced correctness regression was identified.

The test asserts public JSON behavior and uses external synchronization rather
than a production-only testing API. Its pause hook targets issue B, while
`#readIssues` consumes unsorted filesystem enumeration and the test does not
assert that A was read first. The supplied pre-fix failure confirms the
intended ordering occurred in the verification environment, but making the
ordering explicit would make the test more portable and ensure it always
reproduces the original interleaving.

## 5. Findings

### 02-S-003 — `ready` can return a queue assembled from incompatible issue states

- **Severity:** Important
- **Blocking:** Yes (original finding)
- **Location:** `src/commands/sdd/sdd-command.ts`, `ready` (current lines
  598–654) and `#readIssues`; public CLI regression test in
  `tests/sdd-issues.test.ts`, “ready does not combine triage states from
  interleaved serialized updates.”
- **Disposition:** **ADDRESSED**
- **Evidence and impact:** Exact double collection detects the A/B triage
  interleaving; bounded retries fail safely if no stable collection is
  observed. The test drives the commands through the public CLI and asserts
  the coherent settled queue. Controller-supplied focused tests passed on
  this identity; the implementation report also records the pre-fix test
  returning both issues.
- **Required correction:** None for the finding. As a nonblocking test
  hardening recommendation, make or assert the read order so the synchronization
  hook cannot miss the original interleaving on a filesystem with a different
  enumeration order.

**New findings:** NONE.

## 6. Observations and remaining context

- The initial review's unaffected acceptance criteria and findings remain
  subject to their recorded coverage and dispositions. Initial verdicts remain
  historically FAIL/FAIL; round 1 addressed `02-S-001`, `02-S-002`, and
  `02-Q-001`; this report marks only `02-S-003` ADDRESSED.
- The supplied focused, packaged CLI, formatting, lint, type, build, and diff
  checks cover the frozen identity. The full project suite was not run.
- This scoped report does not independently re-review unrelated ticket 02
  behavior or decide aggregate acceptance/integration.
