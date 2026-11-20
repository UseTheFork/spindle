# Project tooling

The `spindle tool` commands list, add, update, and remove registry entries.
They do not discover or execute project commands. The registry lives in
`.spindle/config.json` and generates `docs/agents/tooling.md`. Spindle's three
built-in commands are always included in the guide and `tool list`; their keys
are reserved and are not stored in the registry. A missing `tooling` array is
initialized to an empty array by `init` or `update`; existing entries are
preserved.

See [Project initialization](../project/initialization.md) for when the
registry is initialized and [Project Settings](../settings/overview.md) for
the settings CLI.
