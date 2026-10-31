Category: enhancement
Status: ready-for-agent
Reporter: unknown

# Skill reconciliation and Nunjucks rendering

## Problem Statement

Maintainers can update installed Skills, but `init` and `update` each contain parts of the Stub discovery, conflict handling, and installation workflow. As a result, workflow behavior is spread across command paths, tests must often invoke the full CLI to exercise it, and changes can make the commands behave inconsistently. The `update` command also ignores newly shipped Skills, so maintainers cannot adopt them as part of the normal update flow.

The rendering module currently combines Nunjucks configuration and template processing with file reads and text-versus-binary decisions. It globally modifies Nunjucks' lexer to support custom delimiters, making the renderer more coupled to Nunjucks internals and unlike ordinary Nunjucks Stub authoring.

## Solution

Concentrate shared Stub-to-Skill reconciliation behavior behind a workflow module that `init` and `update` can use. Keep terminal prompts and command output in the CLI paths, and have the workflow return outcomes that callers can report and test. Preserve the differences between `init` and `update` while allowing `update` to offer installation of newly shipped Skills.

Use Nunjucks' standard syntax directly for rendering Stub text. Keep file reads, text/binary classification, and writes with installation, preserving current byte-for-byte copying behavior for files that must not be rendered.

## User Stories

1. As a project maintainer, I want `init` and `update` to use the same Skill reconciliation workflow, so that shared installation behavior is consistent.
2. As a Spindle maintainer, I want reconciliation outcomes returned to the CLI, so that terminal output remains separate from filesystem workflow behavior.
3. As a project maintainer, I want `init` to consider every shipped Stub, so that initial setup continues to install the full shipped Skill set.
4. As a project maintainer, I want `init` to treat any existing Skill directory as a conflict, so that existing files are not silently replaced.
5. As a project maintainer, I want `init` to keep overwrite and skip decisions per existing Skill, so that I can preserve some Skills and replace others.
6. As a project maintainer, I want overwritten Skills fully replaced, including removal of stale files, so that the installed Skill matches its Stub.
7. As a project maintainer, I want skipped Skills left untouched while other selected Skills install, so that one conflict does not block unrelated setup.
8. As a project maintainer, I want `init` to write Config even if every existing Skill is skipped, so that my selected Stacks and Variables are recorded.
9. As a project maintainer, I want `update` to compare each installed Skill version with its shipped Stub version, so that only outdated Skills are candidates for replacement.
10. As a project maintainer, I want Skills with current or newer versions to remain untouched, so that updates never downgrade or needlessly replace them.
11. As a project maintainer, I want an installed Skill with a missing or invalid version to be skipped with a warning, so that uncertain user-managed content is not overwritten.
12. As a project maintainer, I want an invalid shipped Stub version to stop the update with an explicit error, so that Spindle does not make an unsafe version decision.
13. As a project maintainer, I want interactive `update` to offer newly shipped Skills in a multi-select with all new Skills selected by default, so that I can adopt all or only some additions.
14. As a project maintainer, I want to be able to unselect every new Skill and continue, so that declining new additions does not cancel updates to existing Skills.
15. As a project maintainer, I want unchecked new Skills counted as skipped, so that the summary accounts for all Skills offered.
16. As a CI author, I want non-interactive `update` to leave new Skills uninstalled by default, so that upgrades do not silently expand the project's Skill set.
17. As a CI author, I want `--include-new` to select all new Skills and avoid the new-Skill prompt, so that I can opt in to adopting additions in automation and interactive runs.
18. As a CI author, I want the existing conflict policy to remain required for outdated Skills even when `--include-new` is used, so that selecting additions does not implicitly authorize replacing existing Skills.
19. As a project maintainer, I want new-Skill selection and outdated-Skill conflict decisions completed before filesystem writes, so that cancelling a prompt leaves installed Skills unchanged.
20. As a project maintainer, I want missing required Variables resolved only when at least one Skill will be installed or replaced, so that a no-op update does not block on unused rendering inputs.
21. As a project maintainer, I want update Variables resolved from Config first and manifest defaults second, so that existing project choices and defaults continue to work.
22. As a project maintainer, I want interactive `update` to prompt for required Variables missing from both Config and defaults, so that I can install or replace Skills that need those values.
23. As a CI author, I want non-interactive `update` to fail clearly before writes when a required Variable has no Config value or default, so that automation never hangs or partially applies a known-invalid update.
24. As a project maintainer, I want prompted Variable values used for every Skill installed or updated in that run, so that rendering has one consistent Config context.
25. As a project maintainer, I want prompted Variable answers saved to Config only after all selected Skills install successfully, so that Config does not record inputs from an unsuccessful reconciliation.
26. As a project maintainer, I want that Config write to preserve Stacks and all other Config values, so that updating missing Variables does not discard hand-edited or unrelated values.
27. As a project maintainer, I want an installation failure to stop further writes without rolling back earlier successful Skill changes, so that failure behavior is explicit and bounded.
28. As a project maintainer, I want a Config write failure reported while leaving successfully installed Skills in place, so that an error is visible without attempting unsafe rollback.
29. As a project maintainer, I want reconciliation to preserve symlink safety checks for `.github`, Skills, and Config paths, so that Spindle writes only within the project as intended.
30. As a project maintainer, I want the update summary to report new Skills added separately from existing Skills updated, so that I can distinguish adoption from upgrades.
31. As a project maintainer, I want one skipped total covering conflict skips, invalid-version skips, and new Skills I did not select, while retaining invalid-version warnings, so that the summary is concise without hiding important diagnostics.
32. As a Stub author, I want to write standard Nunjucks expressions, blocks, and comments, so that Stub rendering uses Nunjucks directly without a custom lexer patch.
33. As a Stub author, I want legacy custom `<%...%>` delimiters not interpreted as template syntax, so that there is only one supported template language.
34. As a Stub author, I want `{% raw %}` and `{% endraw %}` to preserve literal Nunjucks-like text such as VS Code placeholders, so that generated Skills can contain template-looking examples safely.
35. As a Stub author, I want rendering to remain unescaped and to fail on undefined values, so that output and error behavior remain predictable after the syntax migration.
36. As a project maintainer, I want only recognized UTF-8 text files to be rendered, so that installation does not reinterpret arbitrary file content.
37. As a project maintainer, I want binary, unsupported-extension, NUL-containing, and invalid-UTF-8 files copied byte-for-byte, so that assets are not corrupted by installation.
38. As a Spindle maintainer, I want rendering tests to focus on template text behavior and installation tests to cover file handling, so that failures localize to the behavior that changed.

