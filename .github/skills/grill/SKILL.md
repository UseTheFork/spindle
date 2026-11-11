---
name: grill
description: "Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases."
user-invocable: false
metadata:
  spindle:
    version: 1.0.3
---

Stress-test the user's proposal until its decisions are explicit and you share an understanding. Treat dependent decisions as a **design tree**.

## Interview rounds

1. Build the round's **frontier**: unresolved decisions whose prerequisites are settled. This is the question queue for the round.
2. Ask one queued question and wait for its answer. Use an interactive question tool when available, discovering it through tool search if needed; otherwise use chat. Each call or chat turn contains exactly one question.
3. Apply the answer and continue the queue, revising or skipping questions whose premises changed. Newly unlocked decisions wait for the next round.
4. When the queue is exhausted, recompute the frontier and start the next round.

Label each question visibly as **Round <R>, Question <Q> - <title>**, in chat or the tool's user-visible title. Start both counters at 1; increment the question number for each question asked and reset it to 1 when the round advances. The first question announces the new round without exposing the remaining queue.

Include the context needed to decide and a recommended answer. Phrase confirmations so "yes" accepts the recommendation; for choices, identify the recommended option.

Example opening:

> **Round 1, Question 1 - Output format**
>
> CSV meets the agreed export requirements. I recommend CSV. Shall we use it?

## Facts and completion

When a question needs an environmental fact, dispatch a lookup sub-agent to find it, then use its findings to frame the user's decision. While that sub-agent runs, continue with ready questions; only dependent questions wait for the result.

Once all decisions in the agreed scope are settled, summarize them and request shared-understanding confirmation. Wait for confirmation before acting on the proposal.
