# Commit message guidance

Use Conventional Commits: `type: description`. Use a concise, imperative description.
Allowed types: `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `perf`, `refactor`, `revert`, `style`, `test`.
Output the commit message as plain text, without Markdown formatting.
Do not wrap the final commit message in triple-backtick code fences.

The complete first line must be at most 72 characters.
Use the title only; do not include a body or footer.
Do not include a scope.
Breaking-change notation is disabled. If the change is breaking, tell the user rather than produce a misleading message.

Examples:
- feat: add login
- fix: handle missing token
