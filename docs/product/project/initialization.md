# Project initialization

`src/Assets/Templates/Catalog.ts` declares typed source/destination pairs for
project assets and shared SDD document templates. After installing selected
Blueprints, `spindle init` initializes project assets and creates
`.spindle/config.json` with the selected stacks and tooling registry. See
[Blueprint installation and updates](../blueprints/overview.md) for the
Blueprint setup order and [CLI workspace discovery](../cli/workspace.md) for
the working-tree root behavior.

The agreed [VS Code Integration design](../vscode-integration/overview.md)
adds optional workspace settings management to `spindle init`.
