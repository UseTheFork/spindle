---
name: int-verification-before-completion
description: "This is an internal skill do not load it unless explicitly required by the user or another skill."
user-invocable: false
metadata:
  spindle:
    version: 1.1.0
---

# Verification Before Completion

Use this reference when reporting verification or completion claims. The caller's workflow defines required checks, permissions, and timing; this skill defines how claims track evidence.

## Match claims to evidence

- Identify the claim's scope: for example, a focused test, a build, a behavior, or a set of requirements.
- Say whether evidence was **run** by you, **inspected**, or **supplied** by someone else. Attribute supplied evidence; don't imply you ran it.
- Include the observed result and the evidence's scope. Tie it to the relevant commit or snapshot when one is identified.
- Claim only what the evidence establishes. A focused test does not establish that the full suite passes; passing tests do not establish that a build or all requirements pass.
- If required evidence is missing, stale, ambiguous, or failing, state what remains unverified and identify the check and authorized owner needed to resolve it.
- Respect the caller's permissions and approved tooling. Request evidence from the authorized owner when you cannot run a required check.

## Example

> Controller-supplied evidence: `pnpm test --filter order-total` exited 0 with 12 tests passing on snapshot `abc123`; I did not run it. The full production build is unverified; request controller evidence for `abc123`.
