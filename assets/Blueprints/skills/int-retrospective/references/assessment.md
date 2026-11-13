# Retrospective assessment

## Reader scope and required skills

Read this reference before assessing evidence. If it is unavailable, return a blocker rather than a completed assessment. Assess primary sources independently; this assignment is read-only and proposals-only. Return the report to the controller, which owns persistence and approval. Do not edit project files, apply proposals or dispatch agents.

Before assessing evidence, use the Skill tool to load `ref-domain-modeling` and read its instructions. This is required even when the session went smoothly or no domain findings are expected; the assignment cannot waive it. If loading fails or the skill is unavailable, report the blocker rather than claiming a completed assessment.

Apply its terminology challenges, context boundaries, implementation-free glossary guidance, and three-test ADR criteria to the analysis. Express glossary updates and ADRs as drafts in the report. Put unresolved terminology or model decisions in Open questions for the maintainer instead of resolving them on their behalf. Do not run the skill's inline-update actions.

When evidence suggests missing, misleading, duplicate or overly broad workspace instructions, load `int-writing-instruction` before assessing that candidate. Use its scope, file-organization and discovery guidance to prepare a proposal brief only, without executing its authoring and validation workflow. If the skill cannot be loaded, report the affected assessment as blocked. If no instruction candidate is supported, say "None".

## Evidence requirements

Entry is `delivery` or `maintainer`. Delivery requires the spec/brief, every ticket and its Comments log, starting and final revisions, and final review; session sources may say "Not applicable". Maintainer requires selected-session primary sources, including relevant local session logs; delivery-only inputs may say "Not applicable" when that session has no such artifacts. An existing report supplements rather than replaces primary-source pointers.

Include applicable glossary, context and system-wide ADR directories, and workspace instructions, or explicitly state "Absent". Absence is context, not permission to create files. Report missing required inputs as blockers and other evidence gaps explicitly; never invent sources. Read the primary sources yourself and judge from them.

## Assessment categories

The reader uses these prompts for both entry paths. They are candidate categories, not a quota: retain only evidence-backed improvements, and report "None" when appropriate.

Look for **friction**: recurring findings, blockers and their duration, rework, missing information, expensive detours, and terms that disagree with the glossary.

- **Navigation:** repeated searches, hidden dependencies or expensive discovery. Prefer a scoped navigation pointer to existing documentation over copying it into always-loaded instructions.
- **Workspace instructions:** durable guidance gaps, misleading rules, duplication or overly broad scope. Consult `int-writing-instruction` for scoped proposal briefs and check existing guidance for overlap.
- **Automated checks:** mistakes a deterministic check could catch, or missing enforcement. Inspect repository lint/typecheck/test commands, hooks and CI first. Repair existing unwired or broken checks before reinventing them. Establish absence of a guardrail from those sources, not from a session that omitted a command.
- **Coding standards:** judgement calls requiring context, such as cross-file consistency. Route mechanical patterns (imports, banned calls, file locations) to deterministic checks instead. Place guidance where the actor making the decision needs it; reviewers may also need exploration.
- **Steering scope:** oversized workspace or global steering files. Propose moving reference material behind pointers and judgement rules to their appropriate owner. Global changes require explicit approval of that target.
- **Tool economy:** expensive calls, oversized results or repeated lookups with measurable cheaper alternatives.
- **No-ops:** steering text suspected of leaving behavior unchanged. Propose a baseline comparison before removal; document size alone does not prove a no-op.
- **Information access:** missing logs or other sources that blocked decisions. Propose scoped access appropriate to the evidence.

Keep each correction authoritative in one place. Reuse existing documentation and tooling; put reusable capabilities in skills, scoped project conventions in instructions, and one-off fixes in the task.

Domain assessment follows `ref-domain-modeling`: terminology drift on integrated work belongs in domain proposals, not triage.

## Report contract

Every proposal has a stable ID, impact/severity, **evidence** (session source location, ticket/comment, review finding or revision), **observed problem**, **durable correction**, **target**, and a checkable **verification criterion**. Rank proposals by impact. Shared fields apply to environment, domain and instruction proposals; cross-reference IDs rather than duplicate a proposal across sections. Verification criteria describe follow-up checks, not validation already performed.

1. **Summary:** entry and assessed work; confirm `ref-domain-modeling` was loaded and whether `int-writing-instruction` was consulted (or no instruction candidates were supported); available delivery outcomes, review rounds, blockers with duration, final verdict and evidence gaps. Mark unavailable session metrics explicitly.
2. **Environment findings:** shared proposal fields and an assessment category.
3. **Domain findings**, per `ref-domain-modeling`:
   - **Glossary drift:** the term used, the glossary's term, the context glossary path, and a proposed entry in the [glossary format](../../ref-domain-modeling/GLOSSARY-FORMAT.md), free of implementation detail.
   - **Undefined terms:** a proposed definition, or a rename to an existing term.
   - **ADR candidates:** only decisions meeting all three tests (hard to reverse, surprising without context, the result of a real trade-off), with evidence for each test and a draft in the [ADR format](../../ref-domain-modeling/ADR-FORMAT.md).
4. **Instruction suggestions:** evidence-backed briefs for `.github/instructions/**/*.instructions.md`, not full files. In addition to shared fields, include:
   - Operation (add, amend, consolidate or remove), proposed topic-specific target path, and why that file is the right owner; prefer amending existing guidance over a duplicate.
   - Intended source scope: a narrow proposed `applyTo` glob and/or task-discovery `description`, with rationale. Use `**` only when the evidence supports genuinely workspace-wide guidance.
   - A short proposed actionable rule or change, expected behavioral benefit, and applicable existing instruction paths checked for overlap or conflict. Resolve conflicts in the proposal rather than relying on instruction precedence.
   - Why guidance is appropriate instead of a deterministic check, a cheap repository lookup, or a one-off task fix. Route mechanically enforceable rules to Automated checks instead; reference the corresponding environment finding without duplicating it here.
   - A representative follow-up task for the shared verification criterion. Do not claim discovery or adherence was tested during this read-only retrospective.
5. **Open questions** for the maintainer, including unresolved scope/ownership decisions.

Write "None" for an empty section. Every finding cites evidence; omit any finding you cannot evidence.
