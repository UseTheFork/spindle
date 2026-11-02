---
name: author-skill
meta:
  spindle:
    version: 1.0.0
description: Create or update a project skill from the user's requirements
argument-hint: "[--test] [--ask] <skill idea or requirements>"
disable-model-invocation: true
user-invocable: true
---

Create or update a skill, or answer a question about it, based on the user's requirements.

## Arguments and required skills

Parse optional flags from the invocation arguments; treat the remaining text as the requirements.

- `--test`: opt in to testing. When omitted, do not run tests or load the two testing skills listed below.
- `--ask`: answer the question without creating or modifying files. Read the applicable skills before answering. This mode takes precedence over implementation and test execution, including when combined with `--test`.

For every invocation, YOU MUST read and follow:

- **REQUIRED:** `int-writing-skills` skill
- **REQUIRED:** `int-writing-for-agents` skill

### Testing (only with `--test`)

Only when `--test` is present, YOU MUST also read and follow:

- **REQUIRED:** `int-test-driven-development-advanced` skill
- **REQUIRED:** `int-verification-before-completion` skill

Without `--test`, apply the writing guidance without its testing workflow or testing-skill dependencies; report that tests were not run. With `--ask`, read the applicable skills and answer without executing this workflow.

For `--test` without `--ask`, use only read-only agents for every dispatch. The authoring agent alone edits the skill. Limit testing to three rounds total: one baseline and at most two retest rounds, with five fresh agents per round (15 agents maximum). Follow this bounded cycle:

```mermaid
flowchart TD
    A[Agree test seams, scenarios, and pass criteria] --> B[Dispatch 5 fresh readonly baseline agents]
    B --> C[Collect all results and record failures verbatim]
    C --> D{Target gap observed?}
    D -- No --> E[Report baseline; leave passing behavior unchanged]
    D -- Yes --> F[Edit skill to address observed gaps]
    F --> G[Dispatch 5 fresh readonly agents with revised skill]
    G --> H[Compare every result against fixed criteria]
    H --> I{All pass with no new rationalizations?}
    I -- No --> K{Retest rounds remaining?}
    K -- Yes --> F
    K -- No --> L[Finalize with unresolved failures and limitations]
    I -- Yes --> J[Report evidence and remaining limitations]
```

1. **Define coverage.** Confirm the test seams with the user, then freeze scenario prompts and observable pass criteria covering the requested behavior. Use the scenario and micro-test requirements in `int-writing-skills`.
2. **Baseline before edits.** Dispatch exactly five independent read-only agents with fresh contexts. Each runs the full scenario set using the current skill for an update, or without the proposed skill for a new skill. Give every agent the same bounded task: evaluate the scenarios within read-only permissions, return concrete decisions and rationalizations verbatim, and leave workspace files unchanged. For scenarios requiring writes, describe the intended actions rather than executing them; report this execution limitation. Collect all five results before editing. If no target gap appears, report that evidence rather than inventing a failure.
3. **Edit.** Address the observed gaps in the target skill only. Preserve the frozen prompts and pass criteria so results remain comparable.
4. **Retest.** Dispatch five new read-only agents, not follow-ups to earlier agents, with the revised skill and the same scenarios and criteria. Inspect every result for the required behavior and new rationalizations; agent success claims alone are insufficient evidence.
5. **Repeat or finalize.** If any agent fails and a retest round remains, revise the skill and rerun all five fresh read-only agents. Count every dispatched batch, including incomplete batches, toward the three-round limit. Stop early when all five pass every applicable criterion without new rationalizations; otherwise finalize after the second retest with unresolved failures explicitly reported. Make no further edits or refactors after the last retest, so the delivered revision matches the last tested revision. Report baseline failures, results for each round, rounds used, and blocked or unverified requirements. Unavailable agents, incomplete runs, and reaching the cap with failures are limitations, not passes; further rounds require explicit user authorization.

## Response or implementation

If `--ask` is present, answer using the loaded guidance and stop without implementing changes or running tests.

Otherwise, create or update the skill in `.github/skills/<skill-name>/SKILL.md`, following the repository's conventions and the requested scope. Complete the task rather than returning only a plan. Do not modify unrelated files. Finish with a concise summary of the skill changes and any verification performed, including blockers or unverified requirements.
