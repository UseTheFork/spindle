# Project Settings

`spindle settings` walks through the known settings interactively. Use
`spindle settings list` to discover configurable keys, types, descriptions,
defaults, and constraints. Use `spindle settings get [key]` to read values and
`spindle settings set <key> <json>` to change one value without a terminal, for example
`spindle settings set commit.allow_body true`. Set `commit.allowed_scopes` before
enabling `commit.scopes_enabled`. Each change runs the update workflow and
overwrites selected catalog paths. Add `--json` before `settings` to receive
structured output.

Agents can configure SDD worktrees the same way, using a JSON string for the
directory and a JSON array for setup commands:

```sh
spindle settings set sdd.worktree_directory '"/home/user/source/worktrees"'
spindle settings set sdd.setup_command '["pnpm install","Instruction: Copy .env from the original checkout to the ticket worktree if it is missing there. Do not print its contents."]'
```

Set `sdd.worktree_directory` before `sdd.setup_command`; the worktree directory
is required to enable SDD worktrees.

The `commit` object controls the public Conventional Commits skill:
`allow_body` (default `false`), `title_max_length` (default `72`),
`scopes_enabled` (default `false`), `allowed_scopes` (default `[]`), and
`allow_breaking_changes` (default `false`). Enabled scopes must be nonempty,
distinct lowercase kebab-case names that fit within the title limit. The limit
must be at least 11 characters (12 when breaking changes are enabled), so every
supported type can fit. Existing configurations without `commit` use these
defaults.

The agreed [VS Code Integration design](../vscode-integration/overview.md)
adds a default-disabled `vscode.enabled` choice to Project Settings.
