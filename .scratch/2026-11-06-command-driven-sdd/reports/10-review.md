# Issue 10 — Initial Spec and Quality Review

## 1. Scope and snapshot

- **Scope / phase:** `INITIAL_ISSUE` / `INITIAL`; comprehensive review of issue
  10's whole-spec delivery implementation, including shared issue-workflow
  changes and the five-file product change.
- **Comparison:** base and HEAD are both
  `e8f4040071a0fc13e41e81ec7fb263542daa1fbd`; reviewed content is the supplied
  working-tree diff against that revision. No untracked product files or binary
  product changes were reported.
- **Reviewed paths and supplied SHA-256 identities:**
  - `src/commands/sdd/sdd-command.ts` —
    `78480e398f212ebfde0a1e942f1ef6333de5b8b3c8ca6105c29c548460980f22`
  - `src/blueprints/skills/int-subagent-driven-dev/references/full-spec.md` —
    `5cce53199f29894b78e999b730b4de4b73ccd0f15dbff892f5ce5ab1e32ba38e`
  - `tests/sdd-create-status.test.ts` —
    `71d324c8f82c61984e334b8b9989395277e8ef3aaca9e79590b22406afeda2da`
  - `tests/sdd-workflow.test.ts` —
    `2640bbe6228c578fe6985b28f516074f7fb7df572eb74a7fb22bf51eb2afbc8a`
  - `tests/packaged-cli.test.ts` —
    `746fee0dfc8ae45c8d0a2f98e421e87676a03fe9aeeccbca72a6b85412943f57`
- **Requirements read:** issue 10 and all its comments; canonical `spec.md` and
  `design.md`; issue 08's ruling that issue 10 adds delivery scope while
  reusing issue 08's correction contracts with independent histories; issue
  09's caller-owned integration contract and rulings. Applicable repository
  instructions, glossary/domain docs, ADRs 0003 and 0004, and Just tooling
  guidance were also read. No prior issue-10 review findings or rulings.
- **Change source:** complete diff retrieved with the supplied read-only
  `just tool::git diff <base> -- <five paths>` command; matching current code
  and tests were inspected.

## 2. Evidence and limitations

- **Controller-supplied evidence on the exact snapshot:** `just format::check`
  for all five product files, `just lint::check` for the four changed
  TypeScript files, `just test::types`, `just build`, and
  `just tool::git diff --check` passed.
- **Controller-supplied focused tests:** the six-file regression invocation
  initially reported 130/132 passing; its two packaged fixture failures
  occurred while the build was replacing assets. All 127 non-packaged tests
  passed. After the build completed, the separate unchanged-snapshot
  `just test::test tests/packaged-cli.test.ts` run passed 5/5. Thus the
  supplied evidence covers all 132 focused tests across runs, but is not a
  single 132/132 run. The full repository suite was not run.
- I inspected the implementation report's full history, including its initial
  incomplete handoff and two check-driven corrections. Those earlier incomplete
  or failing results are not treated as final evidence; the controller's
  current-snapshot evidence above is.
- I did not personally run project checks, per assignment. Public CLI coverage
  exercises multi-issue integration and finish, delivery findings and separate
  histories, specialist batches, stale evidence, correction/resume/adjudication,
  and required/optional retrospectives. Delivery-specific interruption/fault
  recovery and post-finish lifecycle behavior are not directly tested.

## 3. Spec

**Verdict: FAIL**

- **Explicit delivery scope and shared contracts — PASS.** Delivery
  review/check/findings/correction/resume operations require `--scope delivery`
  and reject simultaneous `--issue`; delivery findings and correction history
  are stored separately.
- **Aggregate scope and current evidence — PASS.** Aggregate review requires
  all issues integrated, compares the confirmed inventory with the Git-derived
  feature inventory, and binds review/check evidence to content and
  requirements identities. Required specialist assignments are batched and
  checked alongside the comprehensive reviewer.
- **Delivery findings and progress-based correction — PASS.** Findings retain
  report/snapshot provenance, separate IDs and rulings; corrections persist
  attempts, assessments and adjudication, and resume returns the current
  assignment without resetting history. No fixed retry cap was found.
- **Git and caller-owned final changes — PASS.** The delivery baseline derives
  from integrated issue history; aggregate identities cover feature changes
  and requirements; finish rejects pending final code changes rather than
  committing them.
- **Finish and retrospective policy — FAIL; `I10-R1`.** After successful
  completion, delivery commands can still mutate required checks and other
  workflow state without clearing or guarding `delivery.finished`. For
  example, `#deliveryChecksRecord` accepts a failed result after finish and
  changes execution to `changes-requested` (`sdd-command.ts:2393-2456`), while
  `#deliveryStatus` still unconditionally reports action `finished` whenever
  `delivery.finished` exists (`:6397-6399`). Conversely,
  `#deliveryResume` has no finished-state branch and falls through to
  `nextAction: "review"` for an otherwise completed delivery (`:6117-6122`).
  Thus status can simultaneously claim completion and expose failed/stale
  evidence, and resume contradicts status. This violates the durable completion
  and exact next/status contract.
