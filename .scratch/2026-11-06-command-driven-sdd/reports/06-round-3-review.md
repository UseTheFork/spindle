# Issue 06 — Corrective Review, Round 3

## Scope and snapshot

- **Phase/scope:** Controller-owned documentation-only corrective review for `06-Q04`. This report evaluates the correction and its consistency, not the full implementation again. The prior complete issue-06 Spec/Quality PASS and Q01–Q03 dispositions remain the initial implementation coverage; this report does not re-adjudicate them or make an acceptance/integration decision.
- **Snapshot:** Supplied base and HEAD are both `ed1c9ee83f0fa6c057395cd03e6e1a7966b57230`. Supplied prior/current SHA-256 values:
  - `docs/agents/issue-tracker.md`: `3702eeb0b7cb87452a423e9a78b929f9e516fa98d6ec0347fd61a5275218defd` → `5d9f14bfe71c0ee9906ac129ae92e6ce73bbec2b13d4e5e4c1ef1f1e1e73a31f`
  - `docs/agents/tooling.md`: `7a21de41426aa19b4051fabdd0804360b0c43308929f29e56b0f7240bd5e6f76` → `c3c703bca5a87ddfbfad2eee940ab329ea0cf99acea6624a4aa8a9d8a5ecc329`
- I verified the current documentation hashes locally. The supplied remaining implementation identity matches the round-2 report; the correction changes only the two guidance files.
- **Requirements/history:** Issue 06, feature `spec.md` and `design.md`, and round-2 report were read. `06-Q04` requires guidance that fixed evidence be current, pass required checks, and differ from every observation snapshot; invalid observations may be dismissed with an explanation. The preceding report marked Q04 Minor/nonblocking and left Q01–Q03 addressed.
- **Change examined:** Current guidance at `docs/agents/issue-tracker.md:133-139` and `docs/agents/tooling.md:51`, together with the CLI fixed-ruling checks and relevant public test.

## Evidence and limitations

- **Controller-supplied, not run by me:** Formatting passed for both Markdown files; `just tool::git diff --check` passed. `just lint::check` exited nonzero because oxlint found no Markdown files; no Markdown lint or docs test is configured.
- **Prior controller-supplied evidence, not run by me:** The round-2 unchanged implementation snapshot passed formatting, targeted lint, type-check, build, 99 focused tests, 5 packaged tests, and diff check. This supports retained initial implementation coverage only; it is not evidence that a docs test ran.
- **Personally inspected:** Current guidance, its recorded prior wording/defect in the round-2 report, the CLI check at `src/commands/sdd/sdd-command.ts:2346-2373`, and test assertions at `tests/sdd-workflow.test.ts:959-978`. I ran no project checks.
- **Limitations retained from round 2:** The full project suite and reviewer-agent behavior remain unverified. No Markdown-specific lint or documentation test is available. These are evidence limitations, not missing assignment context.

## Spec

**PASS** for this nonblocking corrective scope; Q04 remains a demonstrated documentation defect, but not a blocking defect.

- `docs/agents/issue-tracker.md:134-139` now correctly states that `fixed` requires a current CLI snapshot with passing required checks and that it must differ from every snapshot where the finding was observed. It also retains dismissal with an invalidity explanation and deferral with rationale plus follow-up.
- `docs/agents/tooling.md:51` does not state the same condition precisely: it says fixed requires checks on a snapshot “newer than every observation snapshot.” The CLI compares content-snapshot identities for equality (`sdd-command.ts:2353`) and requires the evidence to match the current identity; a content snapshot is not an ordered timestamp. Thus “newer” is ambiguous and does not explicitly establish that the identity differs from *every* observation snapshot, as required. The summary mentions dismissal and deferral rationale/follow-up, but does not resolve this fixed-evidence gap.

## Quality

**PASS.** The detailed tracker guidance is accurate and retains the other ruling requirements. The CLI and focused test corroborate that fixed evidence must match the current snapshot, differ from every observation snapshot, and have passing required checks; the test also verifies same-snapshot rejection and changed-snapshot verification. However, the shorter tooling summary is not fully consistent with that contract. Replacing “newer than” with an explicit “current snapshot that differs from every observation snapshot” would remove the ambiguity without adding material complexity.

## Findings

### 06-Q04 — Finding guidance omits the changed-snapshot condition for `fixed`

- **Severity:** Minor; **blocking:** No.
- **Location:** `docs/agents/tooling.md:51` (summary command description).
- **Defect/impact:** “A snapshot newer than every observation snapshot” does not accurately express the CLI’s identity comparison. It can be read as a temporal ordering and does not explicitly require the current evidence snapshot to differ from every observation snapshot. This leaves the command summary incomplete even though the detailed tracker guidance is correct.
- **Required correction:** State that fixed requires passing required checks on the current CLI snapshot and that this snapshot differs from every snapshot where the finding was observed. Preserve dismissal with rationale and deferral with rationale plus follow-up.
- **Disposition:** **NOT ADDRESSED.** The issue-tracker location now contains the required wording, but the second assigned guidance location retains the ambiguous “newer than” phrasing.

## Observations and remaining context

- No additional findings. The wording correction is nonblocking; this report does not decide acceptance, integration, or execution state.
- Initial implementation coverage and Q01–Q03 dispositions are preserved from the round-2 report. This scoped report does not re-verify the full implementation or resolve the full-suite and reviewer-agent behavior limitations.
