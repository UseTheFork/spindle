# Reference skill template

Replace every `[placeholder text]` slot. Apply the common metadata and visibility rules in the primary authoring skill. Repeat topic sections only for distinct lookup needs; remove optional sections that do not apply.

```markdown
---
name: [skill-name]
description: "[description appropriate to visibility and invocation]"
---

# [Subject]

[Covered knowledge, applicability, and relevant version or environment boundaries.]

## [Lookup topic]

[Precise facts or contract: inputs, outputs, constraints, and failure behavior where relevant. Keep caveats beside the fact they qualify.]

## [Conditional topic pointer, if needed]

When [observable feature or environment condition], read [supporting reference or explicitly required internal skill] for [knowledge needed only in that case].

## [Application example]

[One valid, adaptable example that applies the documented contract, with real syntax or pseudocode clearly identified.]

## [Authoritative sources]

[Source links or environment lookups needed to establish or refresh the facts.]
```

Add repository-required version and invocation metadata before delivery.
