# Issue 02 Implementation Report

## Status

**DONE_WITH_CONCERNS** — assigned implementation and focused public CLI checks
are complete. This report does not claim ticket acceptance.

## Snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting revision: `dd35373c14158ddbee742976be151a81aff61f27`
- Final revision: `dd35373c14158ddbee742976be151a81aff61f27` (unchanged; no commit,
  staging, stash, or other Git mutation)
- The tested snapshot is the starting revision plus the dirty/untracked files
  below. Both final focused test commands passed on this snapshot. This evidence
  report is not an input to the tested code snapshot.
- Pre-existing controller-owned change preserved without editing:
  `.scratch/2026-11-06-command-driven-sdd/issues/02-create-triage-and-organize-issues.md`
  (SHA-256 `295e0a6fd4bd6e914622c47015ce60b524b546a303f404cfee045465cccf0a4a`).
- Implementer changes:
  - `src/commands/sdd/sdd-command.ts` (SHA-256
    `bcac06c3f03414e17ca3ef44d603f0891df8341f80616f09073f6caeb6a18b8d`)
  - `tests/sdd-issues.test.ts` (untracked; SHA-256
    `c50a3cb49da2743ff01010a6ef383cb5cfe7c42aaf5ca1fb2e53dd41dc2eeb2d`)
  - `docs/agents/issue-tracker.md` (SHA-256
    `9dd964dadb13ec7576ef342c67cfe6de1727b2885d788480540c65be611157a4`)
  - `docs/agents/tooling.md` (SHA-256
    `568818cddf56133eb01cf6ae4d3159e56e14bc7ae5de8dbe068df5700ea94156`)
  - This report:
    `.scratch/2026-11-06-command-driven-sdd/reports/02-implementation.md`

No other pre-existing worktree or untracked changes were present at assignment
start.

## Criteria, changes, and tests

- **Issue creation and defaults:** Added `sdd issue create` with required
  named `--spec`, `--title`, `--reporter`, `--category`, and `--author`.
  Category validation is closed to `bug | enhancement`. Per-feature `I-0001`
  allocation advances above existing Markdown and ledger IDs, with no
  overwrites. Front matter initializes `status: needs-triage` and
  `blocked_by: []`; ledger progress initializes `{ id, execution: unstarted }`
  and is not mirrored into Markdown. Creation appends an explicitly attributed
  UTC `Issue created.` audit entry.
- **Descriptive updates and triage:** Added `sdd issue update` for title,
  reporter, and dependencies only; `--blocked-by` sets the dependency list and
  `--clear-blocked-by` explicitly empties it. Updates preserve body, comments,
  triage state, custom front-matter metadata, and ledger execution. Category and
  status changes go through `sdd triage`, which requires a valid category and
  status, non-empty `--details`, and explicit `--author`, and appends the
  attributed UTC rationale. Public tests cover all ten valid category/status
  combinations and invalid enums.
- **Comments and attribution:** Added `sdd issue comment`; create, update,
  triage, and comment actions use explicit author attribution and retain
  existing requirements, criteria, YAML metadata, and comment history. No
  reporter or author is inferred.
- **Dependencies and ready queue:** `blocked_by` YAML front matter is the sole
  dependency authority. Update and `ready` reject missing references and
  cycles; queue evaluation also rejects externally edited invalid graphs.
  `ready --spec` returns only `ready-for-agent`, `unstarted` issues with
  integrated dependencies, and separately lists eligible issues with unmet
  dependency IDs. Tests exclude `ready-for-human` and already-claimed issues.
- **Serialization, safety, and recovery:** Issue operations use a short-lived
  feature lock; competing creation gets unique IDs and concurrent updates
  preserve both audit entries. Writes use an atomic recovery journal containing
  before/after content. Recovery is idempotent, preserves requirements and
  audit history, and stops without overwriting conflicting external content.
  Tests cover deterministic interrupted Markdown/ledger publication, ignored
  destinations, symlinked issue directories, and non-regular lock-path
  preservation. Atomic replacement preserves existing file modes and new
  files use umask-derived permissions. Ledger validation rejects duplicate
  issue progress IDs and ready checks Markdown/ledger correspondence; a public
  CLI test rejects duplicate progress records.
