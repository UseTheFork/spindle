---
name: setup-project
description: "Use when configuring a project's local Markdown issues, triage-role mapping, domain documentation, or Just-based agent tooling instructions."
disable-model-invocation: false
user-invocable: true
meta:
  spindle:
    version: 1.1.0
---

# Setup Project

Configure the repository conventions that its engineering skills assume. The issue tracker is always local Markdown under `.scratch/`, and `triage` and Just are always installed. Build, test, lint, and formatting commands are proxied through Just; invoke Spindle workflow commands directly through the CLI.

Always configure the Markdown issue-tracker instructions, both category-role values, and the five triage-state mappings. For local Markdown, `Category:` records `bug` or `enhancement`, `Status:` records the triage state, and `Execution:` remains delivery progress.

## Process

### 1. Bootstrap

First run the non-destructive Spindle setup command against the absolute project root:

```sh
spindle setup-project --workspace /absolute/project/root
```

The Spindle CLI creates `docs/adr/`, `.scratch/`, and `docs/agents/`, then supplies its bundled defaults for `docs/agents/domain.md`, `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/agents/tooling.md`. Existing regular files are preserved unchanged; symlinked destinations and file/directory conflicts fail explicitly. It neither creates glossary content nor edits Copilot instructions.

Read the JSON `workspace`, `created`, and `preserved` fields. On a nonzero exit, report the error and stop; partial setup may remain, so resolve the conflict and rerun safely.

**Complete when:** the script succeeds and all required directories and four documentation files exist. These are defaults, not a completed project configuration; tooling commands are not yet verified.

### 2. Explore

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `.github/copilot-instructions.md` at the repo root: does it exist? Is there already an `## Agent skills` section?
- `GLOSSARY.md` and `GLOSSARY-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/agents/`: use the bootstrap result to distinguish copied defaults from preserved project customizations.
- `.scratch/` and existing issue-tracker docs: reuse any local Markdown conventions already present.
- The root `justfile` and its imported/included recipe files: follow module aliases, recipe parameters and working-directory settings. From that root run `just --list --list-submodules` and use `just --show <qualified-recipe>` as needed to confirm available public commands and their forwarding behavior. Read the backing runner configuration to verify example flags and test-suite names; recipe existence alone does not validate arguments. Do not execute setup, installs, tests or other mutating recipes merely to discover them.
- Monorepo signals: a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. These are present only in a genuinely large multi-package repo; their absence means single-context, which is almost every repo.

**Complete when:** existing configuration and available Just commands are accounted for, including aliases, supported arguments and runner-specific test selectors. A missing Justfile, unresolved import or failed listing is a reported tooling blocker, not permission to present template commands as available. Continue only once resolved; do not claim completed setup with an unverified tooling inventory.

### 3. Present findings and ask

Summarise what's present and what's missing. Use local Markdown under `.scratch/` as the issue tracker without asking the user to choose a tracker. Then take any variable choices in order, one section and one answer at a time.

Lead each question with the recommended answer so the user can accept it in a word. Give a one-line explainer only when the choice genuinely branches. Skip Section C when there are no monorepo signals.

**Section A: Issue tracker (fixed convention).**

Always record local Markdown tracking under `.scratch/YYYY-MM-DD-<feature-slug>/` in `docs/agents/issue-tracker.md`. Use the Spindle-provided default as a starting point, include the creation-date and stable-directory rules, and use the dated path format in the `### Issue tracker` navigation summary. A GitHub or GitLab remote does not change this convention.

**Section B: Triage-role mappings.** `triage` is always installed, so always configure both category roles and all five state roles in `docs/agents/triage-labels.md`, using the Spindle-provided default as a starting point. For the local Markdown tracker, map categories to `Category:` values and states to `Status:` values.

Ask exactly one question:

> Do you want to keep the default triage labels? (recommended: **yes**)

