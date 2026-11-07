# Issue 02 — Initial Spec and Quality Review

## 1. Scope and snapshot

- **Phase:** Initial issue review.
- **Scope:** Ticket 02, “Create, triage, and organize issues,” including the
  complete source change from the supplied base, the new public CLI tests, and
  the updated issue-tracker and tooling guidance. The controller's final
  type-driven triage validation simplification is included. Ticket 03 and later
  behavior is not reviewed.
- **Base:** `dd35373c14158ddbee742976be151a81aff61f27`.
- **Reviewed identity:** Base plus the frozen dirty/untracked changes. The
  reviewed source, test, and guidance hashes match those recorded in the issue:
  - `src/commands/sdd/sdd-command.ts` —
    `204b7f189ca3742384408eb8ef4f979246110ce8d5b2faccb4fcac8bac2b39e4`
  - `tests/sdd-issues.test.ts` —
    `ddc2099fead5b0a2a851e7123f19a485c2fec2ec74f97975118809cf5097175e`
  - `docs/agents/issue-tracker.md` —
    `9dd964dadb13ec7576ef342c67cfe6de1727b2885d788480540c65be611157a4`
  - `docs/agents/tooling.md` —
    `568818cddf56133eb01cf6ae4d3159e56e14bc7ae5de8dbe068df5700ea94156`
- **Requirements:** Ticket 02 and its comments; `spec.md`, especially
  “Command contracts” and testing decisions; selected `design.md`, especially
  the issue command contracts, comment history, read-only query requirement,
  and persistence/recovery rules. Also consulted the integrated issue 01
  contract/reports, repository instructions, tracker/tooling guidance,
  `GLOSSARY.md`, and ADRs 0003 and 0004.
- **History/rulings:** No prior issue 02 findings or controller rulings were
  supplied. Issue 01 is integrated; no issue 03+ implementation is in scope.

## 2. Evidence and limitations

**Controller-supplied evidence** for the frozen snapshot:

- `just format::format src/commands/sdd/sdd-command.ts tests/sdd-issues.test.ts docs/agents/issue-tracker.md docs/agents/tooling.md` — passed.
- `just test::test tests/sdd-issues.test.ts tests/sdd-create-status.test.ts` — passed, 28 tests.
- `just lint::check src/commands/sdd/sdd-command.ts tests/sdd-issues.test.ts tests/sdd-create-status.test.ts docs/agents/issue-tracker.md docs/agents/tooling.md` — passed.
- `just test::types` — passed; `just build` — passed.
- `just test::test tests/packaged-cli.test.ts` — passed, 5 tests.
- `just tool::git diff --check` — passed.

I inspected the complete assigned diff, the full new issue test file, and the
updated guidance. I did not run these commands. The implementation report's
source/test hashes predate the final frozen hashes above; its historical
RED/GREEN claims are not treated as evidence for the final contents. The
controller-supplied final test/type/build/lint/format evidence does cover the
frozen snapshot. The issue tests cover normal concurrency and a deterministic
interrupted publication, but do not cover a conflicting later journal target,
read-only behavior of `ready`, or audit appending when `## Comments` is not the
last Markdown section.

## 3. Spec

**Verdict: FAIL.**

- **Create/defaults and identity:** The CLI requires named title, reporter,
  category, and author; validates category; allocates IDs per feature using
  existing Markdown and ledger IDs; prevents overwrite; initializes front
  matter defaults and ledger-only `unstarted` execution. Public CLI tests cover
  defaults, per-feature IDs, invalid category, attribution, and no overwrite.
- **Update and Markdown preservation:** Update changes only title, reporter,
  and dependencies, preserves triage and ledger progress, and keeps requirements,
  criteria, comments, and custom metadata. Dependencies are validated against
  the complete issue graph before mutation.
- **Triage and attribution:** All supported category/status pairs are accepted;
  invalid values and missing details/author are rejected; rationale is
  timestamped and attributed. Comments do not infer the author from reporter.
- **Dependency validation and readiness:** `blocked_by` is read from YAML and
  graph validation rejects missing references and cycles, including externally
  edited graphs. The queue includes only `ready-for-agent`/`unstarted` issues,
  shows unmet dependencies, and checks Markdown/ledger correspondence. However,
  `ready` is not read-only as required by the selected design: it creates and
  removes a lock file on every invocation, and can write target files/remove a
  recovery journal.
