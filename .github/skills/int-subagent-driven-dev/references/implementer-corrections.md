# Corrective implementation inputs

Read only for a corrective implementation assignment, before accepting its gate.

Require a concrete `SCOPE` (`ticket` or `delivery`), `ROUND`, and assigned `FINDING_IDS`, plus `PRIOR_ATTEMPTS` and `RULINGS` supplied or explicitly `NONE`. Initial assignments do not require these fields. Accept values through an explicit, read-required correction-context reference or inline equivalent structured fields. Ticket 08 establishes this contract for ticket scope. Ticket 10 introduces delivery-scoped operations and must reuse the contract with independent delivery attempts, rulings, and evidence; until then the current CLI accepts ticket scope only.

Read every assigned finding and relevant prior attempt/ruling before editing. Resume from the assigned ticket worktree and committed target; the controller owns progress assessments and dispatch decisions. Correct the complete assigned batch within file scope, format changed implementation files before committing, and verify fresh covering tests. Preserve prior report history; attempt numbers are not a fixed retry allowance.

**Complete when:** all branch inputs are supplied and consistent; otherwise return `NEEDS_CONTEXT` with specific missing inputs before creating a report. After fixing, include each finding's correction and current covering-test evidence in the implementer report.