## Implementation Decisions

- **Domain language:** Stub, Skill, Stack, Variable, and Config follow the existing glossary.
- **Reconciliation module:** a shared workflow owns Stub discovery, reconciliation rules, safe installation/replacement, and per-Skill outcomes. `init` and `update` retain CLI parsing, prompts, and output. Callers gather all required user decisions before passing them to the workflow for filesystem changes.
- **`init` behavior:** continue considering all shipped Stubs; any existing Skill directory is a conflict. Preserve per-Skill overwrite/skip decisions, full replacement on overwrite, and Config creation even when every existing Skill is skipped.
- **`update` existing-Skill behavior:** only installed Skills are version-compared. A strictly newer shipped version is outdated and follows the selected conflict policy; equal or newer installed versions remain unchanged. Missing or invalid installed versions are warned and counted as skipped. An invalid shipped version is an error.
- **New Skills in `update`:** interactive runs show a multi-select with every new Skill checked by default; selecting none is allowed. Unselected Skills count as skipped. `--include-new` selects all new Skills and bypasses the selection prompt in both interactive and non-interactive runs. Without the flag, non-interactive runs leave new Skills uninstalled. This option does not choose a conflict policy for outdated installed Skills.
- **Prompt and write ordering:** discover and classify Skills, collect new-Skill selections and outdated-Skill conflict decisions, then resolve missing required Variables if any Skill is selected for installation or replacement. Complete every prompt and validation before writing Skills. Cancelling a prompt cancels the command before Skill changes.
- **Variable resolution:** use stored Config values, then manifest defaults, then interactive prompts for missing required values. In non-interactive mode, a missing required value is an error before writes. The manifest is global, so all required missing Variables are resolved whenever any Skill will be rendered, regardless of which Stub may reference each Variable. The resulting Variable values are shared across all Skills changed in the run.
- **Config persistence:** `update` normally leaves Config untouched. If prompted Variable answers are needed, merge only those answers into the existing Config after all selected Skill installations/replacements succeed, preserving Stacks and all other Config values. Do not write prompted answers when installation fails. If the Config write fails, report the error and keep already installed Skills; do not roll back filesystem changes.
- **Failure handling:** an installation failure stops further Skill writes and is surfaced through the existing CLI error path. Earlier successful writes and any partial filesystem state are not rolled back.
- **Outcome reporting:** return enough per-Skill outcomes for callers to report newly added, updated, skipped, and up-to-date counts. Keep one skipped total; retain warnings for installed Skills with missing or invalid versions. `init` retains its existing installed/skipped summary behavior.
- **Path safety:** preserve symlink checks for `.github`, its Skills directory, Config, and affected Skill paths before filesystem changes.
- **Rendering module:** render Stub text using Nunjucks' standard syntax and native Environment; remove global lexer mutation and custom delimiters. Rendering operates on text and does not read or classify files.
- **Rendering behavior:** preserve disabled autoescaping and errors for undefined values. Use Nunjucks raw blocks for literal Nunjucks-like content. Do not support the legacy `<%...%>` delimiters as template syntax.
- **Installation behavior:** installation reads files, decides whether each file is renderable text, invokes rendering for recognized UTF-8 text, and writes rendered text or copies files byte-for-byte when they are binary, unsupported, contain NUL bytes, or are not valid UTF-8.
- **CLI interface:** add and document `update --include-new`; preserve existing `--on-conflict` and `--no-interactive` behavior for outdated Skills.

