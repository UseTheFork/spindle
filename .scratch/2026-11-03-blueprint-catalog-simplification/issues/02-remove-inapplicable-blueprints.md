# 02: Remove retired and Stack-inapplicable content

Reporter: unknown
Category: enhancement
Status: ready-for-agent
Execution: integrated

Source: [Feature specification](../spec.md)

**What to build:** Initialization and update delete complete installed targets
when their catalog entries are removed or no longer match selected Stacks,
including managed Just imports, with explicit reporting and safe ownership
boundaries.

**Blocked by:** 01: Install and update through the Blueprint Catalog.

- [X] Both initialization and update delete targets for removed entries
      independently of their Stack filters, including when their sources no
      longer exist.
- [X] Both commands delete targets for active entries with no matching selected
      Stack. Multi-Stack entries remain applicable when any selected Stack
      matches; empty Stack lists remain universally applicable.
- [X] File entries delete only their target file; directory entries delete
      their complete target subtree, including local edits and nested additions.
- [X] Deletions require no confirmation and are not suppressed by conflict-skip,
      version decisions, or new-content selection options. Already-absent
      targets are normal no-ops; repeated reconciliation remains reliable.
- [X] Remove managed root imports for retired or Stack-inapplicable Just
      Modules while preserving unrelated root content and unlisted modules and
      imports.
- [X] Catalog entries disappearing entirely do not cause inferred deletion.
      Changing an entry's path does not infer its old destination; an explicit
      old-path removal entry performs any requested cleanup. No installation
      inventory or compatibility migration is introduced.
- [X] Validate deletion targets and ancestors, reject unsafe paths and
      symbolic-link traversal, and reject overlapping ownership before changes.
      Deletion never escapes the designated kind root or affects unrelated
      content.
- [X] Report every actual removal explicitly. Deletion failures produce
      unsuccessful exit status and actionable diagnostics rather than
      success-shaped outcomes. Expose planned deletion work for coordinated
      preparation in ticket 04.
- [X] Real CLI tests cover all kinds, both commands, edited targets, nested
      local additions, source-less records, absent targets, repeated runs, Stack
      transitions, multi-Stack matching, skip/new-content options, and Just
      import cleanup.
- [X] CLI tests verify missing catalog entries and path renames preserve old
      targets unless an explicit removal entry exists. Unsafe-target tests
      verify no writes or deletions outside declared roots.
- [X] Update directly related removal documentation and run focused tests and
      type checking through project Just recipes.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
**2026-11-03T17:23:59Z - @unknown**
Execution set to `claimed` at base `e1623d6536cda346245fe86b4b5963ac8ea2612a` in `/home/sincore/source/spindle`; ticket 01 is integrated and the worktree was clean before this tracker update.
**2026-11-03T17:24:30Z - @unknown**
Execution set to `implementing` at base `e1623d6536cda346245fe86b4b5963ac8ea2612a`; the SDD implementer is assigned ticket 02, with ticket 01 integrated as the dependency.
**2026-11-03T17:45:25Z - @unknown**
Execution set to `in-code-review` on the uncommitted ticket 02 snapshot based on `e1623d6536cda346245fe86b4b5963ac8ea2612a`; controller formatting was applied and the full suite (182/182), types, scoped format, and scoped lint checks passed.
**2026-11-03T17:46:00Z - @unknown**
Execution set to `in-review` on the same frozen ticket 02 snapshot; initial code, code-slop, and Spec/Quality reviews are dispatched in parallel.
**2026-11-03T17:50:37Z - @unknown**
Execution set to `changes-requested` after round-1 reviews on the uncommitted ticket 02 diff. Blocking finding `T02-R1-01`: a managed Just import can survive deletion of its module when the import alias differs from the module filename, leaving a dangling root import; match the managed import by resolved target path/stem and add a real CLI regression. Code review reported this as Minor; Spec/Quality review confirmed a blocking Important defect. Code-slop review found no issues. Reports: `../reports/02-code-review.md`, `../reports/02-code-slop-review.md`, `../reports/02-task-review.md`. One corrective dispatch is assigned (round 1 of five).
**2026-11-03T17:51:00Z - @unknown**
Execution set to `implementing` for corrective round 1 at base `e1623d6536cda346245fe86b4b5963ac8ea2612a`; finding `T02-R1-01` is assigned.
**2026-11-03T17:54:39Z - @unknown**
Execution set to `in-review` after round-1 correction of `T02-R1-01`. Controller verification on the fixed snapshot passed full tests (182/182), types, scoped format, scoped lint, and `just tool::git diff --check HEAD`. Scoped re-review is underway.
**2026-11-03T17:58:56Z - @unknown**
Execution set to `changes-requested` after scoped round-1 re-review. `T02-R1-01` (aliased managed import not removed) is addressed. New blocking-for-acceptance Minor `T02-R1-N01`: removing an aliased import can go unreported when its module file was already absent, because reporting reconstructs the deleted module filename from the import alias. Preserve the resolved target identity through import-removal reporting and cover an absent aliased module. Re-review: `../reports/02-round-1-review.md`; prior code/task reports: `../reports/02-code-review.md`, `../reports/02-task-review.md`. One corrective dispatch used; next is round 2 of five.
**2026-11-03T17:59:10Z - @unknown**
Execution set to `implementing` for corrective round 2 at the same uncommitted ticket 02 base; finding `T02-R1-N01` is assigned.
**2026-11-03T18:04:03Z - @unknown**
Execution set to `in-review` after corrective round 2 for `T02-R1-N01`. The controller applied formatting to the assigned removal test and reran the current gate successfully: full tests 184/184, types, scoped format, scoped lint, and `just tool::git diff --check HEAD`. Scoped re-review is underway.
**2026-11-03T18:08:10Z - @unknown**
Execution set to `accepted` on the uncommitted ticket 02 diff based on `e1623d6536cda346245fe86b4b5963ac8ea2612a`. All ticket checklist items are verified. Initial code/task reviews and scoped round-1/round-2 re-reviews passed; T02-R1-01 and T02-R1-N01 are addressed. Reports: `../reports/02-code-review.md`, `../reports/02-code-slop-review.md`, `../reports/02-task-review.md`, `../reports/02-round-1-review.md`, and `../reports/02-round-2-review.md`. Final fresh checks passed: full suite 184/184, types, scoped format, scoped lint, and diff check. Tickets 03 and 04 remain assigned downstream.
**2026-11-03T18:08:54Z - @unknown**
Execution set to `integrated` on the accepted ticket 02 diff based on `e1623d6536cda346245fe86b4b5963ac8ea2612a`. Final verification covers full tests (184/184), types, scoped formatting/lint, and diff check; all pending ticket 02 source, tests, docs, reports, and tracker evidence will be committed together before proceeding.
