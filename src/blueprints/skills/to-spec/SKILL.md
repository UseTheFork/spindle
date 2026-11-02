---
name: to-spec
meta:
  spindle:
    version: 1.0.0
description: "Turn the current conversation or a referenced design file into a spec and publish it to the project issue tracker."
argument-hint: "[design file path; omit to use the current conversation]"
disable-model-invocation: true
---

This skill produces a spec from the current conversation or a referenced design file, grounded in the codebase. Synthesize the chosen source without restarting requirements discovery. Source clarification and the test-seam confirmation below are still required when applicable.

The issue tracker and triage label vocabulary should have been provided to you. If not, tell the user to run `/setup-project`.

## Select the source

- **No design reference:** use the current conversation's agreed requirements and decisions. Do not require or automatically select a design file.
- **Design reference supplied:** read the entire referenced file before drafting. Use it as the requirements source; older conversation must not override it. Apply explicit changes the user requests to that design, and use other conversation only as non-conflicting supporting context.
- **Missing, unreadable, or ambiguous reference:** report the problem and ask for a corrected or unambiguous reference. Pause drafting and publishing; do not silently fall back to chat.
- Preserve explicitly unresolved decisions as open questions in Further Notes rather than inventing answers. Resolve any gap that blocks a ready-for-agent spec before publishing it as ready.

**Complete when:** the requirements source is identified and, for a design reference, the full file has been read.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. Write the spec using the template below, then publish it to the project issue tracker. For a local design under `.scratch/YYYY-MM-DD-<feature-slug>/`, write `spec.md` in that same feature directory, preserving its original date and the source design. Otherwise follow the configured tracker conventions. Apply the `ready-for-agent` triage label - no need for additional triage.

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>
