---
name: public-commit-format
description: Use when drafting a commit message.
user-invocable: false
metadata:
  spindle:
    version: 1.0.0
---

# Commit format

Use Conventional Commits: `type: description`. Use a concise, imperative description.
Allowed types: `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `perf`, `refactor`, `revert`, `style`, `test`.
Output the commit message as plain text, without Markdown formatting.

{{ computed.commit_guidance }}
