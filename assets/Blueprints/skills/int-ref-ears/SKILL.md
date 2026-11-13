---
name: int-ref-ears
description: "{{ computed.internal_skill_description }}"
user-invocable: false
metadata:
  spindle:
    version: 1.0.0
---

# EARS Requirement Syntax

EARS (Easy Approach to Requirements Syntax) expresses behavior requirements with clear conditions, triggers, and observable responses. Use it when drafting behavior-focused user-story outcomes, requirements, or acceptance criteria for SDD specs and tickets. Preserve the existing spec and ticket structures.

## Choose a pattern

Select the shortest pattern that expresses the behavior without losing a relevant condition:

| Pattern      | Form                                                              |
| ------------ | ----------------------------------------------------------------- |
| Ubiquitous   | The system shall `<response>`.                                    |
| Event-driven | When `<trigger>`, the system shall `<response>`.                  |
| State-driven | While `<state>`, the system shall `<response>`.                   |
| Conditional  | While `<state>`, when `<trigger>`, the system shall `<response>`. |
| Optional     | Where `<feature is enabled>`, the system shall `<response>`.      |

Use the conditional form when both a state and an event trigger apply. Use an event- or state-driven form when only one applies. Use the ubiquitous form when the behavior always applies, and the optional form when it depends on an enabled feature.

## Apply it selectively

Use EARS when its structure makes a behavioral condition and expected response easier to understand or verify. Keep user stories in their existing user-and-outcome form; EARS can express their acceptance outcome. Use another concise form when it communicates the behavior more clearly.

For ticket acceptance criteria with a single behavior and a clear condition, trigger, and response, prefer the matching EARS pattern. Use Given/When/Then or another form when a multi-step scenario needs it or that form communicates the observable outcome more clearly.

Do not force EARS onto implementation decisions, scope statements, open questions, or comments. Keep each acceptance criterion focused on an observable outcome. If a needed condition, trigger, or response is unknown, record the uncertainty instead of inventing it.

## Example

While Do Not Disturb is enabled, when the quiet interval starts, the system shall suppress non-emergency notifications until the interval ends.