## Testing Decisions

- Tests observe behavior through the highest practical seams and assert outcomes rather than internal helper calls or collaborator structure.
- Test reconciliation through its module interface: new Skills added or skipped, outdated Skills overwritten or skipped, current/newer Skills unchanged, invalid installed versions warned and skipped, invalid shipped versions rejected, symlink paths refused, outcome counts, and stop-on-failure behavior.
- Keep CLI tests at the command seam for prompt selection and cancellation, `--include-new`, non-interactive policy requirements, Variable prompting and Config persistence, error reporting, and summaries.
- Test rendering through text input and rendered text output: standard Nunjucks expressions/blocks/comments, raw blocks preserving literal placeholders, disabled autoescaping, undefined-value errors, and legacy custom delimiters not being interpreted.
- Test installation file behavior separately: recognized UTF-8 text is rendered; binary, unsupported-extension, NUL-containing, and invalid-UTF-8 inputs remain byte-identical.
- Prior art includes the existing end-to-end CLI tests for update version decisions, Config validation and Variable resolution, symlink protection, rendering outcomes, nested Stub files, and binary-file preservation.
- Preserve existing behavioral assertions while moving coverage to the confirmed reconciliation, CLI, rendering, and installation seams.

## Out of Scope

- Changing the domain meaning or schema of Stacks, Variables, or Config beyond persisting newly prompted Variable values.
- Adding per-Skill Variable manifests or attempting to infer which Variables each Stub uses.
- Rolling back successful or partial filesystem changes after a later Skill installation or Config write failure.
- Supporting both Nunjucks and the old custom `<%...%>` delimiter syntax.
- Changing Stub version format or the rule that a strictly newer shipped version is required to update an installed Skill.
- Reworking unrelated CLI commands, packaging, or project documentation beyond help text and directly relevant Stub/template fixtures.

## Further Notes

- No ADR currently records a conflicting decision in this area.
- The behavior and test seams in this spec were confirmed during the architecture review and grilling conversation. No concrete module interface shape is prescribed here.
