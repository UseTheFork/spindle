# Template

```md
## Assignment

Assess the selected work for evidence-backed retrospective proposals.
Entry: [ENTRY]

## Required first read

Read this assessment reference before assessing evidence:
[ABSOLUTE_ASSESSMENT_REFERENCE_PATH]

If it is unavailable, return a blocker rather than a completed assessment.

## Evidence inputs

Selected session's primary sources, plus any existing report:
[SESSION_SOURCE_POINTERS_OR_NOT_APPLICABLE]

Spec or brief: [SPEC_OR_BRIEF_POINTER]
Every ticket file, including its Comments log: [TICKET_LOG_POINTERS]
Integration range: [BASE_SHA]..[HEAD_SHA]
Final review report: [FINAL_REVIEW_REPORT_POINTER]
Glossary map or applicable glossary: [GLOSSARY_POINTERS_OR_ABSENT]
Applicable context and system-wide ADR directories: [ADR_DIRECTORIES_OR_ABSENT]
Existing applicable workspace instructions: [INSTRUCTION_POINTERS_OR_ABSENT]

## Permissions

Read-only, proposals-only. Return the report to the controller; do not write
project files, apply proposals, or dispatch agents.

## Hand-back

Return the report required by the assessment reference, or an explicit blocker
with missing prerequisites. The controller handles persistence and approval.
```
