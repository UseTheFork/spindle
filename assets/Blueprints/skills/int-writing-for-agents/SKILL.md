---
name: int-writing-for-agents
description: "{{ computed.internal_skill_description }}"
user-invocable: false
metadata:
  spindle:
    version: 1.1.1
---

# Writing for agents

Shared Reference guidance for writing any document an agent consumes: a Skill, an Agent's instruction body, a project Instruction, or a document reached by a pointer. It covers wording and information hierarchy, not an authoring workflow. Aim for reliable application; the same wording does not guarantee the same behavior across models or hosts.

When writing a Skill, choosing its invocation, or designing a router, use the `int-writing-skills` skill for Skill structure, frontmatter, visibility, and the authoring workflow.

For behavior-shaping edits, use the `int-testing-agent-guidance` skill to establish a baseline and verify the revised guidance.

## Context pointers

A **context pointer** names out-of-context material and the condition for reaching it. A Skill description and an Instruction naming a reference are both pointers. Wording helps determine retrieval, but availability and host behavior matter too. For required material behind a weak pointer, sharpen the condition first; inline it only if retrieval still fails.

A pointer does two jobs: state what the material is, and list the **branches** that should trigger reaching it (a branch is a distinct case the document handles, so different runs take different paths through it). Every word of an always-loaded pointer costs on every turn, so it earns even harder pruning than the body:

- **Front-load the leading word**: the pointer is where it does its triggering work.
- **One trigger per branch.** Synonyms that rename a single branch are one branch written twice; collapse them and keep only genuinely distinct branches.
- **Cut identity the body already carries.**

Example: replace "See the release docs" with "When preparing a release, follow `docs/release-checks.md`." The latter names both the branch and the action; the reference keeps ownership of the checks.

## The two loads

Documents and pointers spend two budgets:

- **Context load** is the cost of material in the agent's window: tokens and attention. Always-loaded Instructions and discovery descriptions spend it even when irrelevant; a disclosed document spends it when loaded. The host determines what is loaded and when.
- **Cognitive load** is the cost on the human: which documents exist and when to reach for each. The human is the index. Not a cost to minimise: it is the price of human agency; spend it where human judgement matters, remove it where it does not.

Disclosure defers the body's context load, not eliminates it. An unreferenced document leaves the human responsible for finding and supplying it.

## Information hierarchy

A document is built from two content types: **steps** (the ordered actions the agent performs) and **reference** (definitions, rules, facts consulted on demand). The two mix freely: all steps (a recipe), all reference (a review's rules, this skill), or both. The core decision is where each piece sits on the **information hierarchy**, a ladder ranked by how immediately the agent needs the material:

1. **In-file step** is the primary tier: what the agent does, in order.
2. **In-file reference** is consulted on demand. Often a legitimately flat peer-set (every rule of a review on one rung), which is a fine arrangement, not a smell.
3. **Disclosed reference** is pushed out into a separate file, reached by a context pointer, loaded only when the pointer fires. Spans a sibling file in the same folder through fully external reference that lives anywhere and any document can point at.

Push too little down and the top bloats; push too much and you hide material the agent actually needs. That tension is the whole decision.

**Progressive disclosure** moves material out of the main file and behind a pointer so the common path stays legible. Inline what every branch needs; disclose what only some branches reach. For example, a release Skill keeps tests and changelog checks inline, but points database releases to `docs/database-release.md`.

**Co-location** decides what sits together once its tier is chosen. Keep a concept's definition, rules, and caveats under one heading, so a lookup brings the relevant constraints with it. Scattering fragments one meaning across headings; duplication repeats that meaning.

**Sprawl** is a document too long for reliable application, even when every line is unique. Disclose by branch or sequence when that improves application; file length alone does not establish a failure.

## Steps and completion criteria

Every step ends on a **completion criterion**, the condition that tells the agent the work is done. Two properties make it a lever:

- **Clarity**: can the agent tell done from not-done? Replace "understanding reached" with "Every affected module is listed with its path, impact, and supporting evidence." A vague bound can invite **premature completion**. Sharpen it first; only if it remains irreducibly fuzzy _and_ you observe rushing should you consider hiding the **post-completion steps**. A split hides them only if the host actually removes them from the executing context; a hand-off or subagent alone is not proof of isolation.
- **Demand**: how much it requires. "Every modified model accounted for" sets a stronger bar than "produce a change list." Demand specifies **legwork**, the digging required within the task. It also applies to flat reference: "every applicable rule checked" sets an exhaustiveness bar without prescribing a sequence.

The strongest criteria are both checkable and exhaustive.

## When to split

Splitting one document into two spends one of the two loads, so split only when the cut earns it:

- **By sequence**: consider a split when observed premature completion persists after sharpening the criterion. Verify that the split actually isolates later steps and improves the same scenario; otherwise keep the sequence together.
- **By invocation**: create a separate Skill when it needs independent discovery or explicit invocation by callers. Otherwise a conditionally disclosed reference file may be sufficient. Use the `int-writing-skills` skill to choose invocation and visibility.

## Leading words

A **leading word** is a compact term used consistently to name a behavior or concept. Familiar terms may help retrieval, but their meaning is model- and task-dependent. Define the intended meaning beside its rules; use shorthand only when it preserves the constraints.

The same term can connect a pointer to its body. That is a hypothesis to test in retrieval and application scenarios, not a guarantee from pretraining.

For example, **red** can name an observed failing test when that meaning is defined. **Tight** cannot replace "fast, deterministic, low-overhead" without losing independently checkable requirements.

Prefer a positive target when it makes the action clearer: "For release work, follow the release-checks reference" instead of "Don't forget the docs." Keep explicit prohibitions when needed for hard guardrails, paired with the permitted action. **Negation** does not universally cause the forbidden behavior; verify wording against the actual task.

## Pruning

- Keep each meaning in a **single source of truth**: one authoritative place, so changing the behaviour is a one-place edit. **Duplication** (the same meaning in more than one place) costs maintenance and tokens, and inflates a meaning's prominence on the ladder past its real rank. (The accidental inverse of a leading word, which repeats a token on purpose, never the meaning.)
- The **environment** is a source of truth too (`package.json` scripts, config files, the directory layout, `--help` output), and a document that restates it is a **cache**: a copy of a lookup, earning its load only when the lookup is expensive. Cache what the agent cannot find by looking: the unwritten convention, the reason behind a choice, the gotcha no config confesses. Leave the one-file, one-command lookups to the environment, where they cannot go stale.
- Check every line for **relevance**: does it still bear on what the document does? A line loses relevance by never bearing on the task (mere exposition, or a branch that should be disclosed) or by going stale as the behaviour or world it describes changes. Shorter documents are easier to keep relevant. Without a pruning discipline the default fate is **sediment**: stale layers that settle because adding feels safe and removing feels risky, until you must core down through them to find what is still live.
- Hunt **no-ops** through subtraction: run the same task with and without the candidate guidance, checking observable behavior through `int-testing-agent-guidance`. A passing run without it does not prove irrelevance across other tasks or models. Remove a sentence when the comparison supports that decision; preserve required contracts and guardrails. If wording fails, sharpen the action or criterion rather than merely adding a stronger adjective.
