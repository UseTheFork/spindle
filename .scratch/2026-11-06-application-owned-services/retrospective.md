# Delivery retrospective: Application-owned services

## Summary

**Entry:** delivery

**Work assessed:** Full-spec delivery in [spec.md](./spec.md).

`int-domain-modeling` was loaded and consulted, including its glossary and ADR
criteria. Supported `.github/instructions/**/*.instructions.md` candidates:
**None**; `int-writing-instruction` was not loaded.

All seven tickets were integrated. The aggregate code review passed with no
findings. The aggregate slop review raised one Minor structural finding,
`FS-SL-01`, which was removed in the one-file final fix; its scoped review passed
with Spec and Quality both PASS. Earlier corrective findings recorded in
tickets 01–07 were resolved and re-reviewed; no known blockers remain parked.

The initial repository-wide format check failed on 113 untouched files. The
blocker lasted about 74 minutes, from the ticket 07 comment at 19:05Z to the
20:19Z resumption. It was resolved by the user's `.oxfmtrc.json` adjustment in
commit `15aeff5`. This is recorded as resolved, not proposed as cleanup.

**Final verdict:** Delivery verification passed. Controller-run checks on the
final code/test snapshot passed: format (183 files), lint, types, build,
packaged tests (5/5), full tests (200/200), and `git diff --check`. The final
structural refactor also had focused reconciliation/workflow coverage pass
68/68 both before and after. These checks were controller-run, not independently
run for this assessment.

No raw session/debug logs were produced. The two supplied checkpoints were read
as contextual aids, not substitutes for the tickets and reviews. Session-level
tool/call counts and total session duration are unavailable. The final code
identity is HEAD `27fe294f18965c080ba2cfc6c266dc600c1f5b39` plus the specified
one-file final fix (diff SHA-256
`3bed201b3903a3dbc1a674f249bd04765c4d4337bee0fa14eaa68800631dacd0`); no source
or test changes followed verification.

## Environment findings

**None.** The delivery's corrective findings were resolved, and the final checks
passed. The formatting blocker was resolved by the user's configuration
adjustment; no unrelated formatting cleanup is proposed.

## Domain findings

**Context:** Single-context glossary at [GLOSSARY.md](../../GLOSSARY.md); no
`GLOSSARY-MAP.md`. The system-wide ADR directory is [docs/adr](../../docs/adr/),
ADRs 0001–0004; no context-scoped ADR directory exists. The glossary's
Blueprint, Blueprint Catalog, Stack, Variable, Computed Variable, Config, and
selected directory membership terminology aligns with the spec and tickets.
The spec also explicitly treats Application, singleton, service, and boot as
general programming concepts, not new glossary terms.

### Glossary drift

**None.**

### Undefined terms

**None.**

### ADR candidate — D-ADR-01

- **Impact / severity:** Low; improves decision-record clarity.
- **Evidence:** [ADR-0004](../../docs/adr/0004-application-owned-services.md)
  remains marked `status: proposed`, while the full spec, tickets 01–07, and
  final review record implementation and integration of that architecture. The
  ADR describes the trade-off between direct function calls and explicit
  dependencies versus shared application ownership and asynchronous service
  resolution.
- **Observed problem:** The implementation is integrated, but the ADR's status
  does not show whether the architecture decision itself has been ratified.
  Delivery acceptance alone may not establish that design approval.
- **Durable correction:** If the maintainer confirms the choice, change the
  existing ADR's status to `accepted`, retaining its decision text. Do not
  create a duplicate ADR.
- **Target:** `docs/adr/0004-application-owned-services.md`.
- **Why it meets the ADR tests:**
  - **Hard to reverse:** the change migrates all command and workflow ownership
    and removes replaced APIs, so reversing it would entail broad code and test
    migration.
  - **Surprising without context:** mandatory Git-root discovery, asynchronous
    service boot, and application-local lifetimes are not self-evident from the
    former function-based structure.
  - **Real trade-off:** ADR-0004 explicitly contrasts direct calls and explicit
    dependency arguments with shared application ownership and service
    resolution.
- **Draft (status-only proposal; retain existing decision text):**

  ```md
  ---
  status: accepted
  ---
  ```

- **Verification criterion:** A maintainer confirms the architecture decision
  is accepted; a follow-up check confirms ADR-0004 has the approved status and
  still describes the integrated decision without conflicting with the final
  spec.

## Instruction suggestions

**None.** Applicable guidance checked: [tooling.md](../../docs/agents/tooling.md),
[testing.instructions.md](../../.github/instructions/testing.instructions.md),
[issue-tracker.md](../../docs/agents/issue-tracker.md), and
[triage-labels.md](../../docs/agents/triage-labels.md). The resolved Markdown
link regression was a test-fixture issue, not evidence of missing or misleading
workspace instruction guidance. No instruction candidate is proposed.

## Open questions

- Does the maintainer consider the integrated application-services architecture
  formally accepted, or should ADR-0004 remain proposed pending a separate
  design approval?

## Evidence pointers

- Spec: [spec.md](./spec.md).
- Ticket Comments logs:
  [01](./issues/01-application-construction-and-boot.md),
  [02](./issues/02-git-root-bootstrap-init-update.md),
  [03](./issues/03-setup-and-sdd-command-services.md),
  [04](./issues/04-per-run-computed-context.md),
  [05](./issues/05-installation-service-and-utilities.md),
  [06](./issues/06-blueprint-reconciliation-service.md), and
  [07](./issues/07-integration-and-packaged-verification.md).
- Aggregate code and slop reviews:
  [final code review](./reports/final-review.md) and
  [final slop review](./reports/final-slop-review.md).
- Scoped final-fix review:
  [final-fix-review.md](./reports/final-fix-review.md).
- Starting revision: `2274427687067aeb7c471a68bf2405b12de04d77`.
- Final verified code snapshot: `27fe294f18965c080ba2cfc6c266dc600c1f5b39`
  plus the one-file final-fix diff identified above.
- Supplemental session checkpoints:
  `/home/sincore/.copilot/session-state/8c99fa41-5a38-4545-afcf-e8d4223ea05a/checkpoints/001-ticket-03-command-services.md`
  and
  `/home/sincore/.copilot/session-state/8c99fa41-5a38-4545-afcf-e8d4223ea05a/checkpoints/002-application-services-tickets-0.md`.
