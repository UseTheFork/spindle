---
name: Code Commenting
description: "Defines when you should and should NOT write code comments. Apply on any code edit/write/refactor."
applyTo: "**/*"
metadata:
  spindle:
    version: 1.0.1
---

# Code Commenting Rules

**Default: write no comments.** A comment must justify its existence; the absence of a comment is the right answer almost always.

## When a comment IS warranted

Only when the **WHY** is non-obvious and a future reader would otherwise be confused or break the code:

- A hidden constraint (e.g. "API requires this header lowercased — server rejects mixed case").
- A subtle invariant (e.g. "must run before X is mounted, otherwise the event listener attaches to the wrong target").
- A workaround for a specific bug or spec quirk (e.g. "Safari 17 fires `focus` twice — debounce").
- Focus on behavior that would surprise a competent reader.

Keep explanatory comments to **one line** wherever possible, with a two-line maximum. For public API documentation, follow the project's PHPDoc, TSDoc, or other standard format when required. These docs can use multiple lines and standard tags when they add useful contract details.

## When a comment is NOT warranted (delete or skip)

- Repeating what clear names, signatures, types, or nearby code already state ("// increment counter", "// loop through users").
- Narrating the change or its origin ("// added to fix bug #123", "// used by the X flow", "// previously called Y"). That belongs in the PR description and rots as the codebase evolves.
- Section headers ("// === Helpers ===" , // --- Validation ---") inside a normal function body.
- TODO/FIXME without a tracked issue or owner — either fix it now or file it; don't leave drift markers.
- Commented-out code. Delete it; git remembers.

## Class and method documentation

- Do not add a comment to every class or method. Document one only when its purpose or contract is not clear from its name, signature, types, and context, or when project conventions require public API documentation.
- For a class, document its responsibility, important invariants, or lifecycle constraints when they are not clear from the code.
- For a method, document non-obvious preconditions, side effects, error behavior, or guarantees when they are not clear from the code.
- Do not paraphrase a class or method name or repeat its signature. Add only details that help a reader use or maintain it.

## How to apply

1. Before writing a comment, ask: _would removing this comment confuse a future reader who doesn't know about the current task?_ If no, don't write it.
2. When editing existing code, treat redundant comments around your change as fair game to remove (don't go on a comment-stripping crusade in unrelated files).
3. If the user explicitly asks for verbose comments, follow the user — they override this rule.
