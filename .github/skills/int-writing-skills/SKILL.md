---
name: int-writing-skills
description: "This is an internal skill do not load it unless explicitly required by the user or another skill."
user-invocable: false
metadata:
  spindle:
    version: 1.0.0
---

# Writing Skills

## Overview

Treat skill writing as TDD for process documentation: test the existing guidance, make the smallest revision that addresses an observed gap, then test again. A skill is a reusable technique, pattern, or reference—not a narrative about one task.

**NO SKILL WITHOUT A FAILING TEST FIRST.** This applies to new skills and edits. If you draft before RED, discard the draft and restart; do not keep it as "reference" or adapt it while testing. The core path is a focused baseline, minimal change, and re-test. Expanded pressure testing is available through `author-skill`'s `--test` option or when specifically requested.

**REQUIRED SUB-SKILL:** Use `int-testing-agent-guidance` for scenario selection, baseline, focused retest, and expanded testing when requested.

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

Use the core workflow in `int-testing-agent-guidance`. For skills, choose an application or retrieval scenario that exercises the skill's intended use; for a structural rewrite, test whether an agent can find the first action and its completion criterion.

Classify the failure before choosing the fix:

| Baseline failure                       | Guidance form                                                         |
| -------------------------------------- | --------------------------------------------------------------------- |
| A known rule is skipped under pressure | A hard rule plus counters for observed rationalizations and red flags |
| The output has the wrong shape         | A positive recipe or contract stating the required parts and order    |
| A required element is omitted          | A required field or slot in the structure the agent fills in          |
| Behavior depends on a condition        | A conditional keyed to an observable predicate                        |

If the control already meets the target, stop changing that behavior; do not invent a failure to justify guidance. A failed test identifies a gap, not permission for unrelated additions.

**Complete when:** the scenario, observable criterion, and baseline result identify a specific gap and the matching guidance form.

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

Rerun the same focused scenario with the revised skill, following `int-testing-agent-guidance`. If it fails or reveals a new rationalization, revise and re-test.

**Complete when:** the revised skill passes the same focused scenario against its observable criterion, with no unresolved failure or rationalization.

### 5. Refactor and deploy

Review new rationalizations against the baseline. Add explicit counters only for observed discipline failures; keep wrong-shape fixes as recipes and omission fixes in the structure. Re-run the focused scenario after every refactor. Stop when the targeted failure is resolved and no new rationalization appears.

Finish the quality and deployment checklist below before moving to another skill. Commit or push only when explicitly requested; consider a PR when the work is broadly useful and the repository workflow supports it.

**Complete when:** the relevant checklist is complete, the final scenarios still pass, and the verified change is ready for its authorized delivery path.

## Testing by skill type

| Skill type                               | Focused core scenario                          | Core success criterion                                       |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| Discipline-enforcing (TDD, verification) | One realistic choice involving the target rule | The agent chooses the required action                        |
| Technique (waiting, debugging)           | Apply the technique to one concrete case       | The agent applies it correctly                               |
| Pattern (complexity, information hiding) | One recognition or counter-example case        | The agent recognizes when the pattern does and doesn't apply |
| Reference (API, syntax)                  | Retrieve and apply one relevant fact           | The agent finds and correctly uses the fact                  |

Use [`int-testing-agent-guidance`](../int-testing-agent-guidance/SKILL.md) for the shared testing procedure. Use [`persuasion-principles`](persuasion-principles.md) when designing discipline-enforcing guidance; apply authority and commitment sparingly, and avoid liking or reciprocity as compliance tools.

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

- [ ] Create at least one focused application or retrieval scenario before editing.
- [ ] Run the current-version or no-guidance baseline; capture behavior verbatim.
- [ ] Identify a specific failure and select the matching guidance form.

### GREEN

- [ ] Use valid `name` and `description` frontmatter; description starts with "Use when…" and names specific triggers.
- [ ] Use discoverable terms and a clear overview.
- [ ] Address only observed baseline gaps with the matching guidance form.
- [ ] Put ordered steps and completion criteria before branch-specific reference.
- [ ] Co-locate related material; disclose heavy or branch-specific reference.
- [ ] Keep one useful example; omit narrative and multi-language dilution.
- [ ] Rerun the focused scenario with the revised skill.
- [ ] When `--test` is requested, complete the expanded testing workflow in `int-testing-agent-guidance`.

### REFACTOR

- [ ] Capture new rationalizations from testing.
- [ ] Add specific counters and red flags for observed discipline failures.
- [ ] Re-test the focused scenario after each refactor until the target behavior holds.

### Quality and deployment

- [ ] Use a flowchart only for a non-obvious decision; include a quick reference and common mistakes when useful.
- [ ] Keep supporting files for heavy reference or reusable tools.
- [ ] Verify the skill before moving to another skill.
- [ ] Follow the repository's authorized delivery path; commit, push, or open a PR only when requested or authorized.