- **Comments/history:** Existing body text is retained and UTC attribution is
  explicit. However, appended history is only guaranteed to be under
  `## Comments` when that is the last section in the document. Direct Markdown
  editing permits subsequent sections, in which case new entries land under
  the later section instead.
- **CLI contract and guidance:** Commands use explicit named `--spec`/`--issue`
  selection, consistent details/author options, explicit errors, and generated
  YAML only. Tracker guidance reflects the delivered issue format and
  attribution model; tooling guidance includes commands and focused Just checks.
- **Concurrency and recovery:** The per-feature lock serializes issue
  allocations and updates; the journal provides repeatable normal recovery
  without duplicating audit entries. The recovery path can nevertheless
  partially publish a multi-file journal when a later destination conflicts;
  see `02-Q-001`.
- **Tests:** Public CLI tests cover defaults, metadata preservation, enums,
  dependencies, queue eligibility, concurrent mutations, and interrupted
  multi-file publication. The missing edge-case assertions above leave the
  demonstrated defects uncovered.

## 4. Quality

**Verdict: FAIL.**

Strengths include public-boundary assertions of output, persisted Markdown and
ledger state, explicit diagnostics, concurrent operations, and a deterministic
recovery fixture. Path, symlink, ignored-destination, and file-mode safety are
also addressed. The controller's triage simplification validates the unchanged
dependency graph rather than projecting category/status fields into it; it does
not alter triage metadata and is behavior-preserving.

The defects below affect history placement, the promised read-only query
boundary, and safe conflict handling in recovery. The journal and short-lived
lock are justified by the requirements; I found no separate material
unnecessary complexity.

## 5. Findings

### 02-S-001 — Audit entries can be appended outside `## Comments`

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:753-758`
- **Defect:** `#appendAudit` checks that a `## Comments` heading exists, then
  appends to the end of the entire body. It does not insert the entry in the
  Comments section.
- **Impact:** If a user directly edits an issue to add any section after
  Comments, subsequent create/update/triage/comment history is written under
  that later section, contrary to the required audit location and making issue
  history harder to find.
- **Required correction:** Insert each attributed entry within the existing
  Comments section while preserving later sections and their content. Add
  public CLI coverage with a section following Comments.

### 02-S-002 — `ready` mutates the workspace

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:602-605`; lock creation/removal
  in `#acquireIssueLock`; recovery writes/removal in `#recoverWrites`
- **Defect:** `ready` acquires a lock by creating and deleting
  `.sdd-issues.lock`. It also calls `#recoverWrites`, which may atomically
  rewrite the ledger or issue Markdown and unlink the journal. The selected
  design explicitly includes `ready` among read-only feature queries.
- **Impact:** Merely inspecting readiness changes workspace files (and can
  publish recovered content), violating the read-only contract and surprising
  callers who use readiness as an observation.
- **Required correction:** Keep `ready` observational and non-mutating,
  including avoiding a write-based lock. Route recovery through an explicitly
  mutating operation or obtain a canonical requirement decision that changes
  the read-only contract. Add a test that snapshots workspace files before and
  after normal and pending-journal `ready` calls.

### 02-Q-001 — Recovery applies earlier writes before checking later conflicts

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:849-881`
- **Defect:** `#recoverWrites` validates one journal entry and immediately
  writes its `after` content before validating the remaining entries. For a
  create journal ordered with the issue file before `sdd.json`, if the issue is
  still at `before` but the ledger has conflicting external content, recovery
  publishes the issue and only then throws on the ledger.
- **Impact:** A conflict that is detectable before mutation leaves Markdown and
  ledger inconsistent and the journal pending. Subsequent operations continue
  to fail until manual repair, despite the conflict being reported as
  preserved. This weakens recovery safety and can leave issue progress
  unpublished.
- **Required correction:** Preflight every journal entry, target safety check,
  and current-content (`before`/`after`) comparison before applying any write;
  only then begin publication. Add a deterministic conflict test asserting no
  target changes when preflight detects a later conflict and that the journal
  remains available for resolution.

## 6. Observations and remaining context

- New findings are `02-S-001`, `02-S-002`, and `02-Q-001`; there are no
  controller rulings to preserve.
- The final supplied checks pass, but the uncovered scenarios above are not
  established by those passing results.
- Scope excludes issue 03 and later behavior. No other blocking or
  nonblocking observations were identified.
