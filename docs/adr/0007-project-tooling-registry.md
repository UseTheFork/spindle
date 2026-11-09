# Keep project tooling commands in Config

Project tooling commands are documentation for agents, not commands Spindle executes. Store the explicit, keyed registry in `.github/spindle.json` and generate `docs/agents/tooling.md` from it. This keeps command maintenance with the existing project configuration while allowing Project initialization before any Blueprint Stack is selected; Blueprint rendering still requires at least one Stack.
