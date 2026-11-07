# 02: Create, triage, and organize issues

Reporter: User
Category: enhancement

**What to build:** A maintainer can create attributed Markdown issues, edit their
descriptive metadata, triage them, and inspect a dependency-aware ready queue
while requirements remain directly editable Markdown.

**Blocked by:** 01: Create and inspect feature workspaces.

**Status:** ready-for-agent

- [ ] `issue create` allocates `I-0001`-style IDs independently per feature, requires title/free-form reporter/category/author, and never overwrites an issue. Generated YAML front matter defaults triage to `needs-triage` and `blocked_by` to empty; execution starts as `unstarted` in the ledger only.
- [ ] `issue update` changes descriptive metadata and dependencies without changing execution or bypassing triage. Requirements and acceptance criteria remain directly editable Markdown.
- [ ] `triage` accepts category `bug | enhancement` and status `needs-triage | needs-info | ready-for-agent | ready-for-human | wontfix`, requires details and author, and records its rationale.
- [ ] Front-matter `blocked_by` is the only editable dependency authority. Updates and queue evaluation reject missing references and cycles, including externally edited invalid dependencies.
- [ ] `ready --spec` lists only unclaimed triage-eligible issues whose dependencies are integrated; unmet dependencies remain visible rather than silently ignored.
- [ ] `issue comment` and decision history preserve existing body/comments and append explicitly attributed UTC entries under Comments. No author or reporter is inferred.
- [ ] Commands use named options, explicit spec and issue selection, consistent summary/details vocabulary, and explicit nonzero diagnostics. YAML is the sole supported generated-issue metadata format; historical files are not migrated.
- [ ] Competing issue allocations/updates are serialized. Interrupted ledger/Markdown writes are detected and recover without duplicate audit entries, lost requirements, or reset progress; execution is not mirrored into Markdown.
- [ ] Public CLI tests cover defaults, per-feature IDs, invalid enums, missing attribution, metadata preservation, dependency cycles/references, ready eligibility, concurrent writes, and deterministic multi-file interruption recovery.
- [ ] Related issue-management guidance and applicable Just-based checks accompany the behavior.

Checklist key: `- [ ]` Not started; `- [X]` Complete; `- [-]` In progress; `- [S]` Skipped.

## Comments
