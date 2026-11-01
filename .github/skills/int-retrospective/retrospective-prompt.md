# Retrospective contract

Controller: dispatch one fresh read-only reader that did not take part in delivery. Supply pointers, not a narrative of how delivery went.

## Required Reader Skills

Before assessing the delivery evidence, use the Skill tool to load `int-domain-modeling` and read its instructions. This is required even when delivery went smoothly or no domain findings are expected; the assignment cannot waive it. If loading fails or the skill is unavailable, report the blocker rather than claiming a completed assessment.

Apply its terminology challenges, context boundaries, implementation-free glossary guidance, and three-test ADR criteria to the analysis. This assignment is read-only and proposals-only: express glossary updates and ADRs as drafts in the report, not edits to project files. Put unresolved terminology or model decisions in Open questions for the maintainer instead of resolving them on their behalf. Do not run the skill's inline-update actions or dispatch agents.

When delivery evidence suggests missing, misleading, duplicate or overly broad workspace instructions, load `int-writing-instruction` before assessing that candidate. Use its scope, file-organization and discovery guidance to prepare a proposal brief only; do not create instruction files or execute its authoring and validation workflow. If the skill cannot be loaded, report the affected assessment as blocked. If no instruction candidate is supported, say "None"; do not manufacture one to fill the section.

## Inputs

- Spec or brief: [SPEC_OR_BRIEF_POINTER]
- Every ticket file, including its `## Comments` log: [TICKET_LOG_POINTERS]
- Integration range: [BASE_SHA]..[HEAD_SHA]
- Final review report: [FINAL_REVIEW_REPORT_POINTER]
- `GLOSSARY-MAP.md` or applicable `GLOSSARY.md`: [GLOSSARY_POINTERS_OR_ABSENT]
- Applicable context and system-wide ADR directories: [ADR_DIRECTORIES_OR_ABSENT]
- Existing applicable workspace instructions: [INSTRUCTION_POINTERS_OR_ABSENT]

Controller: replace every bracketed slot with an accessible pointer or resolved revision. The `_OR_ABSENT` slots may explicitly say "Absent"; absence is context for analysis, not permission to create files. Other missing inputs must be reported as evidence gaps, not silently replaced with invented sources.

Read the logs and diff yourself and judge from them. Look for **friction**: findings that recurred across review rounds, blockers and how long they lasted, rework, missing information, expensive detours, and terms that disagree with the glossary. Do not edit files or dispatch agents.

## Required report

1. **Summary:** confirm `int-domain-modeling` was loaded and whether `int-writing-instruction` was consulted (or no instruction candidates were supported); tickets delivered, review rounds per ticket, blockers with duration, final verdict.
2. **Environment findings:** for each, a category from step 3 of the [`retrospective` skill](../retrospective/SKILL.md), severity, evidence (ticket and comment, or revision), the proposed change, and its target file.
3. **Domain findings**, per `int-domain-modeling`:
   - **Glossary drift:** the term used, the glossary's term, the context glossary path, evidence, and a proposed entry in the [glossary format](../int-domain-modeling/GLOSSARY-FORMAT.md), free of implementation detail.
   - **Undefined terms:** a proposed definition, or a rename to an existing term.
   - **ADR candidates:** only decisions meeting all three tests (hard to reverse, surprising without context, the result of a real trade-off), with evidence for each test and a draft in the [ADR format](../int-domain-modeling/ADR-FORMAT.md).
4. **Instruction suggestions:** evidence-backed briefs for `.github/instructions/**/*.instructions.md`, not full files. For each include:
   - Stable proposal ID, severity, evidence (ticket/comment, review finding or revision), and the recurring failure or durable guidance gap it addresses.
   - Operation (add, amend, consolidate or remove), proposed topic-specific target path, and why that file is the right owner; prefer amending existing guidance over a duplicate.
   - Intended source scope: a narrow proposed `applyTo` glob and/or task-discovery `description`, with rationale. Use `**` only when the evidence supports genuinely workspace-wide guidance.
   - A short proposed actionable rule or change, expected behavioral benefit, and applicable existing instruction paths checked for overlap or conflict. Resolve conflicts in the proposal rather than relying on instruction precedence.
   - Why guidance is appropriate instead of a deterministic check, a cheap repository lookup, or a one-off task fix. Route mechanically enforceable rules to Automated checks instead; reference the corresponding environment finding without duplicating it here.
   - A representative follow-up task and observable success criterion for validation after approval. Do not claim discovery or adherence was tested during this read-only retrospective.
5. **Open questions** for the maintainer, including unresolved scope/ownership decisions.

Write "None" for an empty section. Every finding cites evidence; omit any finding you cannot evidence.
