# Blueprint Catalog simplification retrospective

## Summary

`int-domain-modeling` was loaded before evidence assessment, and
`int-writing-instruction` was consulted. The full delivery was assessed over
`33a7515fabbd13aaa46710ae3a2acd1e00eba622..a523ed8ede5d4a943534a3641a6b2cf67157f7a5`.
The reader inspected the committed diff artifact generated from that exact
range; the controller verified its provenance and SHA-256
`b57fbf059a3d2b16974d929237137c93c2d03077dca804ede8e928db11e5bf3b`.

All four tickets were delivered: 01 catalog install/update, 02 retired and
Stack-inapplicable removals, 03 authoritative directory membership, and 04
coordinated preparation and packaging. Ticket-specific review rounds were:
01—2, 02—3, 03—2, and 04—2. The full-spec aggregate review then used the single
permitted final-fix dispatch and scoped re-review. Each ticket had a
Spec/Quality task review; the SDD full-spec aggregate gate calls for code and
code-slop reviews, not a separate aggregate task review.

The ticket comment logs record these corrective periods: ticket 01's test and
format/lint failures were addressed over about 50 minutes (16:31–17:21);
ticket 02's Just-import and removal-reporting findings over about 17½ minutes
(17:50–18:08); ticket 03's reporting and refactoring findings over about 11
minutes (19:11–19:22); ticket 04's partial-progress finding and review-package
omission over about 12 minutes (19:54–20:06); and the final aggregate fixes
over about 15 minutes (20:12–20:27). Durations are approximate, inferred from
timestamps in the ticket comments. See [ticket 01](./issues/01-catalog-install-and-update.md),
[ticket 02](./issues/02-remove-inapplicable-blueprints.md),
[ticket 03](./issues/03-authoritative-directory-membership.md), and
[ticket 04](./issues/04-coordinated-preparation-and-packaging.md).

Final verdict: delivered. All five final aggregate findings were addressed;
the final re-review found no new Critical or Important breakage. The controller
verified 198/198 tests, types, scoped format and lint checks, diff checks, a
fresh package build, and 4/4 packaged CLI tests. The evidence and review
verdicts are recorded in [the final code review](./reports/final-review.md),
[the final code-slop review](./reports/final-code-slop-review.md), and
[the final-fix re-review](./reports/final-fix-review.md).

## Environment findings

- **Automated checks — Moderate.** The repository already has test, type,
  lint, and formatting commands, and this delivery ran them repeatedly
  ([tooling guidance](../../docs/agents/tooling.md), [package scripts](../../package.json),
  ticket 04 comments, final verification). At the final revision there is no
  CI workflow or active pre-commit guardrail; the existing checks are not
  automatically required on changes. **Proposal:** add
  `.github/workflows/ci.yml` to run the existing Just test, type, lint, and
  format checks. Reuse those deterministic checks rather than adding a
  workspace instruction.

- **Navigation:** None.
- **Workspace instructions:** None.
- **Coding standards:** None.
- **Global AGENTS.md:** None.
- **Tool economy:** None.
- **No-ops:** None.
- **Information access:** None.

## Domain findings

### Glossary drift

None. The [glossary](../../GLOSSARY.md) matches the spec's catalog selection
and authoritative directory-membership language.

### Undefined terms

- **Draft glossary entry — Removal record:**

  **Removal record**:
  An entry in the Blueprint Catalog that records content retired from managed
  projects, so a project can clean up content previously selected for
  installation.

  Evidence: the spec requires `removed` lifecycle entries, including records
  whose sources no longer exist (stories 16–18), and ticket 02 implements
  source-independent cleanup ([spec](./spec.md),
  [ticket 02](./issues/02-remove-inapplicable-blueprints.md)). Confirm whether
  “Removal record” or “removed entry” is the preferred canonical term before
  adding it to the glossary.

### ADR candidates

- **Review existing proposed ADR-0003; do not create a duplicate.** The
  selected-directory ownership policy meets the three ADR tests: changing it
  can remove existing local content, that consequence is surprising without
  context, and it trades preserving local additions for deterministic cleanup
  without an installation inventory. Ticket 03 makes destination membership
  authoritative, while [ADR-0003](../../docs/adr/0003-catalog-selected-blueprints.md)
  records the existing proposed decision ([ticket 03](./issues/03-authoritative-directory-membership.md)).

  **Draft:** Catalog-selected directories define authoritative installed
  membership. Reconciliation removes destination files absent from the
  selected source, including local additions, in exchange for deterministic
  synchronization without an installed-content inventory. The maintainer
  should decide whether to accept or revise the existing proposed ADR.

## Instruction suggestions

None. The applicable
[testing instruction](../../.github/instructions/testing.instructions.md) was
checked. The observed fixture migration, stale membership expectation, and
review-package omission were caught and corrected during this delivery; the
evidence does not support a durable, scoped instruction change.

## Open questions

- Should “Removal record” or “removed entry” be the canonical glossary term?
- Should the maintainer accept or revise proposed ADR-0003?
- Should CI be added to run the existing checks?
