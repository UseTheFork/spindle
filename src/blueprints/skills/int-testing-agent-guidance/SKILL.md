---
name: int-testing-agent-guidance
metadata:
  spindle:
    version: 1.0.0
description: "This is an internal skill do not load it unless explicitly required by the user or another skill."
user-invocable: false
---

# Testing Agent Guidance

Test guidance by applying it to realistic tasks. Reading or reviewing a document alone does not show that an agent can follow it.

## Core workflow

Use this workflow for behavior-shaping changes to skills, agents, prompts, instructions, and documents reached by their pointers. For purely editorial changes, preserve the existing behavior and verify that meaning and references remain intact.

1. **Define the behavior.** Identify the intended agent action and a checkable pass criterion. Choose an application, retrieval, or decision scenario that exercises the actual requirement.
2. **Run the baseline before editing.** For a new document, run the scenario without the proposed guidance. For an edit, run it against the current version. Include the relevant task context, ask the agent to act rather than recite rules, and record its response. If the baseline meets the criterion, leave that behavior unchanged.
3. **Make the smallest change.** Address the observed gap and keep each rule in one authoritative place. Do not add defenses for failures the baseline did not reveal.
4. **Rerun the same scenario.** Use a fresh context with the full revised guidance and unchanged prompt and pass criterion. Check the observed actions or result, not just the agent's explanation.
5. **Close observed gaps.** If the retest fails or reveals a new rationalization, make a targeted correction and rerun the same scenario. Complete when the criterion passes and no observed failure remains unresolved.

| Guidance behavior         | Scenario                                         | Pass criterion                                                        |
| ------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| Retrieval or reference    | Ask for a relevant fact, then apply it           | The agent finds and correctly uses the fact                           |
| Technique or process      | Give a concrete task with a meaningful variation | The agent follows the process and reaches the intended result         |
| Decision or pattern       | Give a case and a counterexample                 | The agent chooses the right branch in both                            |
| Discipline under pressure | Present a realistic temptation to skip a rule    | The agent takes the required action and does not rationalize a bypass |

**Complete when:** the same frozen scenario passes against the revised guidance, or the remaining failure and validation limit are reported.

## Expanded testing

Use expanded testing when the user requests it or the skill is invoked with `--test`. This adds independent samples; it does not replace the core baseline and retest.

1. Freeze scenario prompts and observable pass criteria before dispatch. Cover each meaningful branch. For discipline-enforcing guidance, use at least three scenarios, each combining at least three pressures such as deadline, authority, sunk cost, or exhaustion.
2. Run five independent read-only agents against the baseline. For a new document, provide no proposed guidance; for an edit, provide the current version. Each agent runs every scenario once and reports its concrete choices and rationalizations verbatim.
3. The authoring agent alone edits the guidance, addressing only observed failures.
4. Retest the same scenarios and criteria with five new read-only agents, each running every scenario once with the full revised guidance. Inspect results for compliance and new rationalizations; quoted examples are not evidence of compliance.
5. Repeat with new agents after targeted corrections. Stop when all five pass every applicable criterion without new rationalizations. If testing is blocked or any criterion still fails, report that limitation rather than claiming validation.

**Complete when:** the expanded batch meets every pass criterion, or remaining failures and blocked requirements are explicit.

## Scenario quality

- Give the agent a real task and the complete relevant context.
- Make the expected action observable; use concrete options when a decision must be forced.
- Use realistic pressures only when testing resistance to bypass.
- Freeze prompts and criteria before the baseline so the retest remains comparable.
- Separate scenarios into fresh contexts when one result could influence another.

Use the `int-writing-for-agents` skill for document structure and context-pointer principles. This skill defines how to test the resulting guidance; it does not replace artifact-specific authoring requirements.
