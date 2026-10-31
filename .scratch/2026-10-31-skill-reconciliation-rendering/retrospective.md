# Retrospective

## Summary

- **`int-domain-modeling`:** loaded before assessing delivery evidence; its instructions and glossary/ADR formats were read and applied.
- **`int-writing-for-agents`:** loaded by the reader as part of its assessment process.
- **`int-writing-instruction`:** not loaded because no evidence-backed workspace-instruction candidate was supported.
- **Tickets:** all three were delivered and integrated: standard Nunjucks rendering and file handling (01), shared Skill reconciliation (02), and new-Skill adoption during update (03).
- **Review rounds:** each ticket had an initial review and one corrective round with scoped re-review. Ticket 03's first re-review was `UNVERIFIED` because its fix-package excerpt did not match the source; the corrected package resolved the mismatch and marked the finding addressed. The final aggregate code and code-slop reviews found no issues.
- **Blockers:** Ticket 01 logged two brief blocked intervals: 14:37–14:38Z and 14:46–14:47Z, about two minutes combined, over missing Just recipes and project checks. Repository-wide formatting also reported 28 files, but no duration is recorded; changed-file formatting passed. No implementation blocker was recorded for tickets 02 or 03. The duration of the temporary review-package mismatch is not recorded.
- **Final verdict:** integrated; final aggregate reviews reported no Critical, Important, or Minor findings. Final checks passed at `1d22f63579f59fbb8ac8c711c03e7ea49c9383f6` and were rerun at integrated HEAD `6a1a4678f9c1c42acb579a560799a2319f4635c5`: scoped formatting, lint, types, 65/65 tests, and `git diff --check`.

**Evidence read:** the full spec, all three ticket files and comment logs, ticket implementation/review/corrective-round reports, both final aggregate reports, and the complete integration diff `d8fdab23663a028cb0af96a3f485d4eeb0431a18..6a1a4678f9c1c42acb579a560799a2319f4635c5`. Applicable references included `GLOSSARY.md`, `.github/instructions/testing.instructions.md`, `docs/agents/domain.md`, and `docs/agents/tooling.md`. `GLOSSARY-MAP.md`, root/context ADR directories, and applicable `AGENTS.md` files are absent.

## Environment findings

### E1 — Automated checks; Medium

**Evidence:** Ticket 01 comments record that the prescribed `just test::test` recipe was unavailable, followed by maintainer-authorized repair of test and check recipes. The integration diff adds/imports Just recipes for tests, coverage, types, formatting checks, and lint checks. Final reports confirm the relevant checks passed on the verified implementation snapshot. No tracked `.github/workflows/*` or hook configuration was found. The ticket 01 implementation report also records that unscoped formatting reported issues in 28 repository files, while changed-file checks passed.

**Proposal:** If CI is not supplied externally, add a repository workflow at `.github/workflows/ci.yml` to run the Just lint, type, and test checks on pull requests and pushes. First resolve the existing repository-wide formatting backlog, or keep the formatter out of the global CI gate until it is clean. This would make checks reproducible without a controller-run gate and avoid a CI job that fails immediately on existing formatting debt.

**Already resolved friction:** The missing Just recipes that blocked ticket 01 were repaired in the integration range (`justfile` and `.github/scripts/just-modules/{testing,format,lint}.just); this is not a recommendation to duplicate that repair.

No evidence-backed findings in navigation, coding standards, tool economy, no-ops, global AGENTS.md, or information access.

## Domain findings

- **Glossary drift:** None. “Stub,” “Skill,” “Stack,” “Variable,” and “Config” are used consistently with the single-context glossary at `GLOSSARY.md`.
- **Undefined terms:** None. “Reconciliation” refers to the workflow boundary in the implementation/spec, not an unresolved domain concept.
- **ADR candidates:** None. The reviewed decisions do not satisfy all three tests—hard to reverse, surprising without context, and the result of a meaningful trade-off. No conflicting ADR was found.

## Instruction suggestions

**None.** The observed ticket 01 friction was a missing executable Just recipe, not a guidance gap; existing `docs/agents/tooling.md` already points to `just test::test`. The issue was addressed mechanically in repository tooling. `int-writing-instruction` was not consulted because no instruction candidate was supported.

## Open questions

1. Is CI supplied externally, or should the repository add the proposed `.github/workflows/ci.yml`?
2. Who owns the separate cleanup of the 28-file formatting backlog, and should repository-wide formatting become a CI gate after that cleanup?
3. Should the stale shipped-Skill roster assertion remain an explicitly maintained list, or should it derive from the authoritative Stub inventory?
4. Should aggregate review environments support tests that create temporary workspaces under the checkout, or should the test harness gain a configurable isolated workspace location?
5. Is Linux-only PTY coverage acceptable for this CLI, or is cross-platform interactive coverage a maintainer requirement?
6. No unresolved domain terminology or model decisions remain.
