# 04: Record checks against current content

Reporter: User
Category: enhancement

**What to build:** A controller declares verification requirements and records
externally executed results against CLI-supplied content identities, so that
only checks covering current code and requirements can satisfy delivery gates.

**Blocked by:** 03: Claim, dispatch, and resume implementation.

**Status:** ready-for-agent

- [ ] `checks require` declares commands before implementation and permits later additions. Removing a requirement requires recorded rationale and invalidates affected gate decisions through a minimal explicit named-option contract.
- [ ] Workflow actions compute and return snapshot identities. `checks record` records one command/result/author against a supplied snapshot directly in the ledger, without an intermediate evidence file or separate snapshot-management command.
- [ ] Results use `passed | failed | unavailable`; failed/unavailable requires details. Missing, stale, failed, or unavailable required coverage cannot satisfy a gate.
- [ ] Git-derived identity accounts for committed, staged, unstaged, and untracked changes against the claim baseline. Neither HEAD alone nor hashing the entire checkout is used.
- [ ] Code coverage depends on content while SHAs provide provenance. Metadata-only commits preserve coverage for identical content; external content changes invalidate affected evidence.
- [ ] Generated ledger/report/audit content is excluded from code identity. Applicable spec/issue requirements are identified separately and their changes invalidate relevant evidence; ordinary comments are excluded unless they carry an applicable requirements decision.
- [ ] Evidence registration revalidates current inputs, persists structured results and history, and exposes unmet checks in next/status. Repeated identical records are idempotent.
- [ ] Public CLI tests measure dirty/untracked identity changes, requirement changes, audit exclusions, metadata-only commits, stale/malformed snapshots, result validation, check addition/removal, and persistence across invocations.
- [ ] Documentation explains identity/attestation limits and external check execution. Targeted Just-based checks pass without the CLI executing declared commands.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