- **Guidance:** Updated local issue-tracker guidance for ID-based feature
  directories, YAML metadata, triage/dependencies, ledger-only execution, and
  attribution. Added command examples and the focused Just test recipe to
  `docs/agents/tooling.md`.

### TDD evidence

Behavior changes with verified RED-to-GREEN evidence:

- Initial `issue create` test failed because the CLI did not recognize
  `issue`; it passed after the command implementation.
- Creator-audit coverage failed because creation did not use its required
  author; it passed after adding the attributed history entry.
- Custom YAML metadata preservation failed on update; it passed after retaining
  non-command-owned front-matter keys.
- `--clear-blocked-by` failed as an unknown option; it passed after adding the
  explicit clear operation.
- Unsafe symlinked issue-lock coverage failed because the path was removed;
  it passed after recovery began preserving non-regular lock occupants.
- Atomic permission coverage failed because newly written issue files were
  owner-only; it passed after replacement preserved existing modes and new
  files adopted umask-derived modes.

Update, triage, comment, dependency/ready, concurrency, and interruption
recovery handlers were implemented together before several corresponding
characterization tests were added. Those tests passed on their first run; no
historical RED is claimed for them. This was not a pure refactor.
Duplicate-progress validation was also characterized after implementation; no
RED is claimed for that test.

## Verification

Fresh focused public CLI checks run by this implementer:

- `just test::test tests/sdd-issues.test.ts` — **passed**, 14 tests, 0 failures.
- `just test::test tests/sdd-create-status.test.ts` — **passed**, 14 tests,
  0 failures.

Not run by this implementer:

- `tests/packaged-cli.test.ts`: packaged verification awaits the controller's
  approved fresh build; the existing bundle was not rebuilt here.
- Formatting, lint, type checking, build, and ticket-wide regression checks:
  pending with the controller as assigned. These pending controller checks
  are not implementer failures and do not establish ticket acceptance.

## Self-review and remaining concerns

- No known issue-management behavior defect remains from the assigned scope.
- Issue metadata operations intentionally accept generated YAML-front-matter
  issues only; historical issue formats are not migrated.
- The recovery journal is a local recoverable protocol, not a filesystem-wide
  multi-file transaction. Conflicting external edits are preserved and
  reported for manual resolution.
- The packaged CLI surface and static project checks remain unverified until
  the controller runs its build and scheduled checks.

## Hand-back

The public CLI now supports per-feature issue creation, descriptive updates,
triage, attributed comments, authoritative dependency editing, and a
dependency-aware ready queue. The 14 issue-management tests and 14 directly
affected create/status regression tests pass on the snapshot above. No commit
was created; controller integration and ticket-wide verification remain
pending.

## Round 1 corrective implementation

### Status and scope

**DONE_WITH_CONCERNS** — implemented and focused-tested the assigned blocking
findings `02-S-001`, `02-S-002`, and `02-Q-001`. This is not a ticket
acceptance or review verdict. No previous corrective attempts or rulings were
supplied. Issue 01 is integrated in the base; issue 03 and later remain out of
scope.

### Snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting and final HEAD:
  `dd35373c14158ddbee742976be151a81aff61f27`; no commit or staging.
- Starting inventory exactly matched the assignment: modified issue 02 tracker,
  source, and two guidance files; untracked issue tests, this implementation
  report, and initial review report. No other worktree changes. Starting
  source SHA-256 was
  `204b7f189ca3742384408eb8ef4f979246110ce8d5b2faccb4fcac8bac2b39e4`;
  starting issue tests SHA-256 was
  `ddc2099fead5b0a2a851e7123f19a485c2fec2ec74f97975118809cf5097175e`.
