# Keep the tooling registry in Config

Tooling commands are documentation for agents, not commands Spindle executes. Store the explicit, keyed registry in `.github/spindle.json` and generate `docs/agents/tooling.md` from it. The Tooling context owns registry operations and guide generation; the Config remains its persistence format. Project initialization is performed by `spindle init` only after selected Blueprints are installed.