The five default state labels are the state roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Category values remain `bug` and `enhancement` in `Category:`. On **yes**, write the state labels as-is. Only if the user says no, usually because their tracker already uses other names (e.g. `bug:triage` for `needs-triage`), collect the state-label overrides so `triage` applies existing labels instead of creating duplicates.

**Section C: Domain docs.** Default to **single-context** (one `GLOSSARY.md` + `docs/adr/` at the repo root). This fits almost every repo; write it without asking.

Offer **multi-context** (a root `GLOSSARY-MAP.md` pointing to per-context `GLOSSARY.md` files) only when exploration found monorepo signals. Then confirm which layout they want.

**Section D: Project tooling (discovered configuration).** Use the Spindle-provided default as a starting structure for `docs/agents/tooling.md`. Keep the mandatory Just policy and the Linting, Formatting, Type checking, Tooling and Testing sections. Retain only available, verified recipes; add other relevant public project commands to the appropriate section using their actual qualified names and argument syntax. Describe `*args` as forwarded arguments, not literal input. Mark a section with no available recipe explicitly rather than inventing a command. Include focused/suite examples only when the configured runner supports the flags and those suites exist; adapt non-Pest selectors. Optional modules absent from the project do not make their commands available. Preserve existing project-specific tooling guidance and reconcile differences in the draft rather than replacing it with defaults.

### 4. Confirm and edit

Show the user a draft of:

- The `## Agent skills` block to add to whichever of `.github/copilot-instructions.md` is being edited (see step 5 for selection rules)
- The contents of `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, and `docs/agents/domain.md`, including the `Reporter:`, `Category:`, `Status:`, and comment author/timestamp conventions
- `docs/agents/tooling.md`, with commands tailored to the verified Just inventory, and an `## Project Tooling` pointer in Copilot instructions. If inline tooling instructions already exist, show how their project-specific content is retained in the tooling doc and replaced by the pointer after approval, avoiding competing command lists.

Let them edit before applying configuration changes beyond the bootstrap defaults. Preserve unrelated existing customizations.

### 5. Write

**Pick the file to edit:**

- If `.github/copilot-instructions.md` exists, edit it.
- If `.github/copilot-instructions.md` does not exist, create it.

Never create `.github/copilot-instructions.md` when it already exists; always edit the one that's already there.

If an `## Agent skills` block already exists in the `copilot-instructions.md` file, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections.

The block:

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked]. See `docs/agents/issue-tracker.md`.

### Triage labels

[one-line summary of the label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[one-line summary of layout: "single-context" or "multi-context"]. See `docs/agents/domain.md`.
```

Always include the `### Triage labels` sub-block and apply the Section B mappings.

Add or update this separate navigation section in `.github/copilot-instructions.md`:

```markdown
## Project Tooling

You MUST use the JUST commands over the regular commands. Before running project commands, read [Project tooling](../docs/agents/tooling.md) for available commands and usage.
```

Update an existing tooling section in place; after approval, move its command details into `docs/agents/tooling.md` without losing custom guidance. Keep one authoritative command list and one pointer, preserving unrelated instructions.

Update the bootstrapped docs with the approved configuration, preserving existing project-specific content. Spindle supplies the default issue-tracker, triage-label, domain, and tooling documentation through its CLI; those defaults are not package-internal Skill assets.

### 6. Verify and finish

Confirm the directories and all four configured docs exist, the approved label/domain choices match their contents, and the Copilot navigation points to those docs without duplicate sections. Recheck the final tooling entries against the root Justfile and loaded recipe inventory, including supported arguments and test selectors; confirm the relative tooling link resolves from `.github/copilot-instructions.md`. Preserve custom content and report any unavailable command or unresolved tooling check. Bootstrap success alone does not establish these checks.

Tell the user the setup is complete and which engineering skills will now read from these files. Mention they can edit `docs/agents/*.md` directly later; re-running this skill is only necessary if they want to switch issue trackers or restart from scratch.
