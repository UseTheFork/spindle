---
name: int-grilling
description: "This is an internal skill do not load it unless explicitly required by the user or another skill."
user-invocable: false
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask now without guessing at answers you haven't heard yet.

At the start of each round, identify the frontier and use it as the round's question queue. Deliver the round one question at a time:

- Use the available tool for interactively asking the user questions and collecting their answers, regardless of its name. Discover it through tool search if needed.
- Submit exactly one question per tool call, then wait for the user's answer.
- If no such tool is available, ask one question in chat and wait for the user's answer. Never send the whole round at once.
- Include the question's title, necessary context, and your recommended answer.
- Wait for the user's answer before asking the next question.
- Do not send the full queue as a text block or a multi-question tool call.
- Skip or revise queued questions if earlier answers make them irrelevant
  or change their premises.
- Questions newly unlocked by this round's answers belong to the next round.

Word confirmation questions so "yes" accepts your recommended answer. For choice questions, clearly identify the recommended option.

When all remaining questions in the round have been answered, recompute the frontier and begin the next round.

Each answer reshapes the design tree, but the round boundary remains: resolve the current round's still-relevant questions before asking newly unlocked questions in the next round. Never ask a question whose prerequisites remain unsettled.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
