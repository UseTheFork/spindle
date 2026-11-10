# Corrective implementation inputs

Read only for a corrective implementation assignment, before accepting its gate.

Require a concrete `ROUND` and assigned `FINDING_IDS`, plus `PRIOR_ATTEMPTS` and `RULINGS` supplied or explicitly `NONE`. Initial assignments do not require these fields. Accept values through an explicit, read-required correction-context reference or inline equivalent structured fields.

Read every assigned finding and relevant prior attempt/ruling before editing. Resume the supplied snapshot and test status; the controller owns progress assessments and dispatch decisions. Correct the complete assigned batch within file scope and verify fresh covering tests. Preserve prior report history; attempt numbers are not a fixed retry allowance.

**Complete when:** all branch inputs are supplied and consistent; otherwise return `NEEDS_CONTEXT` with specific missing inputs before creating a report. After fixing, include each finding's correction and current covering-test evidence in the implementer report.