- Final tested code snapshot is that HEAD plus the same dirty/untracked
  inventory, with these SHA-256 identities:
  - `src/commands/sdd/sdd-command.ts`:
    `0df31a222b31ff7050bd3a7c0655ec198aff42cefaa55ddee0c85c1f1fcdc722`
  - `tests/sdd-issues.test.ts` (untracked):
    `6a7dcdcc7449efead567ab8fba885768ee025da13d5df47e9a7ba9b4dee7f00b`
  - `tests/sdd-create-status.test.ts` (tracked, unchanged):
    `db3bbc0153b6989af9302e4e40fc9be53dcd184e4e2b1fb5293919292f931490`
  - `docs/agents/issue-tracker.md`:
    `9dd964dadb13ec7576ef342c67cfe6de1727b2885d788480540c65be611157a4`
  - `docs/agents/tooling.md`:
    `568818cddf56133eb01cf6ae4d3159e56e14bc7ae5de8dbe068df5700ea94156`
  - Controller-owned issue tracker:
    `40d72b70052a707e8b4e46f4fe665c66587f398dd5c0bb0745bd1b5f00a8bcec`
  - Initial review (untracked):
    `307398fd1fe88bbdee2f582610047263cfc7fdf2e025d60a1ba9b1255d154c73`
  - Spec:
    `c5eb1b663406eb76fd79f9ade8ed2a9e4fb54a1f175582fbc1709eed979114fc`;
    design:
    `b51c9790457c9a529e010c390daf07bc9c59673f360010823d197677631e239d`.
- This report was appended after testing; it is not a test input. The
  controller-owned issue, review, and guidance were not edited.
- Files changed in this round: source, untracked issue tests, and this
  append-only report.

### Finding-to-change and test evidence

- **02-S-001:** Audit entries are inserted in Comments before the next
  same-or-higher-level ATX heading, preserving later section content. The
  public issue-comment test checks UTC attribution, existing history, the
  new entry's section, and exact later-section content. RED:
  `just test::test tests/sdd-issues.test.ts` failed 1/14 because the new
  comment appeared after the later heading; the subsequent GREEN run passed
  14/14.
- **02-S-002:** `ready` no longer creates or removes a lock or runs recovery.
  It rejects a pending journal and refuses an existing issue-write lock without
  altering either; it checks again after reading. Public CLI tests compare
  workspace file contents and file/directory modification times plus Git
  status for normal and pending-journal calls. The recovery success test now
  invokes an explicitly mutating issue comment. RED: the issue suite failed
  2/16, showing a changed workspace directory timestamp on normal `ready` and
  a successful, mutating pending-journal invocation. GREEN: 16/16 passed.
  The pending fixture was subsequently strengthened to contain actual
  issue/ledger writes and passed in the final run.
- **02-Q-001:** Recovery validates all journal entries, safe paths, ignored
  destinations, and before/after content before publishing any target.
  A public CLI fixture keeps the earlier issue at `before` while the later
  ledger has conflicting external content, and checks explicit failure,
  byte-for-byte unchanged targets, and preserved journal. RED: the issue suite
  failed 1/17 because recovery had written the earlier issue; final GREEN is
  included in the 31-test run below.

All three corrections were behavior changes begun with failing tests, not pure
refactors. The successful recovery fixture also verifies prior history and
requirements survive without duplicated history.

### Fresh verification and self-review

- Run by this implementer in `/home/sincore/source/spindle`:
  `just test::test tests/sdd-issues.test.ts tests/sdd-create-status.test.ts`
  — **passed 31/31**, including all three corrective cases and issue 01
  create/status regression coverage, on the final code/test hashes above.
- Self-review: confirmed the preflight detects conflicts before publication and
  retains the journal, the existing controller triage dependency-graph
  validation remains intact, and no documentation, tracker, or unrelated
  files were edited. No additional finding identified within assigned scope.
- Limitations: recovery is still not a multi-file filesystem transaction;
  an application-time I/O failure or an external writer racing after
  preflight can interrupt publication. `ready` observes lock/journal state
  before and after reads but does not take a write lock, so it is not a
  linearizable snapshot against an entire concurrent write that begins and
  finishes between those checks. These are not claims of ticket acceptance.
- Not run by this implementer: formatting, lint, type checks, build,
  packaged CLI tests, and ticket-wide regression checks. They remain pending
  with the controller; they are not implementer failures.

