# Spindle

A CLI that scaffolds and maintains a project's `.github` directory from Blueprints, tailored by the Stacks and Variables the user provides.

## Language

**Blueprint**:
A definition for a kind of spindle-managed content, such as a Skill, Instruction, or Agent. A Blueprint may include guidance tailored to one or more Stacks.
_Avoid_: Stub

**Blueprint Catalog**:
The inventory of named Blueprint selections, their lifecycle status, and the
Stacks they apply to. A selection can contain multiple independently updated
Blueprints.

**Selected directory membership**:
The files present in a catalog-selected source directory. Its installed
destination subtree is authoritative: files absent from the source, including
local additions, are removed during reconciliation.

**Skill**:
A rendered directory under `.github/skills/` in the user's repo, led by a `SKILL.md` that carries a `version`.
_Avoid_: Installed Blueprint

**Agent**:
A custom assistant with a specialized role, instructions, and optional tools.

**Instruction**:
Guidance automatically included for work matching its declared scope.

**Stack**:
An opinionated language-and-framework choice the user selects during `init`, such as PHP (Laravel), Python or TypeScript.
_Avoid_: Language, framework

**Variable**:
A named value the user supplies for use in Blueprints.
_Avoid_: Setting, parameter

**Config**:
The `.github/spindle.json` file holding the user's selected stacks and variables.
_Avoid_: Settings file, manifest
