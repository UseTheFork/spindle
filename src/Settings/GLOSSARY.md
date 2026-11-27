# Settings

Settings owns the user-facing workflow for viewing and changing Project Settings.
Blueprint Management applies those changes through its update workflow, and
Template Rendering derives commit guidance from Project Settings.

## Language

**Project Settings**:
The `.spindle/config.json` file holding the project's selected Stacks, preferred
Spindle package-manager command, registered tooling commands, commit guidance
settings, VS Code integration opt-in, and Model Profiles.

_Avoid_: Config

**Model Profile**:
A named, workload-based, ordered list of preferred models that Spindle assigns
to selected Agents. Users change a profile's models, not which Agents use it.
_Avoid_: Tier, model tier

**Commit settings**:
Project Settings that control the Conventional Commits guidance rendered
into a public Reference Skill.