- **Controller ownership and handoff — FAIL; `I10-R2`.** `finish` validates an
  author but never verifies it matches `delivery.owner` or requires the
  explicit `resume --confirm-handoff` path (`sdd-command.ts:6155-6162`).
  Other delivery mutations check the recorded owner (for example
  `:2400-2402`, `:3547-3550`); finish changes execution state and writes the
  completion audit entry. A different author can therefore finish without
  recording the ownership handoff required by the workflow.
- **Shipped full-spec guidance — partial; `I10-R3`.** The guidance correctly
  describes the aggregate scope, reviewer batch, correction and finish gates.
  However, its command examples omit required arguments: e.g.
  `full-spec.md:12-14` shows `checks require --scope delivery` without
  `--spec`, `--command`, or `--author`, and `review --scope delivery` without
  `--spec` or `--author`. The CLI requires these options
  (`sdd-command.ts:1211-1222`, `:1318-1327`). As written, these are not
  executable examples and can misdirect the controller.

## 4. Quality

**Verdict: FAIL**

The implementation reuses the established Git identity, locking, atomic ledger
write and report-path mechanisms, and the public tests use the agreed CLI seam.
Assertions cover meaningful persisted state and subsequent command behavior;
the tests do not rely only on implementation details. The separate delivery
assignment/finding/attempt data and the supplied checks provide useful
cross-issue evidence.

The completion lifecycle defects in `I10-R1` and ownership bypass in `I10-R2`
are correctness and workflow-integrity failures. Delivery-specific interrupted
write/recovery paths remain an evidence gap; existing issue-scope recovery
coverage does not alone establish the new delivery branches.

No separate material unnecessary-complexity finding is established. Some
scope-specific operations duplicate validation and gate logic, but the
independent delivery histories and identities are required; the reviewed
evidence does not establish a safe behavior-preserving simplification.

## 5. Findings

### I10-R1 — Finished delivery can be mutated while still reported finished

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:2393-2456`,
  `:6117-6122`, `:6397-6399`
- **Defect / impact:** Delivery check recording (and other delivery mutations)
  remains available after completion. A failed check can change execution and
  invalidate final evidence while leaving `delivery.finished` set. Status then
  prioritizes the historical flag and reports `action: "finished"` despite
  blockers; resume reports `"review"` for a still-valid finished delivery.
  This makes persisted completion and permitted-action output contradictory.
- **Required correction:** Define and enforce the post-finish lifecycle:
  reject post-finish workflow mutations, or explicitly reopen/invalidate
  completion before changing evidence. Make status and resume derive consistent
  completion/next-action results from current evidence. Add public CLI
  regressions for a completed delivery followed by a failed/stale check and
  resume/status, including the supported re-finalization path if completion
  can be reopened.

### I10-R2 — Finish bypasses delivery ownership handoff

- **Severity:** Important
- **Blocking:** Yes
- **Location:** `src/commands/sdd/sdd-command.ts:6155-6162` and completion
  mutation at `:6281-6292`
- **Defect / impact:** `finish` accepts any valid `--author` without comparing
  it with `delivery.owner`. Unlike other delivery writes, it does not require
  a recorded handoff through `resume --confirm-handoff`; a different controller
  can complete and attribute the delivery without the required ownership
  transition.
- **Required correction:** Require the recorded delivery owner to finish, or
  require the same explicit confirmed handoff used by delivery resume before
  allowing a new owner to finish. Add a public CLI test that rejects a
  different author absent handoff and accepts it after confirmed handoff.

### I10-R3 — Full-spec command examples omit required CLI options

- **Severity:** Minor
- **Blocking:** No
- **Location:** `src/blueprints/skills/int-subagent-driven-dev/references/full-spec.md:11-25`
- **Defect / impact:** Delivery command examples are presented as invocations
  but omit mandatory `--spec` and `--author` options; the `checks require`
  example also omits its required `--command`. Copying them fails at the CLI
  boundary and obscures the explicit feature/attribution contract.
- **Required correction:** Show the required arguments (and command values) in
  each executable example, or label the snippets as abbreviated option
  fragments and point to a complete invocation.

## 6. Observations and remaining context

- The issue-08 ruling is respected in scope: delivery corrections have
  independent history while reusing progress-based continuation. Issue-09's
  caller-created commit requirement is preserved for final feature changes.
- The controller should retain the full-suite limitation and the
  non-single-run packaged-test scheduling detail when reconciling evidence.
- Delivery-specific interruption recovery and concurrent delivery mutation
  tests would strengthen coverage; this is an evidence limitation, not an
  additional demonstrated finding.
- No prior issue-10 finding IDs or controller review rulings were supplied.
