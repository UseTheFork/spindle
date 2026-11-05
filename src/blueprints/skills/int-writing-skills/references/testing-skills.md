# Testing skills

Skill-specific scenario selection and failure diagnosis live here. **REQUIRED:** use `int-testing-agent-guidance` for the shared execution procedure, baseline capture, fresh-context retest, and expanded testing. This reference does not replace that procedure.

## Select an observable scenario

Choose the scenario by primary type, then by the capability it teaches:

| Primary type | Capability | Focused scenario                             | Success criterion                                              |
| ------------ | ---------- | -------------------------------------------- | -------------------------------------------------------------- |
| Interactive  | Discipline | A realistic choice involving the target rule | The agent takes the required action under pressure             |
| Interactive  | Technique  | Apply the technique to a concrete variation  | Actions and completion criteria are met                        |
| Interactive  | Pattern    | A case and a counterexample                  | The agent chooses the right branch in both                     |
| Reference    | Knowledge  | Retrieve and apply a relevant fact           | The agent finds the fact and correctly applies its constraints |

For a structural rewrite, exercise finding the first action and its completion criterion, selecting the correct branch, and loading only its required resources. For a flowchart change, exercise decision results, loop re-entry, and any parent/child hand-off.

Freeze the prompt and observable criterion before the baseline. Use the current guidance for an edit or no guidance for a new skill. Record behavior verbatim; a statement that the rule is understood is not evidence that it is followed.

## Diagnose the baseline gap

| Observed failure                       | Guidance form                                          |
| -------------------------------------- | ------------------------------------------------------ |
| A known rule is skipped under pressure | A hard rule and counters for observed rationalizations |
| Output has the wrong shape             | A positive recipe or output contract                   |
| A required element is omitted          | A required field or slot in the structure              |
| Behavior depends on a condition        | A conditional keyed to an observable predicate         |

If the baseline meets the target, leave that behavior unchanged. Limit the edit to the observed gap and requested capability.

For discipline-enforcing guidance, consult [Persuasion principles](./persuasion-principles.md) when selecting counters. Apply authority and commitment sparingly; use clarity rather than persuasion for reference material.

## Retest and close

Rerun the same prompt and criterion with the full revised guidance in a fresh context. Check actual choices, resource loads, and artifacts. Correct remaining failures narrowly, then rerun after each wording change.

Run expanded testing only when explicitly requested or when `--test` is present, using `int-testing-agent-guidance`. It adds coverage rather than replacing the focused baseline and retest.

| Testing pitfall                         | Required evidence                                               |
| --------------------------------------- | --------------------------------------------------------------- |
| "It is clear" or "it is just reference" | Application or retrieval behavior, not author confidence        |
| "I will test if problems emerge"        | Baseline before drafting and retest before delivery             |
| "There is no time"                      | Recorded validation or an explicit blocker, not claimed success |
| "The output is close enough"            | The unchanged observable criterion passes                       |

**Complete when:** the final focused scenario passes without unresolved failures, requested expanded testing is complete, or remaining failures and validation limits are explicitly reported.