### Hand-back

The three assigned findings have public CLI coverage and fresh focused GREEN
evidence. The controller owns subsequent checks, scoped re-review, acceptance,
and integration.

## Round 2 corrective implementation

### Status and scope

**DONE_WITH_CONCERNS** — implemented and focused-tested the assigned blocking
finding `02-S-003`. This report does not claim ticket acceptance. The round 1
fixes for `02-S-001`, `02-S-002`, and `02-Q-001` were preserved without
rollback or unrelated edits.

### Snapshot

- Checkout: `/home/sincore/source/spindle`
- Starting and final HEAD: `dd35373c14158ddbee742976be151a81aff61f27`;
  no staging or commit.
- The exact tested code snapshot is that base plus the preserved dirty and
  untracked inventory supplied at assignment, including round 1 source/tests,
  controller-owned issue/doc changes, and the two files changed this round.
  At final verification the relevant Git blob IDs were:
  - `src/commands/sdd/sdd-command.ts`:
    `15648274354259257480b61f08478df09ab61caf`
  - `tests/sdd-issues.test.ts`:
    `d2f40cfa2cb7bd7c6b12674105b5fc75fc555e79`
- Final worktree inventory remained the supplied inventory: controller-owned
  modified issue 02 tracker; modified `docs/agents/issue-tracker.md` and
  `docs/agents/tooling.md`; modified shared source; and untracked issue tests,
  this implementation report, initial review, and round 1 review. No other
  files were created or changed in the checkout. The ticket, docs, and prior
  reports were not edited.
- Files changed in this round: `src/commands/sdd/sdd-command.ts`,
  `tests/sdd-issues.test.ts`, and this append-only report.

### Finding-to-change and test evidence

- **02-S-003:** `ready` now checks a candidate ledger/Markdown view against a
  second complete read, including exact ledger and per-issue contents, with
  the existing lock/journal preflight around both passes. If inputs changed,
  it retries up to three times; if no stable view is observed, it fails with
  an explicit retry diagnostic. This preserves `ready`'s read-only contract:
  it creates no lock, performs no recovery, and writes no workspace files.
  Matching complete reads provide a coherent view for the supported
  atomic-write, serialized issue operations; sustained changes fail safely
  instead of returning a mixed queue.
- The public CLI concurrency test uses a temporary preload module in the
  `ready` child to pause its read immediately before issue B. While paused,
  the test runs the ordinary triage CLI first for A (`ready-for-agent` to
  `needs-info`), then for B (`needs-info` to `ready-for-agent`), and resumes
  `ready`. It asserts the coherent settled result contains only B and that
  `ready` did not alter the feature workspace after the triage writes. The
  preload is test-only; no production test API or concurrency framework was
  added.
- TDD evidence: before the production change,
  `just test::test tests/sdd-issues.test.ts` failed the standalone regression
  test (17 passed, 1 failed): actual output contained both `I-0001` and
  `I-0002`, while the coherent settled queue is only `I-0002`. After the
  implementation, the focused issue suite passed 18/18. The assigned final
  command `just test::test tests/sdd-issues.test.ts tests/sdd-create-status.test.ts`
  passed 32/32 on the snapshot above.

### Self-review, limitations, and pending checks

- Self-review confirmed `ready` remains read-only, preserves the existing
  pending-lock and pending-journal refusal behavior, compares all ledger and
  issue contents, and fails explicitly after bounded retries. No additional
  finding was identified within this correction's scope.
- Under sustained writes, `ready` may exhaust its three snapshot attempts and
  require the caller to retry; this is the specified safe failure mode, not a
  mixed-queue success.
- Not run by this implementer: formatting, lint, type checks, build, packaged
  CLI tests, and ticket-wide regression checks. They remain pending with the
  controller and are not implementer failures or evidence of acceptance.

### Hand-back

`02-S-003` now has deterministic public CLI interleaving coverage and fresh
focused GREEN evidence. The controller owns the remaining scheduled checks,
scoped review, acceptance, and integration.
