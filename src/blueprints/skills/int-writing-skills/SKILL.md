---
name: int-writing-skills
version: 1.0.0
description: "This is an internal skill do not load it unless explicitly required by the user or another skill."
user-invocable: false
---

# Writing Skills

## Overview

Treat skill writing as TDD for process documentation: test the existing guidance, make the smallest revision that addresses an observed gap, then test again. A skill is a reusable technique, pattern, or reference—not a narrative about one task.

**NO SKILL WITHOUT A FAILING TEST FIRST.** This applies to new skills and edits. If you draft before RED, discard the draft and restart; do not keep it as "reference" or adapt it while testing. The positive path is baseline, minimal change, and re-test.

**REQUIRED BACKGROUND:** Use the `int-test-driven-development` skill for RED–GREEN and reusing the same tests after behavior-preserving refactoring.

**REQUIRED SUB-SKILL:** Use `int-writing-for-agents` skill when creating or editing a skill. Consult its `SKILL-MECHANICS.md` reference when choosing invocation behavior or designing a router skill.

## Workflow

Complete each phase before moving to the next skill or task. Track each applicable checklist item as a todo.

### 1. Decide whether a skill fits

Create a skill when the guidance teaches a reusable technique, pattern, or reference that agents need across tasks. Put project-specific conventions in instructions, one-off solutions in the work itself, and mechanically enforceable rules in tooling.

Store it at `<project-root>/.github/skills/<skill-name>/SKILL.md`; keep the skills directory flat.

Choose invocation deliberately:

- Keep model invocation when agents must discover the skill autonomously or another skill must invoke it.
- Use user invocation only when a human should be the sole route to it.
- A model-invoked skill's description is always-loaded context; a user-invoked skill spends no such context but depends on the human remembering its name.

**Complete when:** the skill's reusable scope, type, and invocation route are explicit.

### 2. RED: establish the baseline before editing

Write concrete application or retrieval scenarios before changing the skill. For discipline-enforcing guidance, use at least three scenarios, each combining at least three pressures such as deadline, sunk cost, authority, exhaustion, or social consequences. Make the agent choose and act; record choices and rationalizations verbatim.

For a new skill, run scenarios without the proposed guidance. For an edit, use the current version as the control. Test the actual gap: whether agents violate a rule, produce the wrong shape, omit a requirement, or miss a conditional branch. For a structural rewrite, test whether a fresh agent can find the first action and its completion criterion.

Classify the failure before choosing the fix:

| Baseline failure                       | Guidance form                                                         |
| -------------------------------------- | --------------------------------------------------------------------- |
| A known rule is skipped under pressure | A hard rule plus counters for observed rationalizations and red flags |
| The output has the wrong shape         | A positive recipe or contract stating the required parts and order    |
| A required element is omitted          | A required field or slot in the structure the agent fills in          |
| Behavior depends on a condition        | A conditional keyed to an observable predicate                        |

If the control already meets the target, stop changing that behavior; do not invent a failure to justify guidance. A failed test identifies a gap, not permission for unrelated additions.

**Complete when:** fixed prompts, observable success criteria, and baseline results identify a specific gap and the matching guidance form.

### 3. GREEN: write the smallest effective skill

Write only what addresses the baseline gap and supports the requested reusable capability. Keep the core path complete; defer only material that some branches need.

#### Put the agent's path first

Organize the document around the work the agent performs:

1. State purpose and when the skill applies.
2. Give ordered steps, each ending in a checkable, exhaustive completion criterion.
3. Keep reference beside the step that uses it; group a concept's definition, rules, and caveats together.
4. Put branch-specific detail behind a clear context pointer. Keep what every branch needs inline.

Use the information hierarchy deliberately: in-file steps first, in-file reference next, disclosed reference behind pointers last. Split by sequence only when a real hand-off prevents later steps from distracting from the current one. Split by invocation only when independent discovery justifies the extra always-loaded description.

#### Write useful context pointers

