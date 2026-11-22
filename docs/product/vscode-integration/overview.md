# VS Code Integration

**Status:** The settings model, assets, and init/update lifecycle integration are
implemented. Init CLI flags and the opt-in prompt are pending.

VS Code Integration lets a project opt in to Spindle managing selected VS Code
Workspace Settings and a commit-message guidance file. The context owns this
integration separately from Project Settings and Template Rendering. See the
[context glossary](../../../src/VsCodeIntegration/GLOSSARY.md) for terminology.

## Opt-in and Project Settings

A new model under `src/Settings/Models/` defines `vscode.enabled` in Project
Settings. It defaults to `false`, including for existing projects without a
`vscode` entry. Project Settings stores the opt-in, not copies of the managed
VS Code setting values.

Planned init CLI choices:

- `--vscode` enables management.
- `--no-vscode` disables management.
- Without either flag, preserve an existing `vscode.enabled` choice.
- For a new choice, interactive init asks "Let Spindle manage VS Code
  integration?" with No selected by default. Non-interactive init defaults to
  disabled.

Explicit flags will take precedence over an existing choice and suppress the prompt.
The opt-in prompt and CLI help must disclose that enabled management replaces
managed setting values, the commit-message instruction array, and the entire
commit-message guidance file.

The settings workflow exposes `vscode.enabled`, including through
`spindle settings set vscode.enabled true`. Enabling it replaces managed setting
values, the commit-message instruction array, and the entire commit-message
guidance file.

## Managed assets

The new `assets/VsCodeIntegration/` directory contains:

| Asset                     | Processing                                            | Destination                                                   |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| `settings.json`           | Parse as setting data; do not render through Nunjucks | Merge managed keys into the project's `.vscode/settings.json` |
| `commit-message-style.md` | Render through the existing Nunjucks pipeline         | `.github/copilot/commit-message-style.md`                     |

The settings asset is authoritative for the managed keys and their values:

```json
{
  "chat.subagents.allowInvocationsFromSubagents": true,
  "chat.editor.workingSet.enabled": false,
  "chat.tools.terminal.ignoreDefaultAutoApproveRules": true,
  "github.copilot.chat.commitMessageGeneration.instructions": [
    {
      "file": ".github/copilot/commit-message-style.md"
    }
  ]
}
```

The Markdown asset uses `{{ computed.commit_guidance }}` to derive instructions
from the project's current commit settings. Reuse the existing Computed Variable;
do not duplicate its guidance-generation logic.

## Existing files and ownership

When enabled, Spindle reads the project's `.vscode/settings.json`. If the file
does not exist, Spindle creates it and its parent directory as needed.

Use `jsonc-parser` as a direct dependency to accept comments and trailing commas
and make targeted edits. Preserve unrelated keys, comments, and surrounding
formatting rather than serializing the entire existing document.

Spindle-managed VS Code Settings take precedence over existing values. Replace
the entire commit-message instruction array with the asset-defined array; do
not append entries or preserve prior instructions.

Spindle owns the entire installed commit-message guidance file while management
is enabled. Replace an existing file, including custom content, with the rendered
asset. Later updates regenerate it using current commit guidance.

## Lifecycle

Apply enabled integration during:

- `spindle init`.
- `spindle update`.
- Settings changes that enable integration, through the existing update workflow.

Updates while enabled restore the asset-defined managed values and regenerate
the commit-message guidance file. Changes to unrelated VS Code settings remain
outside Spindle's ownership.

When disabled, do not apply integration assets or modify its destination files.
Disabling stops management but does not remove previously installed settings or
the guidance file. This preserves subsequent user edits.

## Preparation and failures

Validate existing VS Code Workspace Settings and prepare both integration outputs
before any init or update writes. The settings document must contain a valid
JSONC object; an array, scalar, null, or invalid JSONC is an error.

On validation or preparation failure, abort with a clear, file-specific error.
Do not replace the settings document, write the commit-message guidance file,
apply other init/update writes, or persist a newly enabled integration.
Do not fall back to an empty settings object when an existing file is invalid.

## Acceptance coverage

The current `VsCodeIntegrationService.prepare` operation returns the workspace
and prepared files with relative destinations, original content (or `undefined`
for missing files), and proposed content. It performs no filesystem writes and
does not persist Project Settings. The registered provider invokes it for init,
update, and settings changes.

The provider prepares during the before-init and before-update hooks, and
applies the same prepared outputs during the corresponding after-hooks. It
checks for changes since preparation, writes changed files atomically, and
reports completed changes if application fails. After-hook failures may occur
after other lifecycle writes; rollback is not attempted.

Preparation uses the shared rendering pipeline with the registered
`commit_guidance` provider and the supplied Project Settings snapshot. It restores
the application's previous Project Settings state after rendering, including on
failure. Only the required Computed Variable is resolved, so preparation does not
require a package-manager preference.

Implementation tests must verify:

- Default-disabled behavior, including existing Project Settings without `vscode`.
- Explicit CLI choices, existing-choice preservation, and interactive versus
  non-interactive defaults.
- Creation of missing destination files when enabled.
- JSONC support and preservation of unrelated settings, comments, and formatting.
- Replacement of conflicting managed values and the entire instruction array.
- Rendering from the asset with current `computed.commit_guidance`, including
  replacement of an existing custom guidance file.
- Reapplication during update and settings changes, and no duplicate instruction
  references on repeated runs.
- Disabling leaves previously installed files and settings untouched.
- Invalid JSONC and non-object roots fail before writes or opt-in persistence.
