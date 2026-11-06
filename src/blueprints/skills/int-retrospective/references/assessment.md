# Assessment prompts

The reader uses these prompts for both entry paths. They are candidate categories, not a quota: retain only evidence-backed improvements, and report "None" when appropriate.

- **Navigation:** repeated searches, hidden dependencies or expensive discovery. Prefer a scoped navigation pointer to existing documentation over copying it into always-loaded instructions.
- **Workspace instructions:** durable guidance gaps, misleading rules, duplication or overly broad scope. Consult `int-writing-instruction` for scoped proposal briefs and check existing guidance for overlap.
- **Automated checks:** mistakes a deterministic check could catch, or missing enforcement. Inspect repository lint/typecheck/test commands, hooks and CI first. Repair existing unwired or broken checks before reinventing them. Establish absence of a guardrail from those sources, not from a session that omitted a command.
- **Coding standards:** judgement calls requiring context, such as cross-file consistency. Route mechanical patterns (imports, banned calls, file locations) to deterministic checks instead. Place guidance where the actor making the decision needs it; reviewers may also need exploration.
- **Steering scope:** oversized workspace or global steering files. Propose moving reference material behind pointers and judgement rules to their appropriate owner. Global changes require explicit approval of that target.
- **Tool economy:** expensive calls, oversized results or repeated lookups with measurable cheaper alternatives.
- **No-ops:** steering text suspected of leaving behavior unchanged. Propose a baseline comparison before removal; document size alone does not prove a no-op.
- **Information access:** missing logs or other sources that blocked decisions. Propose scoped access appropriate to the evidence.

Keep each correction authoritative in one place. Reuse existing documentation and tooling; put reusable capabilities in skills, scoped project conventions in instructions, and one-off fixes in the task.

Domain assessment follows `int-domain-modeling`: terminology drift on integrated work belongs in domain proposals, not triage.