Frontmatter requires `name` and `description`; keep the complete frontmatter under 1,024 characters. Follow the [Agent Skills specification](https://agentskills.io/specification). Use letters, numbers, and hyphens in the name, preferably active or gerund phrasing.

Start a model-invoked description with **"Use when…"** and write it in third person. Describe only concrete trigger situations and symptoms—not the skill's process. Keep triggers technology-agnostic unless the skill itself is technology-specific. Treat the description as a context pointer: front-load the leading trigger, include each distinct branch, collapse synonyms, and cut identity already clear from the skill name or body. Include the terms agents are likely to search for.

```yaml
---
name: condition-based-waiting
description: "Use when asynchronous tests have timing dependencies, race conditions, or inconsistent outcomes."
---
```

#### Prune for reliability

- Keep each meaning in one authoritative place. Remove repeated explanations and checklists that restate the same requirement.
- Treat the environment as the source of truth. Document unwritten conventions and gotchas, not lookups that a file, config, or command can answer cheaply.
- Remove stale, irrelevant, and no-op guidance: a sentence earns its context only if it changes agent behavior.
- Prefer positive recipes when shaping output. Use prohibitions for hard guardrails that cannot be stated positively, and pair them with the required behavior.
- Match the guidance to the observed failure. Do not add nuance clauses that reopen a fixed rule or exemptions that weaken its scope.

Aim for fewer than 500 words when the skill remains reliable at that length. Disclose heavy reference (100+ lines) or reusable tools into supporting files; keep core principles and short examples inline. Invoke bundled scripts through their interpreter, such as `node scripts/tool.js`, not by bare path.

#### Use a clear, compact structure

Use frontmatter, an overview, when-to-use guidance, the core workflow or pattern, a quick reference, and common mistakes. Add a small flowchart only for a non-obvious decision. Use one complete, adaptable example rather than several mediocre or multi-language examples. Keep narratives about one specific past session out of reusable skills.

For agent-facing documents, apply the writing principles in `int-writing-for-agents` skill; do not duplicate its full reference here. For skill-specific frontmatter, invocation, and routers, use its `SKILL-MECHANICS.md`. Use skill names for cross-references and label required guidance explicitly; do not force-load a reference with `@`.

**Complete when:** the skill is discoverable, the common path is actionable without chasing references, each step has a clear completion criterion, and every retained section serves a distinct need.

### 4. Verify the wording and revised skill

For behavior-shaping wording, run micro-tests before the full pressure scenarios:

1. Use fresh context for each sample and include the full skill or prompt context.
2. Include a no-guidance control; if it does not show the target failure, stop changing that behavior.
3. Run at least five samples per variant.
4. Manually inspect every flagged result; quoted examples and counter-examples are not compliance.
5. Treat variance as evidence: tighten wording when interpretations diverge.

Micro-tests do not replace pressure scenarios for discipline-enforcing skills. Re-run the same baseline scenarios with the revised skill. The agent should choose the required behavior, cite the relevant guidance, and acknowledge any addressed temptation. If a new rationalization appears, close that specific loophole and re-test.

**Complete when:** micro-test results support the wording and the same full scenarios demonstrate the required behavior after revision.

### 5. Refactor and deploy

Review new rationalizations against the baseline. Add explicit counters only for observed discipline failures; keep wrong-shape fixes as recipes and omission fixes in the structure. Re-run the scenarios after every refactor. A passing first run is not the stopping condition: stop when the targeted failures are resolved and no new rationalization appears in the tested scenarios.

Finish the quality and deployment checklist below before moving to another skill. Commit or push only when explicitly requested; consider a PR when the work is broadly useful and the repository workflow supports it.

**Complete when:** the relevant checklist is complete, the final scenarios still pass, and the verified change is ready for its authorized delivery path.

## Testing by skill type

| Skill type                               | Test                                                               | Success criterion                                   |
| ---------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| Discipline-enforcing (TDD, verification) | Academic questions plus pressure scenarios with combined pressures | The agent follows the rule under pressure           |
| Technique (waiting, debugging)           | Application, variation, and missing-information scenarios          | The agent applies the technique to new cases        |
| Pattern (complexity, information hiding) | Recognition, application, and counter-example scenarios            | The agent recognizes when and when not to apply it  |
| Reference (API, syntax)                  | Retrieval, application, and gap scenarios                          | The agent finds and correctly uses the needed facts |

Use [`testing-skills-with-subagents`](testing-skills-with-subagents.md) for pressure-scenario design, subagent setup, and systematic loophole testing. Use [`persuasion-principles`](persuasion-principles.md) when designing discipline-enforcing guidance; apply authority and commitment sparingly, and avoid liking or reciprocity as compliance tools.

## Common rationalizations and red flags

| Excuse                                                         | Reality                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| "The skill is obviously clear."                                | Clarity to its author does not establish that agents can use it.         |
| "It is just a reference" or "testing is overkill."             | References can have retrieval gaps; test how agents find and apply them. |
| "I'll test if problems emerge" or "academic review is enough." | Run application tests before deploying. Reading is not using.            |
| "No time to test" or "I'm confident."                          | Pressure and confidence are not evidence.                                |
| "The output is close enough."                                  | Match the guidance form to the observed failure and re-test it.          |

## Skill checklist

Create a todo for every applicable item.

### RED

- [ ] Create pressure or application scenarios before editing.
- [ ] Run the current-version or no-guidance baseline; capture behavior verbatim.
- [ ] Identify a specific failure and select the matching guidance form.

### GREEN

- [ ] Use valid `name` and `description` frontmatter; description starts with "Use when…" and names specific triggers.
- [ ] Use discoverable terms and a clear overview.
- [ ] Address only observed baseline gaps with the matching guidance form.
- [ ] Put ordered steps and completion criteria before branch-specific reference.
- [ ] Co-locate related material; disclose heavy or branch-specific reference.
- [ ] Keep one useful example; omit narrative and multi-language dilution.
- [ ] Micro-test behavior-shaping wording against a no-guidance control (five or more samples per variant).
- [ ] Run the same scenarios with the revised skill.

### REFACTOR

- [ ] Capture new rationalizations from testing.
- [ ] Add specific counters and red flags for observed discipline failures.
- [ ] Re-test after each refactor until the target behavior holds.

### Quality and deployment

- [ ] Use a flowchart only for a non-obvious decision; include a quick reference and common mistakes when useful.
- [ ] Keep supporting files for heavy reference or reusable tools.
- [ ] Verify the skill before moving to another skill.
- [ ] Follow the repository's authorized delivery path; commit, push, or open a PR only when requested or authorized.
