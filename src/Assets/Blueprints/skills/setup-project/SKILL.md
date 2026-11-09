---
name: setup-project
description: "Use when initializing project guidance or curating documented tooling commands."
disable-model-invocation: false
user-invocable: true
metadata:
  spindle:
    version: 1.2.0
---

# Setup Project

Initialize the project guidance and curate the commands agents should use. Project tooling varies by repository; register only commands that have been inspected and verified. The tooling registry in `.github/spindle.json` is authoritative, and Spindle regenerates `docs/agents/tooling.md` from it. These entries document commands; Spindle does not execute them.

## Process

### 1. Initialize project guidance

Run from the target Git working tree:

```sh
spindle project init
```

The command infers the Git root and fails if it cannot. It creates missing project documentation directories, copies the bundled `docs/agents/domain.md` and `docs/agents/ticket-tracker.md` templates when those files are absent, and prepends the bundled Copilot instructions to the front of `.github/copilot-instructions.md` when their exact text does not occur anywhere in that file. Existing instructions are retained, and template text already present anywhere is not duplicated. It initializes the tooling registry with Spindle commands when the registry is new, and regenerates `docs/agents/tooling.md`. Existing tooling entries are preserved.

**Complete when:** initialization succeeds and the command's output confirms the project root and generated tooling guide.

### 2. Explore the project and its conventions

Read `docs/agents/domain.md`, the relevant glossary and ADRs, and existing project guidance. Inspect the repository's package manifests, task runner configuration, and test/build configuration to identify candidate commands. Do not treat discovery as registration: decide which commands are useful to agents and verify their names and argument forms against their configuration.

**Complete when:** each candidate command selected for the guide has a verified invocation and a clear documentation section.

### 3. Curate the tooling registry

List the current entries and keys:

```sh
spindle project tooling list
```

For each verified project command, add one entry with a stable kebab-case key, a section, and command text. Add a description when it helps an agent choose or use the command:

```sh
spindle project tooling add \
  --key test-unit \
  --section Testing \
  --command "pnpm test -- --run" \
  --description "Run the focused unit tests."
```

Use `spindle project tooling update <key>` to change an existing entry and `--clear-description` to explicitly remove its description. Use `spindle project tooling remove <key>` to remove an obsolete command. Each successful add, update, or remove regenerates `docs/agents/tooling.md`. Commands are grouped by section; sections with no commands are omitted.

Do not register speculative commands, commands that have not been verified, or every command merely because it exists. Do not execute a project command just to document it if execution could install dependencies, mutate data, or otherwise have side effects without authorization.

**Complete when:** each intended command has one registry entry, obsolete entries are removed, and the generated guide matches the registry.

### 4. Verify the generated guide

Run `spindle project tooling list` and inspect `docs/agents/tooling.md`. Confirm all registered commands and descriptions appear under the intended sections. The guide is generated output; make changes through the registry rather than editing the Markdown directly.

**Complete when:** the registry and generated guide agree, and any project-specific command limitations are explicit.
