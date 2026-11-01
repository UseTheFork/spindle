# Spindle

A CLI that scaffolds and maintains a project's `.github` directory from Blueprints, tailored by the Stacks and Variables the user provides.

## Language

**Blueprint**:
A definition for a kind of spindle-managed content, such as a Skill, Instruction, or Agent. A Blueprint may include guidance tailored to one or more Stacks.
_Avoid_: Stub

**Skill**:
A rendered directory under `.github/skills/` in the user's repo, led by a `SKILL.md` that carries a `version`.
_Avoid_: Installed Blueprint

**Agent**:
A custom assistant configuration with a specialized role, instructions, and available tools.

**Instruction**:
A guidance document automatically included for work matching its declared scope.

**Stack**:
An opinionated language-and-framework choice the user selects during `init`, such as PHP (Laravel), Python or TypeScript.
_Avoid_: Language, framework

**Variable**:
A named value the user supplies for use in Blueprints.
_Avoid_: Setting, parameter

**Config**:
The `.github/spindle.json` file holding the user's selected stacks and variables.
_Avoid_: Settings file, manifest
