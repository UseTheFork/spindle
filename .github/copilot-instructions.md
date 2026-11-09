## Agent skills

### Issue tracker

Repository triage requests are tracked as local Markdown under `.scratch/YYYY-MM-DD-<feature-slug>/`; SDD specs and tickets live in numbered `.scratch/<feature-id>-<feature-slug>/` workspaces. See `docs/agents/issue-tracker.md` and `docs/agents/ticket-tracker.md` for their conventions.

### Triage labels

Use `Category: bug|enhancement` and the five canonical state values in `Status:`. See `docs/agents/triage-labels.md`.

### Domain docs

This is a multi-context repo; use `GLOSSARY-MAP.md` to find the relevant context glossary and consult `docs/adr/` for cross-context decisions. See `docs/agents/domain.md`.

## Project Tooling

You MUST use Just recipes instead of invoking the underlying tools directly. Before running project commands, read `docs/agents/tooling.md` for the available recipes and usage. Just selects the correct working directory.
